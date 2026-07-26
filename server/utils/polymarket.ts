import { getContractConfig } from '@polymarket/clob-client-v2'

export const POLYGON_CHAIN_ID = 137

export const CLOB_HOST = 'https://clob.polymarket.com'
export const GAMMA_HOST = 'https://gamma-api.polymarket.com'

export const ORDERBOOK_SUBGRAPH
  = 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/orderbook-subgraph/prod/gn'

// polygon-rpc.com answers "tenant disabled" (403) as of 2026-07-26 — do not add it back.
export const POLYGON_RPCS = [
  'https://polygon-bor-rpc.publicnode.com',
  'https://polygon.drpc.org',
]

// docs.polymarket.com/resources/contracts, cross-checked against getContractConfig(137) of SDK v2.
// negRiskAdapter is 0xd91E…5296 there: SPEC.md calls it deprecated, but it is the address the
// official SDK uses and it carries 34,518 bytes of bytecode on Polygon.
export const contracts = getContractConfig(POLYGON_CHAIN_ID)

export const CONDITIONAL_TOKENS = contracts.conditionalTokens
export const NEG_RISK_EXCHANGE_V2 = contracts.negRiskExchangeV2
export const NEG_RISK_ADAPTER = contracts.negRiskAdapter
export const COLLATERAL = contracts.collateral

export const COLLATERAL_ONRAMP = '0x93070a847efEf7F70739046A929D47a521F5B8ee'
export const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'

export const DAILY_TEMPERATURE_TAG = 'daily-temperature'
