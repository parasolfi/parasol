import { Address, BigDecimal, BigInt, log } from '@graphprotocol/graph-ts';
import { ConditionCreated, ConditionSettled } from '../generated/LiveCore/LiveCore';
import { AzuroOutcomeLookup, Market, Outcome, Resolution } from '../generated/schema';

const VENUE = 'azuro';

// Empirically observed on real ConditionSettled logs: exactly one outcome in
// `resolvedOutcomes` carries status 1 (the winner), the other(s) carry 0.
// This is ILiveCore.OutcomeStatus's underlying uint8 — not documented (the
// contract isn't verified), inferred from comparing several real settled
// conditions side by side, not from a spec.
const OUTCOME_STATUS_WON = 1;

// Azuro's odds are decimal odds, 1e12 fixed-point (confirmed empirically: a
// real on-chain ConditionCreated for a 2-way match decoded to odds
// [2.05, 1.75] — sane bookmaker decimal odds, ~6% overround, not noise).
const ODDS_SCALE = BigDecimal.fromString('1000000000000');

function marketId(conditionId: BigInt): string {
  return VENUE + '-' + conditionId.toString();
}

// Multiplicative de-vig: raw_i = (1/odds_i) / sum(1/odds_j). This strips the
// bookmaker margin baked into decimal odds, giving a probability comparable
// with Polymarket's trade price rather than a number systematically inflated
// by the overround. (Not the same as Azuro's own iterative margin algorithm —
// that goes the other direction, probability -> margin-inclusive odds; this
// is the simpler reverse case.)
function devigProbabilities(odds: BigInt[]): BigDecimal[] {
  const inverses: BigDecimal[] = [];
  let sumInverse = BigDecimal.zero();
  for (let i = 0; i < odds.length; i++) {
    const decimalOdds = odds[i].toBigDecimal().div(ODDS_SCALE);
    const inverse = BigDecimal.fromString('1').div(decimalOdds);
    inverses.push(inverse);
    sumInverse = sumInverse.plus(inverse);
  }
  const probabilities: BigDecimal[] = [];
  for (let i = 0; i < inverses.length; i++) {
    probabilities.push(inverses[i].div(sumInverse));
  }
  return probabilities;
}

export function handleConditionCreated(event: ConditionCreated): void {
  const conditionId = event.params.conditionId;
  const id = marketId(conditionId);
  const outcomeIds = event.params.outcomes; // raw Azuro outcome ids (uint128), positional order
  const odds = event.params.odds; // same order as outcomeIds

  if (outcomeIds.length != odds.length || outcomeIds.length == 0) {
    return;
  }

  const market = new Market(id);
  market.venue = VENUE;
  market.venueConditionId = conditionId.toString();
  market.questionId = null;
  market.question = null;
  market.outcomeSlotCount = outcomeIds.length;
  // No oracle address available from this event — LiveCore's ConditionCreated
  // doesn't carry one (unlike CTF's ConditionPreparation). Left as the zero
  // address rather than guessed.
  market.oracle = Address.zero();
  market.createdAtBlock = event.block.number;
  market.createdAtTimestamp = event.block.timestamp;
  market.save();

  const probabilities = devigProbabilities(odds);

  for (let i = 0; i < outcomeIds.length; i++) {
    const outcome = new Outcome(id + '-' + i.toString());
    outcome.market = id;
    outcome.outcomeIndex = i;
    outcome.label = 'Outcome ' + i.toString();
    outcome.venueOutcomeId = outcomeIds[i].toString();
    outcome.impliedProbability = probabilities[i];
    outcome.lastUpdatedAt = event.block.timestamp;
    outcome.lastUpdatedBlock = event.block.number;
    outcome.save();

    const lookup = new AzuroOutcomeLookup(id + '-' + outcomeIds[i].toString());
    lookup.market = id;
    lookup.outcomeIndex = i;
    lookup.save();
  }
}

export function handleConditionSettled(event: ConditionSettled): void {
  const conditionId = event.params.conditionId;
  const id = marketId(conditionId);
  const market = Market.load(id);
  if (market == null) {
    return;
  }

  const resolvedOutcomes = event.params.resolvedOutcomes;
  let winningIndex = -1;
  let winnersFound = 0;
  for (let i = 0; i < resolvedOutcomes.length; i++) {
    if (resolvedOutcomes[i].status == OUTCOME_STATUS_WON) {
      winnersFound++;
      const lookup = AzuroOutcomeLookup.load(id + '-' + resolvedOutcomes[i].outcomeId.toString());
      if (lookup != null) {
        winningIndex = lookup.outcomeIndex;
      }
    }
  }
  if (winnersFound != 1) {
    // Seen once in manual exploration (all outcomes status=1) — likely a
    // void/refund settlement rather than a normal win/lose one. Don't guess
    // at a winner for that case; still record the resolution as settled.
    log.warning('condition {} settled with {} winners (expected exactly 1)', [
      conditionId.toString(),
      winnersFound.toString(),
    ]);
  }

  const resolution = new Resolution(id);
  resolution.market = id;
  resolution.status = 'Resolved';
  resolution.resolutionSource = 'azuro';
  if (winnersFound == 1 && winningIndex >= 0) {
    resolution.winningOutcomeIndex = winningIndex;
  }
  resolution.finalizedAt = event.params.settledAt;
  resolution.save();
}
