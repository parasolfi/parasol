import type { ApiKeyCreds, OrderResponse, TickSize } from '@polymarket/clob-client-v2'
import type { Address } from 'viem'
import { ClobClient, OrderType, SignatureTypeV2, Side } from '@polymarket/clob-client-v2'
import { createPublicClient, createWalletClient, custom, http, parseAbi } from 'viem'
import { polygon } from 'viem/chains'

const CLOB_HOST = 'https://clob.polymarket.com'

// viem's default transport for polygon is polygon-rpc.com, which answers
// "tenant disabled" (403) as of 2026-07-26: every balance and allowance read
// below threw before the wallet was ever asked to sign. Same endpoint the
// server and the add-chain payload use.
const POLYGON_RPC = 'https://polygon-bor-rpc.publicnode.com'

// NegRiskCtfExchangeV2.getCollateral() returns pUSD, read on-chain — the
// exchange settles in pUSD only, so USDC.e has to be wrapped before it can back
// an order. Verified against docs.polymarket.com/resources/contracts.
const USDCE: Address = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
const PUSD: Address = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB'
const COLLATERAL_ONRAMP: Address = '0x93070a847efEf7F70739046A929D47a521F5B8ee'
const NEG_RISK_EXCHANGE_V2: Address = '0xe2222d279d744050d28e00520010520000310F59'

const erc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
])

// wrap takes the asset and a recipient — SPEC.md §4.1 writes wrap(amount),
// which does not exist. Selector 0x62355638, confirmed in the deployed bytecode.
const onrampAbi = parseAbi(['function wrap(address asset, address to, uint256 amount)'])

export interface OnboardingStep {
  step: 'approve-usdce' | 'wrap' | 'approve-exchange'
  txHash: string
}

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

  /**
   * Brings the wallet to a state where it can back an order, and does no more
   * than that: each step is skipped when already satisfied. A wallet funded
   * directly in pUSD never wraps; one whose allowance already covers the
   * premium never re-approves. Every transaction is the holder's own.
   */
  async function ensureCollateral(amountUsdc: number): Promise<OnboardingStep[]> {
    if (!client) await connect()
    const account = address.value
    if (!account) throw new Error('connect a wallet first')

    const amount = BigInt(Math.ceil(amountUsdc * 1e6))
    const reader = createPublicClient({ chain: polygon, transport: http(POLYGON_RPC) })
    const wallet = createWalletClient({ account, chain: polygon, transport: custom(provider()) })
    const done: OnboardingStep[] = []

    const pusd = await reader.readContract({ address: PUSD, abi: erc20Abi, functionName: 'balanceOf', args: [account] })

    if (pusd < amount) {
      const missing = amount - pusd
      const usdce = await reader.readContract({ address: USDCE, abi: erc20Abi, functionName: 'balanceOf', args: [account] })
      if (usdce < missing) {
        throw new Error(`needs ${Number(missing) / 1e6} more USDC.e to wrap (holding ${Number(usdce) / 1e6})`)
      }

      const onrampAllowance = await reader.readContract({
        address: USDCE, abi: erc20Abi, functionName: 'allowance', args: [account, COLLATERAL_ONRAMP],
      })
      if (onrampAllowance < missing) {
        const hash = await wallet.writeContract({
          address: USDCE, abi: erc20Abi, functionName: 'approve', args: [COLLATERAL_ONRAMP, missing],
        })
        await reader.waitForTransactionReceipt({ hash })
        done.push({ step: 'approve-usdce', txHash: hash })
      }

      const hash = await wallet.writeContract({
        address: COLLATERAL_ONRAMP, abi: onrampAbi, functionName: 'wrap', args: [USDCE, account, missing],
      })
      await reader.waitForTransactionReceipt({ hash })
      done.push({ step: 'wrap', txHash: hash })
    }

    const exchangeAllowance = await reader.readContract({
      address: PUSD, abi: erc20Abi, functionName: 'allowance', args: [account, NEG_RISK_EXCHANGE_V2],
    })
    if (exchangeAllowance < amount) {
      const hash = await wallet.writeContract({
        address: PUSD, abi: erc20Abi, functionName: 'approve', args: [NEG_RISK_EXCHANGE_V2, amount],
      })
      await reader.waitForTransactionReceipt({ hash })
      done.push({ step: 'approve-exchange', txHash: hash })
    }

    return done
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

  return {
    address: readonly(address),
    authenticated: readonly(authenticated),
    connect,
    ensureCollateral,
    authenticate,
    executeBasket,
  }
}
