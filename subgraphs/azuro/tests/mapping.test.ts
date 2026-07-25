import { assert, describe, test, clearStore, afterEach, newMockEvent } from 'matchstick-as/assembly/index';
import { BigDecimal, BigInt, ethereum } from '@graphprotocol/graph-ts';
import { handleConditionCreated } from '../src/mapping';
import { ConditionCreated } from '../generated/LiveCore/LiveCore';
import { Outcome } from '../generated/schema';

const CONDITION_ID = BigInt.fromI32(777);
const GAME_ID = BigInt.fromI32(1);
const MARKET_ID = 'azuro-' + CONDITION_ID.toString();

function createConditionCreatedEvent(
  outcomeIds: BigInt[],
  odds: BigInt[],
  winningOutcomesCount: i32,
): ConditionCreated {
  const mock = newMockEvent();
  const event = new ConditionCreated(
    mock.address,
    mock.logIndex,
    mock.transactionLogIndex,
    mock.logType,
    mock.block,
    mock.transaction,
    mock.parameters,
    mock.receipt,
  );
  event.parameters = [
    new ethereum.EventParam('gameId', ethereum.Value.fromUnsignedBigInt(GAME_ID)),
    new ethereum.EventParam('conditionId', ethereum.Value.fromUnsignedBigInt(CONDITION_ID)),
    new ethereum.EventParam('outcomes', ethereum.Value.fromUnsignedBigIntArray(outcomeIds)),
    new ethereum.EventParam('odds', ethereum.Value.fromUnsignedBigIntArray(odds)),
    new ethereum.EventParam('winningOutcomesCount', ethereum.Value.fromI32(winningOutcomesCount)),
  ];
  return event;
}

describe('handleConditionCreated', () => {
  afterEach(() => {
    clearStore();
  });

  test('de-vigs real on-chain odds [2.05, 1.75] into normalized probabilities', () => {
    // Real values pulled from an actual on-chain ConditionCreated log.
    const outcomeIds: BigInt[] = [BigInt.fromI32(10230), BigInt.fromI32(10231)];
    const odds: BigInt[] = [BigInt.fromString('2050000000000'), BigInt.fromString('1750000000000')];

    handleConditionCreated(createConditionCreatedEvent(outcomeIds, odds, 1));

    assert.fieldEquals('Market', MARKET_ID, 'venue', 'azuro');
    assert.fieldEquals('Market', MARKET_ID, 'outcomeSlotCount', '2');
    assert.fieldEquals('Outcome', MARKET_ID + '-0', 'venueOutcomeId', '10230');
    assert.fieldEquals('Outcome', MARKET_ID + '-1', 'venueOutcomeId', '10231');

    const p0 = Outcome.load(MARKET_ID + '-0')!.impliedProbability;
    const p1 = Outcome.load(MARKET_ID + '-1')!.impliedProbability;

    // 1/2.05 = 0.487805, 1/1.75 = 0.571429, sum = 1.059233 -> normalized:
    // p0 ~= 0.4605, p1 ~= 0.5395. Bounds, not exact strings, since BigDecimal
    // division precision/rounding isn't worth pinning exactly here.
    assert.assertTrue(p0.gt(BigDecimal.fromString('0.45')));
    assert.assertTrue(p0.lt(BigDecimal.fromString('0.47')));
    assert.assertTrue(p1.gt(BigDecimal.fromString('0.53')));
    assert.assertTrue(p1.lt(BigDecimal.fromString('0.55')));
    assert.assertTrue(p1.gt(p0)); // lower decimal odds (1.75) -> higher probability
    assert.assertTrue(p0.plus(p1).gt(BigDecimal.fromString('0.999')));
    assert.assertTrue(p0.plus(p1).lt(BigDecimal.fromString('1.001'))); // normalizes to ~1
  });

  test('mismatched outcomes/odds array lengths is a no-op', () => {
    const outcomeIds: BigInt[] = [BigInt.fromI32(1), BigInt.fromI32(2)];
    const odds: BigInt[] = [BigInt.fromString('2000000000000')];

    handleConditionCreated(createConditionCreatedEvent(outcomeIds, odds, 1));

    assert.entityCount('Market', 0);
  });
});
