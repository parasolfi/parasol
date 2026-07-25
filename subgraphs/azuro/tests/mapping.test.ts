import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  newMockEvent,
  createMockedFunction,
} from 'matchstick-as/assembly/index';
import { Address, BigInt, ethereum } from '@graphprotocol/graph-ts';
import { handleConditionCreated, handleConditionResolved, handleOddsChanged } from '../src/mapping';
import { ConditionCreated, ConditionResolved, OddsChanged } from '../generated/ClientCore/CoreV3';

const CORE_ADDRESS = Address.fromString('0xF9548Be470A4e130c90ceA8b179FCD66D2972AC7');
const ORACLE = Address.fromString('0x1234567890123456789012345678901234567890');
const CONDITION_ID = BigInt.fromI32(777);
const GAME_ID = BigInt.fromI32(1);
const MARKET_ID = 'azuro-' + CONDITION_ID.toString();

// Three-way market (e.g. home/draw/away), Azuro's own raw outcome ids 10/20/30,
// virtual funds 60/20/20 -> raw probabilities 0.6/0.2/0.2 for a 1-winner market.
const OUTCOME_IDS: BigInt[] = [BigInt.fromI32(10), BigInt.fromI32(20), BigInt.fromI32(30)];
const VIRTUAL_FUNDS: BigInt[] = [BigInt.fromI32(60), BigInt.fromI32(20), BigInt.fromI32(20)];

function mockGetCondition(virtualFunds: BigInt[], winningOutcomesCount: i32): void {
  const tuple = new ethereum.Tuple();
  tuple.push(ethereum.Value.fromUnsignedBigInt(GAME_ID)); // gameId
  tuple.push(ethereum.Value.fromUnsignedBigIntArray([])); // payouts
  tuple.push(ethereum.Value.fromUnsignedBigIntArray(virtualFunds)); // virtualFunds
  tuple.push(ethereum.Value.fromUnsignedBigInt(BigInt.zero())); // totalNetBets
  tuple.push(ethereum.Value.fromUnsignedBigInt(BigInt.zero())); // reinforcement
  tuple.push(ethereum.Value.fromUnsignedBigInt(BigInt.zero())); // fund
  tuple.push(ethereum.Value.fromUnsignedBigInt(BigInt.zero())); // margin
  tuple.push(ethereum.Value.fromUnsignedBigInt(BigInt.zero())); // endsAt
  tuple.push(ethereum.Value.fromUnsignedBigInt(BigInt.zero())); // lastDepositId
  tuple.push(ethereum.Value.fromI32(winningOutcomesCount)); // winningOutcomesCount
  tuple.push(ethereum.Value.fromI32(0)); // state
  tuple.push(ethereum.Value.fromAddress(ORACLE)); // oracle
  tuple.push(ethereum.Value.fromBoolean(false)); // isExpressForbidden

  createMockedFunction(
    CORE_ADDRESS,
    'getCondition',
    'getCondition(uint256):((uint256,uint128[],uint128[],uint128,uint128,uint128,uint64,uint64,uint48,uint8,uint8,address,bool))',
  )
    .withArgs([ethereum.Value.fromUnsignedBigInt(CONDITION_ID)])
    .returns([ethereum.Value.fromTuple(tuple)]);
}

function createConditionCreatedEvent(): ConditionCreated {
  const mock = newMockEvent();
  mock.address = CORE_ADDRESS;
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
    new ethereum.EventParam('outcomes', ethereum.Value.fromUnsignedBigIntArray(OUTCOME_IDS)),
  ];
  return event;
}

function createOddsChangedEvent(): OddsChanged {
  const mock = newMockEvent();
  mock.address = CORE_ADDRESS;
  const event = new OddsChanged(
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
    new ethereum.EventParam('conditionId', ethereum.Value.fromUnsignedBigInt(CONDITION_ID)),
    new ethereum.EventParam('newOdds', ethereum.Value.fromUnsignedBigIntArray(VIRTUAL_FUNDS)),
  ];
  return event;
}

