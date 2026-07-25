import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  newMockEvent,
  createMockedFunction,
} from 'matchstick-as/assembly/index';
import { Address, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts';
import {
  handleConditionPreparation,
  handleConditionResolution,
  handleOrderFilled,
} from '../src/mapping';
import { ConditionPreparation, ConditionResolution } from '../generated/ConditionalTokens/ConditionalTokens';
import { OrderFilled } from '../generated/Exchange/Exchange';

const CTF_ADDRESS = Address.fromString('0x4D97DCd97eC945f40cF65F87097ACe5EA0476045');
const USDC_ADDRESS = Address.fromString('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174');
const ZERO_BYTES32 = Bytes.fromHexString(
  '0x0000000000000000000000000000000000000000000000000000000000000000',
);
const CONDITION_ID = Bytes.fromHexString(
  '0x1111111111111111111111111111111111111111111111111111111111111111',
);
const ORACLE = Address.fromString('0x1234567890123456789012345678901234567890');
const QUESTION_ID = Bytes.fromHexString(
  '0x2222222222222222222222222222222222222222222222222222222222222222',
);
const MARKET_ID = 'polymarket-' + CONDITION_ID.toHexString();

const COLLECTION_ID_0 = Bytes.fromHexString(
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
);
const COLLECTION_ID_1 = Bytes.fromHexString(
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
);
const POSITION_ID_0 = BigInt.fromI32(111);
const POSITION_ID_1 = BigInt.fromI32(222);

function mockCtfCalls(): void {
  createMockedFunction(
    CTF_ADDRESS,
    'getCollectionId',
    'getCollectionId(bytes32,bytes32,uint256):(bytes32)',
  )
    .withArgs([
      ethereum.Value.fromFixedBytes(ZERO_BYTES32),
      ethereum.Value.fromFixedBytes(CONDITION_ID),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1)),
    ])
    .returns([ethereum.Value.fromFixedBytes(COLLECTION_ID_0)]);

  createMockedFunction(
    CTF_ADDRESS,
    'getCollectionId',
    'getCollectionId(bytes32,bytes32,uint256):(bytes32)',
  )
    .withArgs([
      ethereum.Value.fromFixedBytes(ZERO_BYTES32),
      ethereum.Value.fromFixedBytes(CONDITION_ID),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(2)),
    ])
    .returns([ethereum.Value.fromFixedBytes(COLLECTION_ID_1)]);

  createMockedFunction(CTF_ADDRESS, 'getPositionId', 'getPositionId(address,bytes32):(uint256)')
    .withArgs([
      ethereum.Value.fromAddress(USDC_ADDRESS),
      ethereum.Value.fromFixedBytes(COLLECTION_ID_0),
    ])
    .returns([ethereum.Value.fromUnsignedBigInt(POSITION_ID_0)]);

  createMockedFunction(CTF_ADDRESS, 'getPositionId', 'getPositionId(address,bytes32):(uint256)')
    .withArgs([
      ethereum.Value.fromAddress(USDC_ADDRESS),
      ethereum.Value.fromFixedBytes(COLLECTION_ID_1),
    ])
    .returns([ethereum.Value.fromUnsignedBigInt(POSITION_ID_1)]);
}

function createConditionPreparationEvent(): ConditionPreparation {
  const mock = newMockEvent();
  mock.address = CTF_ADDRESS;
  const event = new ConditionPreparation(
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
    new ethereum.EventParam('conditionId', ethereum.Value.fromBytes(CONDITION_ID)),
    new ethereum.EventParam('oracle', ethereum.Value.fromAddress(ORACLE)),
    new ethereum.EventParam('questionId', ethereum.Value.fromBytes(QUESTION_ID)),
    new ethereum.EventParam(
      'outcomeSlotCount',
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(2)),
    ),
  ];
  return event;
}

function createOrderFilledEvent(
  tokenId: BigInt,
  side: i32,
  makerAmountFilled: BigInt,
  takerAmountFilled: BigInt,
): OrderFilled {
  const mock = newMockEvent();
  const event = new OrderFilled(
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
    new ethereum.EventParam('orderHash', ethereum.Value.fromBytes(Bytes.fromI32(1))),
    new ethereum.EventParam('maker', ethereum.Value.fromAddress(ORACLE)),
    new ethereum.EventParam('taker', ethereum.Value.fromAddress(ORACLE)),
    new ethereum.EventParam('side', ethereum.Value.fromI32(side)),
    new ethereum.EventParam('tokenId', ethereum.Value.fromUnsignedBigInt(tokenId)),
    new ethereum.EventParam(
      'makerAmountFilled',
      ethereum.Value.fromUnsignedBigInt(makerAmountFilled),
    ),
    new ethereum.EventParam(
      'takerAmountFilled',
      ethereum.Value.fromUnsignedBigInt(takerAmountFilled),
    ),
    new ethereum.EventParam('fee', ethereum.Value.fromUnsignedBigInt(BigInt.zero())),
    new ethereum.EventParam('builder', ethereum.Value.fromBytes(ZERO_BYTES32)),
    new ethereum.EventParam('metadata', ethereum.Value.fromBytes(ZERO_BYTES32)),
  ];
  return event;
}

