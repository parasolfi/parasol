import { Address, BigDecimal, BigInt, log } from '@graphprotocol/graph-ts';
import { ConditionCreated, ConditionResolved, OddsChanged, CoreV3 } from '../generated/ClientCore/CoreV3';
import { AzuroOutcomeLookup, Market, Outcome, Resolution } from '../generated/schema';

const VENUE = 'azuro';

function marketId(conditionId: BigInt): string {
  return VENUE + '-' + conditionId.toString();
}

// Raw, margin-free implied probability: outcomeFund * winningOutcomesCount / totalFund.
// This is deliberately NOT Azuro's own "odds" (their public API bakes a bookmaker
// margin into that via an iterative algorithm — see Azuro-subgraphs/api/src/utils/
// math.ts). We want the underlying market belief, comparable with Polymarket's
// trade price, not a margin-inclusive number that would skew the comparison.
function refreshOutcomeProbabilities(
  marketEntityId: string,
  coreAddress: Address,
  conditionId: BigInt,
  blockNumber: BigInt,
  blockTimestamp: BigInt,
): void {
  const core = CoreV3.bind(coreAddress);
  const conditionCall = core.try_getCondition(conditionId);
  if (conditionCall.reverted) {
    log.warning('getCondition reverted for condition {}', [conditionId.toString()]);
    return;
  }
  const condition = conditionCall.value;
  const virtualFunds = condition.virtualFunds;
  const winningOutcomesCount = condition.winningOutcomesCount;

  let totalFund = BigInt.zero();
  for (let i = 0; i < virtualFunds.length; i++) {
    totalFund = totalFund.plus(virtualFunds[i]);
  }
  if (totalFund.equals(BigInt.zero())) {
    return;
  }

  for (let i = 0; i < virtualFunds.length; i++) {
    const outcome = Outcome.load(marketEntityId + '-' + i.toString());
    if (outcome == null) {
      continue;
    }
    const probability = virtualFunds[i]
      .toBigDecimal()
      .times(BigDecimal.fromString(winningOutcomesCount.toString()))
      .div(totalFund.toBigDecimal());
    outcome.impliedProbability = probability;
    outcome.lastUpdatedAt = blockTimestamp;
    outcome.lastUpdatedBlock = blockNumber;
    outcome.save();
  }
}

export function handleConditionCreated(event: ConditionCreated): void {
  const conditionId = event.params.conditionId;
  const id = marketId(conditionId);
  const outcomeIds = event.params.outcomes;

  const core = CoreV3.bind(event.address);
  const conditionCall = core.try_getCondition(conditionId);
  if (conditionCall.reverted) {
    log.warning('getCondition reverted at creation for condition {}', [conditionId.toString()]);
    return;
  }
  const condition = conditionCall.value;

  const market = new Market(id);
  market.venue = VENUE;
  market.venueConditionId = conditionId.toString();
  market.questionId = null;
  market.question = null;
  market.outcomeSlotCount = outcomeIds.length;
  market.oracle = condition.oracle;
  market.createdAtBlock = event.block.number;
  market.createdAtTimestamp = event.block.timestamp;
  market.save();

  for (let i = 0; i < outcomeIds.length; i++) {
    const outcome = new Outcome(id + '-' + i.toString());
    outcome.market = id;
    outcome.outcomeIndex = i;
    outcome.label = 'Outcome ' + i.toString();
    outcome.venueOutcomeId = outcomeIds[i].toString();
    // Placeholder — overwritten immediately below by refreshOutcomeProbabilities
    // once real virtualFunds are read; avoids a division before we have them.
    outcome.impliedProbability = BigDecimal.fromString('1').div(
      BigDecimal.fromString(outcomeIds.length.toString()),
    );
    outcome.lastUpdatedAt = event.block.timestamp;
    outcome.lastUpdatedBlock = event.block.number;
    outcome.save();

    const lookup = new AzuroOutcomeLookup(id + '-' + outcomeIds[i].toString());
    lookup.market = id;
    lookup.outcomeIndex = i;
    lookup.save();
  }

  refreshOutcomeProbabilities(id, event.address, conditionId, event.block.number, event.block.timestamp);
}

export function handleOddsChanged(event: OddsChanged): void {
  const conditionId = event.params.conditionId;
  const id = marketId(conditionId);
  if (Market.load(id) == null) {
    // Condition created before our startBlock — nothing to attach this to.
    return;
  }
  refreshOutcomeProbabilities(id, event.address, conditionId, event.block.number, event.block.timestamp);
}

export function handleConditionResolved(event: ConditionResolved): void {
  const conditionId = event.params.conditionId;
  const id = marketId(conditionId);
  const market = Market.load(id);
  if (market == null) {
    return;
  }

  const winningOutcomes = event.params.winningOutcomes;
  let winningIndex = -1;
  if (winningOutcomes.length > 0) {
    const lookup = AzuroOutcomeLookup.load(id + '-' + winningOutcomes[0].toString());
    if (lookup != null) {
      winningIndex = lookup.outcomeIndex;
    }
  }

  const resolution = new Resolution(id);
  resolution.market = id;
  resolution.status = 'Resolved';
  resolution.resolutionSource = market.oracle.toHexString();
  if (winningIndex >= 0) {
    resolution.winningOutcomeIndex = winningIndex;
  } else {
    log.warning('could not map winningOutcomeIndex for condition {}', [conditionId.toString()]);
  }
  resolution.finalizedAt = event.block.timestamp;
  resolution.save();
}
