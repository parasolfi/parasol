import { assert, describe, test, clearStore, afterEach, newMockEvent } from 'matchstick-as/assembly/index';
import { Address, BigDecimal, BigInt, ethereum } from '@graphprotocol/graph-ts';
import { handleConditionCreated, handleConditionSettled, handleNewLiveBet } from '../src/mapping';
import { ConditionCreated, ConditionSettled, NewLiveBet } from '../generated/LiveCore/LiveCore';
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

function createConditionSettledEvent(
  resolvedOutcomes: Array<Array<BigInt>>, // [outcomeId, status][]
  lpProfit: BigInt,
  settledAt: BigInt,
): ConditionSettled {
  const mock = newMockEvent();
  const event = new ConditionSettled(
    mock.address,
    mock.logIndex,
    mock.transactionLogIndex,
    mock.logType,
    mock.block,
    mock.transaction,
    mock.parameters,
    mock.receipt,
  );
  const tuples: ethereum.Tuple[] = [];
  for (let i = 0; i < resolvedOutcomes.length; i++) {
    const t = new ethereum.Tuple();
    t.push(ethereum.Value.fromUnsignedBigInt(resolvedOutcomes[i][0]));
    t.push(ethereum.Value.fromI32(resolvedOutcomes[i][1].toI32()));
    tuples.push(t);
  }
  event.parameters = [
    new ethereum.EventParam('conditionId', ethereum.Value.fromUnsignedBigInt(CONDITION_ID)),
    new ethereum.EventParam('state', ethereum.Value.fromI32(1)),
    new ethereum.EventParam('resolvedOutcomes', ethereum.Value.fromTupleArray(tuples)),
    new ethereum.EventParam('lpProfit', ethereum.Value.fromSignedBigInt(lpProfit)),
    new ethereum.EventParam('settledAt', ethereum.Value.fromUnsignedBigInt(settledAt)),
  ];
  return event;
}

describe('handleConditionSettled', () => {
  afterEach(() => {
    clearStore();
  });

  test('maps the winning raw outcome id back to positional index', () => {
    const outcomeIds: BigInt[] = [BigInt.fromI32(10230), BigInt.fromI32(10231)];
    const odds: BigInt[] = [BigInt.fromString('2050000000000'), BigInt.fromString('1750000000000')];
    handleConditionCreated(createConditionCreatedEvent(outcomeIds, odds, 1));

    // Real shape from an actual settled condition: winner status=1, loser status=0.
    handleConditionSettled(
      createConditionSettledEvent(
        [
          [BigInt.fromI32(10230), BigInt.fromI32(1)],
          [BigInt.fromI32(10231), BigInt.fromI32(0)],
        ],
        BigInt.fromString('19800000'),
        BigInt.fromString('1785005222'),
      ),
    );

    assert.fieldEquals('Resolution', MARKET_ID, 'status', 'Resolved');
    assert.fieldEquals('Resolution', MARKET_ID, 'winningOutcomeIndex', '0');
    assert.fieldEquals('Resolution', MARKET_ID, 'finalizedAt', '1785005222');
  });

  test('resolution for an unknown market is a no-op', () => {
    handleConditionSettled(
      createConditionSettledEvent(
        [[BigInt.fromI32(1), BigInt.fromI32(1)]],
        BigInt.zero(),
        BigInt.fromI32(1),
      ),
    );
    assert.entityCount('Resolution', 0);
  });
});

function createNewLiveBetEvent(
  amount: BigInt,
  legs: Array<Array<BigInt>>, // [conditionId, outcomeId, odds][]
): NewLiveBet {
  const mock = newMockEvent();
  const event = new NewLiveBet(
    mock.address,
    mock.logIndex,
    mock.transactionLogIndex,
    mock.logType,
    mock.block,
    mock.transaction,
    mock.parameters,
    mock.receipt,
  );
  const betDatas: ethereum.Tuple[] = [];
  for (let i = 0; i < legs.length; i++) {
    const t = new ethereum.Tuple();
    t.push(ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))); // gameId, unused
    t.push(ethereum.Value.fromUnsignedBigInt(legs[i][0])); // conditionId
    t.push(ethereum.Value.fromI32(1)); // conditionKind, unused
    t.push(ethereum.Value.fromUnsignedBigInt(legs[i][1])); // outcomeId
    t.push(ethereum.Value.fromUnsignedBigInt(legs[i][2])); // odds
    betDatas.push(t);
  }
  event.parameters = [
    new ethereum.EventParam('tokenId', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
    new ethereum.EventParam('bettor', ethereum.Value.fromAddress(Address.zero())),
    new ethereum.EventParam('affiliate', ethereum.Value.fromAddress(Address.zero())),
    new ethereum.EventParam('betType', ethereum.Value.fromI32(0)),
    new ethereum.EventParam('nonce', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
    new ethereum.EventParam('amount', ethereum.Value.fromUnsignedBigInt(amount)),
    new ethereum.EventParam('betDatas', ethereum.Value.fromTupleArray(betDatas)),
    new ethereum.EventParam('potentialLossLimit', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(0))),
  ];
  return event;
}

describe('handleNewLiveBet', () => {
  afterEach(() => {
    clearStore();
  });

  test('records volume/tradeCount and re-devigs using this leg\'s new odds', () => {
    const outcomeIds: BigInt[] = [BigInt.fromI32(10230), BigInt.fromI32(10231)];
    const odds: BigInt[] = [BigInt.fromString('2050000000000'), BigInt.fromString('1750000000000')];
    handleConditionCreated(createConditionCreatedEvent(outcomeIds, odds, 1));

    // 5 USDC bet (5000000 raw, 6 decimals) on outcome 10230, whose odds moved
    // from 2.05 to 3.0 (outcome 10231's odds, 1.75, is untouched by this bet).
    handleNewLiveBet(
      createNewLiveBetEvent(BigInt.fromString('5000000'), [
        [CONDITION_ID, BigInt.fromI32(10230), BigInt.fromString('3000000000000')],
      ]),
    );

    assert.fieldEquals('Outcome', MARKET_ID + '-0', 'tradeCount', '1');
    assert.fieldEquals('Outcome', MARKET_ID + '-0', 'volume', '5');
    assert.entityCount('PricePoint', 1);

    // 1/3 = 0.3333, 1/1.75 = 0.5714, sum = 0.9048 -> p0 ~= 0.3684, p1 ~= 0.6316
    const p0 = Outcome.load(MARKET_ID + '-0')!.impliedProbability;
    const p1 = Outcome.load(MARKET_ID + '-1')!.impliedProbability;
    assert.assertTrue(p0.gt(BigDecimal.fromString('0.36')));
    assert.assertTrue(p0.lt(BigDecimal.fromString('0.37')));
    assert.assertTrue(p1.gt(BigDecimal.fromString('0.62')));
    assert.assertTrue(p1.lt(BigDecimal.fromString('0.64')));
  });

  test('a bet on an unindexed condition is a no-op', () => {
    handleNewLiveBet(
      createNewLiveBetEvent(BigInt.fromString('5000000'), [
        [BigInt.fromI32(999999), BigInt.fromI32(1), BigInt.fromString('2000000000000')],
      ]),
    );
    assert.entityCount('PricePoint', 0);
  });
});