function createConditionResolutionEvent(payoutNumerators: BigInt[]): ConditionResolution {
  const mock = newMockEvent();
  const event = new ConditionResolution(
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
    new ethereum.EventParam('conditionId', ethereum.Value.fromBytes(CONDITION_ID)),
    new ethereum.EventParam('oracle', ethereum.Value.fromAddress(ORACLE)),
    new ethereum.EventParam('questionId', ethereum.Value.fromBytes(QUESTION_ID)),
    new ethereum.EventParam(
      'outcomeSlotCount',
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(2)),
    ),
    new ethereum.EventParam(
      'payoutNumerators',
      ethereum.Value.fromUnsignedBigIntArray(payoutNumerators),
    ),
  ];
  return event;
}

describe('handleConditionPreparation', () => {
  afterEach(() => {
    clearStore();
  });

  test('creates Market, two Outcomes at a neutral 0.5 prior, and TokenToOutcome lookups', () => {
    mockCtfCalls();
    handleConditionPreparation(createConditionPreparationEvent());

    assert.fieldEquals('Market', MARKET_ID, 'venue', 'polymarket');
    assert.fieldEquals('Market', MARKET_ID, 'outcomeSlotCount', '2');
    assert.fieldEquals('Market', MARKET_ID, 'oracle', ORACLE.toHexString());

    assert.fieldEquals('Outcome', MARKET_ID + '-0', 'impliedProbability', '0.5');
    assert.fieldEquals('Outcome', MARKET_ID + '-1', 'impliedProbability', '0.5');

    assert.fieldEquals('TokenToOutcome', POSITION_ID_0.toString(), 'market', MARKET_ID);
    assert.fieldEquals('TokenToOutcome', POSITION_ID_0.toString(), 'outcomeIndex', '0');
    assert.fieldEquals('TokenToOutcome', POSITION_ID_1.toString(), 'outcomeIndex', '1');
  });
});

describe('handleOrderFilled', () => {
  afterEach(() => {
    clearStore();
  });

  test('BUY: price = makerAmountFilled (USDC in) / takerAmountFilled (shares out)', () => {
    mockCtfCalls();
    handleConditionPreparation(createConditionPreparationEvent());

    // side 0 = BUY: maker pays 30 USDC, receives 100 shares of outcome 0 -> price 0.3
    handleOrderFilled(
      createOrderFilledEvent(POSITION_ID_0, 0, BigInt.fromI32(30), BigInt.fromI32(100)),
    );

    assert.fieldEquals('Outcome', MARKET_ID + '-0', 'impliedProbability', '0.3');
  });

  test('SELL: price = takerAmountFilled (USDC in) / makerAmountFilled (shares out)', () => {
    mockCtfCalls();
    handleConditionPreparation(createConditionPreparationEvent());

    // side 1 = SELL: maker gives 100 shares of outcome 1, receives 40 USDC -> price 0.4
    handleOrderFilled(
      createOrderFilledEvent(POSITION_ID_1, 1, BigInt.fromI32(100), BigInt.fromI32(40)),
    );

    assert.fieldEquals('Outcome', MARKET_ID + '-1', 'impliedProbability', '0.4');
  });

  test('unknown tokenId is skipped without creating anything', () => {
    mockCtfCalls();
    handleConditionPreparation(createConditionPreparationEvent());

    handleOrderFilled(
      createOrderFilledEvent(BigInt.fromI32(999999), 0, BigInt.fromI32(1), BigInt.fromI32(1)),
    );

    // both real outcomes remain untouched at their neutral prior
    assert.fieldEquals('Outcome', MARKET_ID + '-0', 'impliedProbability', '0.5');
    assert.fieldEquals('Outcome', MARKET_ID + '-1', 'impliedProbability', '0.5');
  });
});

describe('handleConditionResolution', () => {
  afterEach(() => {
    clearStore();
  });

  test('sets winningOutcomeIndex from the first non-zero payout numerator', () => {
    mockCtfCalls();
    handleConditionPreparation(createConditionPreparationEvent());

    handleConditionResolution(
      createConditionResolutionEvent([BigInt.zero(), BigInt.fromI32(1)]),
    );

    assert.fieldEquals('Resolution', MARKET_ID, 'status', 'Resolved');
    assert.fieldEquals('Resolution', MARKET_ID, 'winningOutcomeIndex', '1');
    assert.fieldEquals('Resolution', MARKET_ID, 'resolutionSource', ORACLE.toHexString());
  });

  test('resolution for an unknown market is a no-op', () => {
    // no handleConditionPreparation call first -> Market.load() should miss
    handleConditionResolution(
      createConditionResolutionEvent([BigInt.fromI32(1), BigInt.zero()]),
    );

    assert.entityCount('Resolution', 0);
  });
});
