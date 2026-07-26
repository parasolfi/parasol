import { Address, BigDecimal, BigInt, Bytes } from '@graphprotocol/graph-ts'
import {
  ConditionPreparation,
  ConditionResolution,
} from '../generated/ConditionalTokens/ConditionalTokens'
import { Market, Outcome, Resolution } from '../generated/schema'

const VENUE = 'polymarket'

// Both adapters ultimately settle from UMA. NegRiskAdapter is the oracle on
// every bucketed market — the ones a UMA-adapter-only subgraph never sees.
const NEG_RISK_ADAPTER = '0xd91e80cf2e7be2e162c6513ced06f1dd0da35296'
const UMA_CTF_ADAPTER = '0x2f5e3684cb1f318ec51b00edba38d79ac2c0aa9d'

function marketId(conditionId: Bytes): string {
  return VENUE + '-' + conditionId.toHexString()
}

function resolutionSource(oracle: Address): string {
  const addr = oracle.toHexString().toLowerCase()
  if (addr == NEG_RISK_ADAPTER || addr == UMA_CTF_ADAPTER) return 'UMA'
  return addr
}

function createMarket(
  conditionId: Bytes,
  oracle: Address,
  questionId: Bytes,
  outcomeSlotCount: i32,
  block: BigInt,
  timestamp: BigInt,
): Market {
  const id = marketId(conditionId)
  const market = new Market(id)
  market.venue = VENUE
  market.venueConditionId = conditionId.toHexString()
  market.questionId = questionId
  market.question = null
  market.outcomeSlotCount = outcomeSlotCount
  market.oracle = oracle
  market.createdAtBlock = block
  market.createdAtTimestamp = timestamp
  market.save()

  for (let i = 0; i < outcomeSlotCount; i++) {
    const outcome = new Outcome(id + '-' + i.toString())
    outcome.market = id
    outcome.outcomeIndex = i
    outcome.label = 'Outcome ' + i.toString()
    outcome.impliedProbability = BigDecimal.zero()
    outcome.lastUpdatedAt = timestamp
    outcome.lastUpdatedBlock = block
    outcome.venueOutcomeId = null
    outcome.volume = BigDecimal.zero()
    outcome.tradeCount = 0
    outcome.rawInverseOdds = null
    outcome.save()
  }

  return market
}

export function handleConditionPreparation(event: ConditionPreparation): void {
  createMarket(
    event.params.conditionId,
    event.params.oracle,
    event.params.questionId,
    event.params.outcomeSlotCount.toI32(),
    event.block.number,
    event.block.timestamp,
  )
}

export function handleConditionResolution(event: ConditionResolution): void {
  const id = marketId(event.params.conditionId)

  // A condition prepared before startBlock has no Market yet. Backfilling one
  // here keeps the resolution reachable instead of stranding it behind a
  // dangling reference — a consumer asking by venueConditionId still gets an
  // answer, which is the whole point of indexing this.
  let market = Market.load(id)
  if (market == null) {
    market = createMarket(
      event.params.conditionId,
      event.params.oracle,
      event.params.questionId,
      event.params.outcomeSlotCount.toI32(),
      event.block.number,
      event.block.timestamp,
    )
  }

  const payouts = event.params.payoutNumerators
  let winningIndex: i32 = -1
  let winners: i32 = 0
  for (let i: i32 = 0; i < payouts.length; i++) {
    if (payouts[i].gt(BigInt.zero())) {
      winners = winners + 1
      winningIndex = i
    }
  }

  const resolution = new Resolution(id)
  resolution.market = id
  resolution.status = 'Resolved'
  resolution.resolutionSource = resolutionSource(event.params.oracle)
  // A split payout has no single winner; report none rather than the last one.
  // The generated setter takes a plain i32, so assigning null would silently
  // store 0 — "outcome 0 won". unset() is the only way to leave it null.
  if (winners == 1) {
    resolution.winningOutcomeIndex = winningIndex
  } else {
    resolution.unset('winningOutcomeIndex')
  }
  resolution.finalizedAt = event.block.timestamp
  resolution.save()
}
