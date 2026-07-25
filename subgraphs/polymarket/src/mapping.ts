import { Address, BigInt, BigDecimal, Bytes, log } from '@graphprotocol/graph-ts';
import {
  ConditionPreparation,
  ConditionResolution,
  ConditionalTokens,
} from '../generated/ConditionalTokens/ConditionalTokens';
import { OrderFilled } from '../generated/Exchange/Exchange';
import {
  NegRiskAdapter,
  OutcomeReported,
  QuestionPrepared,
} from '../generated/NegRiskAdapter/NegRiskAdapter';
import { Market, Outcome, PricePoint, Resolution, TokenToOutcome } from '../generated/schema';

const VENUE = 'polymarket';

// Polygon mainnet USDC — Polymarket's fixed collateral asset. Needed to derive
// CTF position ids (getPositionId takes the collateral token as an argument).
const USDC_ADDRESS = Address.fromString('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174');
const USDC_DECIMALS = BigDecimal.fromString('1000000'); // 6 decimals

// bytes32(0) — "no parent collection", i.e. a root position, not a combination
// of multiple conditions. Every Polymarket binary market is a root position.
const ZERO_BYTES32 = Bytes.fromHexString(
  '0x0000000000000000000000000000000000000000000000000000000000000000',
);

const SIDE_BUY = 0;

function marketId(conditionId: Bytes): string {
  return VENUE + '-' + conditionId.toHexString();
}

export function handleConditionPreparation(event: ConditionPreparation): void {
  const conditionId = event.params.conditionId;
  const id = marketId(conditionId);
  const outcomeSlotCount = event.params.outcomeSlotCount.toI32();

  const market = new Market(id);
  market.venue = VENUE;
  market.venueConditionId = conditionId.toHexString();
  market.questionId = event.params.questionId;
  market.question = null; // not on-chain — see schema.graphql note
  market.outcomeSlotCount = outcomeSlotCount;
  market.oracle = event.params.oracle;
  market.createdAtBlock = event.block.number;
  market.createdAtTimestamp = event.block.timestamp;
  market.save();

  // Ask the CTF contract itself for each outcome's ERC1155 position id, rather
  // than recomputing getCollectionId/getPositionId locally — modern CTF derives
  // collection ids as elliptic-curve points (ecAdd + modular sqrt), not a plain
  // keccak256 chain, so reimplementing it here would risk a silently wrong id.
  const ctf = ConditionalTokens.bind(event.address);

  for (let i = 0; i < outcomeSlotCount; i++) {
    const outcomeIndex = i;
    const outcomeEntityId = id + '-' + outcomeIndex.toString();

    const outcome = new Outcome(outcomeEntityId);
    outcome.market = id;
    outcome.outcomeIndex = outcomeIndex;
    outcome.label = 'Outcome ' + outcomeIndex.toString();
    // Neutral prior until the first trade updates it — 1/N, not a real price yet.
    outcome.impliedProbability = BigDecimal.fromString('1').div(
      BigDecimal.fromString(outcomeSlotCount.toString()),
    );
    outcome.lastUpdatedAt = event.block.timestamp;
    outcome.lastUpdatedBlock = event.block.number;
    outcome.volume = BigDecimal.zero();
    outcome.tradeCount = 0;
    outcome.rawInverseOdds = null; // not meaningful for a trade-price venue
    outcome.save();

    const indexSet = BigInt.fromI32(1).leftShift(<u8>i);
    const collectionIdCall = ctf.try_getCollectionId(ZERO_BYTES32, conditionId, indexSet);
    if (collectionIdCall.reverted) {
      log.warning('getCollectionId reverted for condition {} outcome {}', [
        conditionId.toHexString(),
        outcomeIndex.toString(),
      ]);
      continue;
    }
    const positionIdCall = ctf.try_getPositionId(USDC_ADDRESS, collectionIdCall.value);
    if (positionIdCall.reverted) {
      log.warning('getPositionId reverted for condition {} outcome {}', [
        conditionId.toHexString(),
        outcomeIndex.toString(),
      ]);
      continue;
    }

    const lookup = new TokenToOutcome(positionIdCall.value.toString());
    lookup.market = id;
    lookup.outcomeIndex = outcomeIndex;
    lookup.save();
  }
}

export function handleConditionResolution(event: ConditionResolution): void {
  const conditionId = event.params.conditionId;
  const id = marketId(conditionId);

  const market = Market.load(id);
  if (market == null) {
    // Resolution for a condition prepared before our startBlock — nothing to
    // attach it to. Expected given we only index a recent window.
    return;
  }

  const payouts = event.params.payoutNumerators;
  let winningIndex = -1;
  for (let i = 0; i < payouts.length; i++) {
    if (payouts[i].gt(BigInt.zero())) {
      winningIndex = i;
      break;
    }
  }

  const resolution = new Resolution(id);
  resolution.market = id;
  resolution.status = 'Resolved';
  resolution.resolutionSource = event.params.oracle.toHexString();
  if (winningIndex >= 0) {
    // Generated setter is a plain i32, not i32|null — there's no "unset"
    // value distinct from 0, so we only assign it when we actually found one.
    resolution.winningOutcomeIndex = winningIndex;
  } else {
    log.warning('ConditionResolution with all-zero payoutNumerators for condition {}', [
      conditionId.toHexString(),
    ]);
  }
  resolution.finalizedAt = event.block.timestamp;
  resolution.save();
}

