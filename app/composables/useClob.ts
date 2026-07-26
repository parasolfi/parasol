import type { ApiKeyCreds, OrderResponse, TickSize } from '@polymarket/clob-client-v2'
import type { EIP1193Provider } from 'viem'
import type { Basket, BasketLeg } from '~~/shared/types/cover'
import { ClobClient, OrderType, SignatureTypeV2, Side } from '@polymarket/clob-client-v2'
import { createWalletClient, custom } from 'viem'
import { polygon } from 'viem/chains'

const CLOB_HOST = 'https://clob.polymarket.com'

export interface LegExecution {
  leg: BasketLeg
  response: OrderResponse | null
  error: string | null
}

function injectedProvider(): EIP1193Provider {
  const provider = (globalThis as { ethereum?: EIP1193Provider }).ethereum
  if (!provider) throw new Error('No injected wallet detected')
  return provider
}

export function useClob() {
  const address = useState<`0x${string}` | null>('clob:address', () => null)
  const authenticated = useState('clob:authenticated', () => false)

  // L2 creds stay in memory: never localStorage, they do not outlive the tab.
  let creds: ApiKeyCreds | null = null
  let client: ClobClient | null = null

  async function connect() {
    const provider = injectedProvider()
    const wallet = createWalletClient({ chain: polygon, transport: custom(provider) })

    const [account] = await wallet.requestAddresses()
    if (!account) throw new Error('Wallet connected but no account available')

    await wallet.switchChain({ id: polygon.id }).catch(async (error: unknown) => {
      const code = (error as { code?: number }).code
      if (code === 4902) {
        await wallet.addChain({ chain: polygon })
        return
      }
      throw error
    })

    address.value = account
    client = new ClobClient({
      host: CLOB_HOST,
      chain: polygon.id,
      signer: createWalletClient({ account, chain: polygon, transport: custom(provider) }),
      signatureType: SignatureTypeV2.EOA,
      funderAddress: account,
    })

    return account
  }

  /** L1 auth: off-chain EIP-712 signature, free, derives the L2 HMAC creds. */
  async function authenticate() {
    if (!client) await connect()
    if (!client) throw new Error('CLOB client unavailable')

    creds = await client.createOrDeriveApiKey()

    client = new ClobClient({
      host: CLOB_HOST,
      chain: polygon.id,
      signer: client.signer,
      creds,
      signatureType: SignatureTypeV2.EOA,
      funderAddress: address.value ?? undefined,
    })

    authenticated.value = true
    return creds
  }

  /**
   * One signature per leg, at the limit price frozen by the quote: if the book drifted
   * past it, the order goes unfilled rather than costing more than what was shown.
   */
  async function coverMe(
    basket: Basket & { expiresAt?: string },
    negRisk: boolean,
    tickSize: TickSize = '0.01',
  ): Promise<LegExecution[]> {
    if (basket.expiresAt && Date.parse(basket.expiresAt) < Date.now()) {
      throw new Error('Quote expired — refresh it before signing')
    }

    if (!client || !creds) await authenticate()
    if (!client) throw new Error('CLOB client unavailable')

    const executions: LegExecution[] = []

    for (const leg of basket.legs) {
      try {
        const signed = await client.createOrder(
          {
            tokenID: leg.tokenId,
            price: leg.price,
            size: leg.shares,
            side: Side.BUY,
          },
          { tickSize, negRisk },
        )

        const response = await client.postOrder(signed, OrderType.GTC)
        executions.push({ leg, response, error: response.success ? null : response.errorMsg })
      }
      catch (error) {
        executions.push({ leg, response: null, error: error instanceof Error ? error.message : String(error) })
      }
    }

    return executions
  }

  async function orderStatus(orderId: string) {
    if (!client) throw new Error('CLOB client unavailable')
    return client.getOrder(orderId)
  }

  async function cancel(orderIds: string[]) {
    if (!client) throw new Error('CLOB client unavailable')
    return client.cancelOrders(orderIds)
  }

  return {
    address: readonly(address),
    authenticated: readonly(authenticated),
    connect,
    authenticate,
    coverMe,
    orderStatus,
    cancel,
  }
}
