import { Address, BigDecimal, BigInt, log } from '@graphprotocol/graph-ts';
import { ConditionCreated, ConditionSettled, NewLiveBet } from '../generated/LiveCore/LiveCore';
import { AzuroOutcomeLookup, Market, Outcome, PricePoint, Resolution } from '../generated/schema';

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

// Bet `amount` unit — assumed 6-decimal (USDC-like), matching a real decoded
// NewLiveBet (amount=13940000 -> 13.94, a plausible real bet size). Not
// confirmed via an on-chain decimals() call; flagging the assumption rather
// than hiding it.
const COLLATERAL_DECIMALS = BigDecimal.fromString('1000000');

function marketId(conditionId: BigInt): string {
  return VENUE + '-' + conditionId.toString();
}

function inverseOdds(rawOdds: BigInt): BigDecimal {
  const decimalOdds = rawOdds.toBigDecimal().div(ODDS_SCALE);
  return BigDecimal.fromString('1').div(decimalOdds);
}

// Multiplicative de-vig: raw_i = (1/odds_i) / sum(1/odds_j). This strips the
// bookmaker margin baked into decimal odds, giving a probability comparable
// with Polymarket's trade price rather than a number systematically inflated
// by the overround. (Not the same as Azuro's own iterative margin algorithm —
// that goes the other direction, probability -> margin-inclusive odds; this
// is the simpler reverse case.)
function normalize(inverses: BigDecimal[]): BigDecimal[] {
  let sum = BigDecimal.zero();
  for (let i = 0; i < inverses.length; i++) {
    sum = sum.plus(inverses[i]);
  }
  const probabilities: BigDecimal[] = [];
  for (let i = 0; i < inverses.length; i++) {
    probabilities.push(inverses[i].div(sum));
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

  const inverses: BigDecimal[] = [];
  for (let i = 0; i < odds.length; i++) {
    inverses.push(inverseOdds(odds[i]));
  }
  const probabilities = normalize(inverses);

  for (let i = 0; i < outcomeIds.length; i++) {
    const outcome = new Outcome(id + '-' + i.toString());
    outcome.market = id;
    outcome.outcomeIndex = i;
    outcome.label = 'Outcome ' + i.toString();
    outcome.venueOutcomeId = outcomeIds[i].toString();
    outcome.impliedProbability = probabilities[i];
    outcome.rawInverseOdds = inverses[i];
    outcome.lastUpdatedAt = event.block.timestamp;
    outcome.lastUpdatedBlock = event.block.number;
    outcome.volume = BigDecimal.zero();
    outcome.tradeCount = 0;
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

// NewLiveBet is the only genuinely live, high-frequency signal this contract
// emits (confirmed: 136 occurrences vs. 67 ConditionCreated in the same
// window) — ConditionUpdated fires once per condition at creation time, not
// on an ongoing basis (see subgraph.yaml note), so per-bet odds are the real
// price feed here, the same role OrderFilled plays for Polymarket.
export function handleNewLiveBet(event: NewLiveBet): void {
  const amount = event.params.amount.toBigDecimal().div(COLLATERAL_DECIMALS);
  const betDatas = event.params.betDatas;

  for (let i = 0; i < betDatas.length; i++) {
    const leg = betDatas[i];
    const id = marketId(leg.conditionId);
    const market = Market.load(id);
    if (market == null) {
      // Condition created before our startBlock — nothing to attach this to.
      continue;
    }

    const lookup = AzuroOutcomeLookup.load(id + '-' + leg.outcomeId.toString());
    if (lookup == null) {
      continue;
    }
    const outcome = Outcome.load(id + '-' + lookup.outcomeIndex.toString());
    if (outcome == null) {
      continue;
    }

    // A combo/express bet's `amount` is the total stake across all legs, not
    // per-leg — attributing the full amount to every leg over-counts volume
    // for multi-leg bets. Simplification, not a bug: most live bets are
    // single-leg, and there's no on-chain per-leg stake split to read instead.
    outcome.volume = outcome.volume.plus(amount);
    outcome.tradeCount = outcome.tradeCount + 1;
    outcome.rawInverseOdds = inverseOdds(leg.odds);
    outcome.save();

    // This leg's odds moved, which shifts every outcome's normalized share in
    // the same market (de-vig sums across all of them) — reload and
    // renormalize the whole set, not just the one that was bet on. Two
    // passes (gather plain values, then reload-and-save) rather than holding
    // loaded Outcome entities in an array — the latter crashed the
    // AssemblyScript compiler here.
    const outcomeSlotCount = market.outcomeSlotCount;
    const inverses: BigDecimal[] = [];
    let allPresent = true;
    for (let j = 0; j < outcomeSlotCount; j++) {
      const sibling = Outcome.load(id + '-' + j.toString());
      if (sibling == null) {
        allPresent = false;
        break;
      }
      // rawInverseOdds is nullable in the schema only because Polymarket
      // doesn't use it — every outcome this mapping creates always sets it,
      // so a plain assertion here (not a `== null` comparison, which crashes
      // the AssemblyScript compiler for nullable BigDecimal — see above).
      inverses.push(sibling.rawInverseOdds!);
    }
    if (!allPresent) {
      continue;
    }
    const probabilities = normalize(inverses);
    for (let j = 0; j < outcomeSlotCount; j++) {
      const sibling = Outcome.load(id + '-' + j.toString());
      if (sibling == null) {
        continue;
      }
      sibling.impliedProbability = probabilities[j];
      sibling.lastUpdatedAt = event.block.timestamp;
      sibling.lastUpdatedBlock = event.block.number;
      sibling.save();
    }

    const pricePoint = new PricePoint(
      outcome.id + '-' + event.block.number.toString() + '-' + event.logIndex.toString(),
    );
    pricePoint.outcome = outcome.id;
    pricePoint.impliedProbability = probabilities[lookup.outcomeIndex];
    pricePoint.timestamp = event.block.timestamp;
    pricePoint.block = event.block.number;
    pricePoint.save();
  }
}