export function handleOrderFilled(event: OrderFilled): void {
  const tokenId = event.params.tokenId;
  const lookup = TokenToOutcome.load(tokenId.toString());
  if (lookup == null) {
    // A fill for a token we haven't indexed the market-creation side of yet
    // (e.g. condition prepared before startBlock). Skip rather than guess.
    return;
  }

  const outcome = Outcome.load(lookup.market + '-' + lookup.outcomeIndex.toString());
  if (outcome == null) {
    return;
  }

  const maker = event.params.makerAmountFilled.toBigDecimal();
  const taker = event.params.takerAmountFilled.toBigDecimal();
  if (taker.equals(BigDecimal.zero()) || maker.equals(BigDecimal.zero())) {
    return;
  }

  // BUY: maker pays USDC (makerAmountFilled), receives the outcome token
  //      (takerAmountFilled) -> price = USDC paid / shares received.
  // SELL: maker gives the outcome token (makerAmountFilled), receives USDC
  //      (takerAmountFilled) -> price = USDC received / shares given.
  const isBuy = event.params.side == SIDE_BUY;
  const price = isBuy ? maker.div(taker) : taker.div(maker);
  const usdcLeg = isBuy ? maker : taker;

  outcome.impliedProbability = price;
  outcome.lastUpdatedAt = event.block.timestamp;
  outcome.lastUpdatedBlock = event.block.number;
  outcome.volume = outcome.volume.plus(usdcLeg.div(USDC_DECIMALS));
  outcome.tradeCount = outcome.tradeCount + 1;
  outcome.save();

  const pricePoint = new PricePoint(
    outcome.id + '-' + event.block.number.toString() + '-' + event.logIndex.toString(),
  );
  pricePoint.outcome = outcome.id;
  pricePoint.impliedProbability = price;
  pricePoint.timestamp = event.block.timestamp;
  pricePoint.block = event.block.number;
  pricePoint.save();
}

// NegRisk (bundled/threshold) markets don't use CTF's plain getCollectionId/
// getPositionId derivation for their traded token ids — confirmed by
// computing both for a real market and getting a mismatch against
// Polymarket's actual reported clobTokenIds. NegRiskAdapter.getPositionId is
// the correct, contract-verified derivation instead. Convention: outcome
// index 0 = false/"NO", 1 = true/"YES" — an internal choice (Outcome 0/1 are
// generic labels already, not asserted to mean anything beyond array
// position), consistent as long as lookups use the same mapping as creation.
export function handleQuestionPrepared(event: QuestionPrepared): void {
  const questionId = event.params.questionId;
  const adapter = NegRiskAdapter.bind(event.address);

  const conditionIdCall = adapter.try_getConditionId(questionId);
  if (conditionIdCall.reverted) {
    log.warning('NegRiskAdapter.getConditionId reverted for question {}', [questionId.toHexString()]);
    return;
  }
  const id = marketId(conditionIdCall.value);
  const market = Market.load(id);
  if (market == null) {
    // The underlying condition's ConditionPreparation wasn't indexed (outside
    // our startBlock, or a same-block ordering edge case) — nothing to link.
    return;
  }

  const noCall = adapter.try_getPositionId(questionId, false);
  const yesCall = adapter.try_getPositionId(questionId, true);
  if (noCall.reverted || yesCall.reverted) {
    log.warning('NegRiskAdapter.getPositionId reverted for question {}', [questionId.toHexString()]);
    return;
  }

  const noLookup = new TokenToOutcome(noCall.value.toString());
  noLookup.market = id;
  noLookup.outcomeIndex = 0;
  noLookup.save();

  const yesLookup = new TokenToOutcome(yesCall.value.toString());
  yesLookup.market = id;
  yesLookup.outcomeIndex = 1;
  yesLookup.save();
}

export function handleOutcomeReported(event: OutcomeReported): void {
  const questionId = event.params.questionId;
  const adapter = NegRiskAdapter.bind(event.address);

  const conditionIdCall = adapter.try_getConditionId(questionId);
  if (conditionIdCall.reverted) {
    log.warning('NegRiskAdapter.getConditionId reverted for question {}', [questionId.toHexString()]);
    return;
  }
  const id = marketId(conditionIdCall.value);
  const market = Market.load(id);
  if (market == null) {
    return;
  }

  const resolution = new Resolution(id);
  resolution.market = id;
  resolution.status = 'Resolved';
  resolution.resolutionSource = event.address.toHexString();
  resolution.winningOutcomeIndex = event.params.outcome ? 1 : 0;
  resolution.finalizedAt = event.block.timestamp;
  resolution.save();
}
