export type Peril = 'heat' | 'cold'

export type Unit = 'C' | 'F'

export type BucketKind = 'below' | 'range' | 'tail'

/** lo === null for the “X or below” bucket, hi === null for “X or higher”. */
export interface Bucket {
  tokenId: string
  conditionId: string
  outcome: string
  kind: BucketKind
  lo: number | null
  hi: number | null
  bestAsk: number | null
}

export interface CoverEvent {
  slug: string
  title: string
  city: string
  peril: Peril
  unit: Unit
  endDate: string
  negRisk: boolean
  buckets: Bucket[]
}

export interface BasketLeg {
  tokenId: string
  conditionId: string
  outcome: string
  shares: number
  price: number
  cost: number
}

export interface Basket {
  eventSlug: string
  peril: Peril
  threshold: number
  unit: Unit
  payoutUsdc: number
  legs: BasketLeg[]
  premium: number
  fees: number
  impliedProbability: number
  signatures: number
  tailOnly: boolean
  warnings: string[]
}

export interface BucketResolution {
  conditionId: string
  outcome: string
  resolved: boolean
  yesWon: boolean | null
}

export interface EventResolution {
  slug: string
  resolved: boolean
  settledOutcome: string | null
  buckets: BucketResolution[]
}
