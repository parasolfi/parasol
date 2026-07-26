import type { ApiKeyCreds, OrderResponse, TickSize } from '@polymarket/clob-client-v2'
import { ClobClient, OrderType, SignatureTypeV2, Side } from '@polymarket/clob-client-v2'
import { createWalletClient, custom } from 'viem'
import { polygon } from 'viem/chains'

const CLOB_HOST = 'https://clob.polymarket.com'

// clob.polymarket.com answers access-control-allow-origin: * on POST /order,
// so the browser posts signed orders itself. Parasol never relays them.
export interface ExecutableLeg {
  tokenId: string
  conditionId: string
  label: string
  shares: number
  limitPrice: number
}

export interface LegExecution {
  leg: ExecutableLeg
  orderId: string | null
  status: string | null
  error: string | null
}

interface MarketRules {
  tickSize: number
  minOrderSize: number
  negRisk: boolean
  geoBlocked: boolean
}

const TICK_SIZES: TickSize[] = ['0.1', '0.01', '0.005', '0.0025', '0.001', '0.0001']

function toTickSize(value: number): TickSize {
  return TICK_SIZES.find(tick => Number(tick) === value) ?? '0.01'
}

export function useClob() {
  const address = useState<`0x${string}` | null>('clob:address', () => null)
  const authenticated = useState('clob:authenticated', () => false)

  // L2 creds live in memory only: never localStorage, they die with the tab.
  let creds: ApiKeyCreds | null = null
  let client: ClobClient | null = null

  function provider() {
    const injected = (window as { ethereum?: unknown }).ethereum
    if (!injected) throw new Error('no wallet: connect one to execute on Polymarket')
    return injected as Parameters<typeof custom>[0]
  }

  async function connect() {
    const transport = custom(provider())
    const wallet = createWalletClient({ chain: polygon, transport })

    const [account] = await wallet.requestAddresses()
    if (!account) throw new Error('wallet connected but no account available')

    await wallet.switchChain({ id: polygon.id }).catch(async (err: unknown) => {
      if ((err as { code?: number }).code !== 4902) throw err
      await wallet.addChain({ chain: polygon })
    })

    address.value = account
    client = new ClobClient({
      host: CLOB_HOST,
      chain: polygon.id,
      signer: createWalletClient({ account, chain: polygon, transport }),
      signatureType: SignatureTypeV2.EOA,
      funderAddress: account,
    })

    return account
  }

  /** L1 auth: a free off-chain EIP-712 signature that derives the L2 HMAC creds. */
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
   * One signature per leg, capped at the limit price the quote walked the book
   * to. If the book drifted past it the order rests unfilled rather than
   * costing more than the holder authorized — same ceiling logic as maxPremium.
   */
  async function executeBasket(legs: ExecutableLeg[]): Promise<LegExecution[]> {
    if (!client || !creds) await authenticate()
    if (!client) throw new Error('CLOB client unavailable')

    const executions: LegExecution[] = []

    for (const leg of legs) {
      try {
        const rules = await $fetch<MarketRules>('/api/market-rules', {
          query: { conditionId: leg.conditionId },
        })
        if (rules.geoBlocked) throw new Error('venue is geoblocked from here — use fork mode')
        if (leg.shares < rules.minOrderSize)
          throw new Error(`below minimum size (${rules.minOrderSize})`)

        const signed = await client.createOrder(
          { tokenID: leg.tokenId, price: leg.limitPrice, size: leg.shares, side: Side.BUY },
          { tickSize: toTickSize(rules.tickSize), negRisk: rules.negRisk },
        )

        const response: OrderResponse = await client.postOrder(signed, OrderType.GTC)
        executions.push({
          leg,
          orderId: response.orderID ?? null,
          status: response.status ?? null,
          error: response.success ? null : response.errorMsg,
        })
      }
      catch (err) {
        executions.push({
          leg,
          orderId: null,
          status: null,
          error: err instanceof Error ? err.message : String(err),
        })
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
    executeBasket,
    orderStatus,
    cancel,
  }
}