function createConditionResolvedEvent(winningOutcomes: BigInt[]): ConditionResolved {
  const mock = newMockEvent();
  mock.address = CORE_ADDRESS;
  const event = new ConditionResolved(
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
    new ethereum.EventParam('conditionId', ethereum.Value.fromUnsignedBigInt(CONDITION_ID)),
    new ethereum.EventParam('state', ethereum.Value.fromI32(1)),
    new ethereum.EventParam('winningOutcomes', ethereum.Value.fromUnsignedBigIntArray(winningOutcomes)),
    new ethereum.EventParam('lpProfit', ethereum.Value.fromSignedBigInt(BigInt.zero())),
  ];
  return event;
}

describe('handleConditionCreated', () => {
  afterEach(() => {
    clearStore();
  });

  test('creates a 3-outcome Market with raw (margin-free) probabilities from virtualFunds', () => {
    mockGetCondition(VIRTUAL_FUNDS, 1);
    handleConditionCreated(createConditionCreatedEvent());

    assert.fieldEquals('Market', MARKET_ID, 'venue', 'azuro');
    assert.fieldEquals('Market', MARKET_ID, 'outcomeSlotCount', '3');
    assert.fieldEquals('Market', MARKET_ID, 'oracle', ORACLE.toHexString());

    // 60/20/20 total 100, winningOutcomesCount=1 -> 0.6 / 0.2 / 0.2
    assert.fieldEquals('Outcome', MARKET_ID + '-0', 'impliedProbability', '0.6');
    assert.fieldEquals('Outcome', MARKET_ID + '-1', 'impliedProbability', '0.2');
    assert.fieldEquals('Outcome', MARKET_ID + '-2', 'impliedProbability', '0.2');

    assert.fieldEquals('AzuroOutcomeLookup', MARKET_ID + '-10', 'outcomeIndex', '0');
    assert.fieldEquals('AzuroOutcomeLookup', MARKET_ID + '-20', 'outcomeIndex', '1');
    assert.fieldEquals('AzuroOutcomeLookup', MARKET_ID + '-30', 'outcomeIndex', '2');
  });
});

describe('handleOddsChanged', () => {
  afterEach(() => {
    clearStore();
  });

  test('recomputes probabilities when virtual funds shift', () => {
    mockGetCondition(VIRTUAL_FUNDS, 1);
    handleConditionCreated(createConditionCreatedEvent());

    // funds move to 10/10/80 -> 0.1 / 0.1 / 0.8
    const shifted: BigInt[] = [BigInt.fromI32(10), BigInt.fromI32(10), BigInt.fromI32(80)];
    mockGetCondition(shifted, 1);
    handleOddsChanged(createOddsChangedEvent());

    assert.fieldEquals('Outcome', MARKET_ID + '-0', 'impliedProbability', '0.1');
    assert.fieldEquals('Outcome', MARKET_ID + '-1', 'impliedProbability', '0.1');
    assert.fieldEquals('Outcome', MARKET_ID + '-2', 'impliedProbability', '0.8');
  });
});

describe('handleConditionResolved', () => {
  afterEach(() => {
    clearStore();
  });

  test('maps the raw winning outcome id back to positional index', () => {
    mockGetCondition(VIRTUAL_FUNDS, 1);
    handleConditionCreated(createConditionCreatedEvent());

    // raw outcome id 20 won -> that's positional index 1
    handleConditionResolved(createConditionResolvedEvent([BigInt.fromI32(20)]));

    assert.fieldEquals('Resolution', MARKET_ID, 'status', 'Resolved');
    assert.fieldEquals('Resolution', MARKET_ID, 'winningOutcomeIndex', '1');
    assert.fieldEquals('Resolution', MARKET_ID, 'resolutionSource', ORACLE.toHexString());
  });
});
