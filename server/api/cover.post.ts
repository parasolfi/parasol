import { encodeFunctionData, type Address } from 'viem'
import { findCoverOption } from '../utils/catalog'
import { buildBasket, priceBasketFromBook } from '../utils/basket'
import { issuePolicy } from '../utils/policies'
import { CTF_ADDRESS, ctfAbi, forkClient, forkRpc, findHolders } from '../utils/chain'
import { verifyCoverAuthorization } from '../utils/authorization'

// Fork-mode settlement: impersonate live holders of each leg's YES token and
// deliver the exact clobTokenIds at the quoted size. Real prices, real tokens,
// local settlement — the honest geoblock fallback (SPEC.md §10).
interface Leg {
  tokenId: string
  conditionId: string
  label: string
  shares: number
}

interface Transfer {
  from: Address
  amount: bigint
}

/**
 * Reads only. Delivery used to transfer as it walked the holders, so a leg that
 * ran dry left earlier legs delivered, a partial transfer on the failing one,
 * and no policy issued — the holder kept positions nobody had sold them. Every
 * leg is now planned before anything moves.
 */
async function planLeg(leg: Leg): Promise<Transfer[] | { shortfall: bigint }> {
  const wanted = BigInt(Math.round(leg.shares * 1e6))
  const holders = await findHolders(leg.conditionId, leg.tokenId)

  const transfers: Transfer[] = []
  let remaining = wanted

  for (const h of holders) {
    if (remaining === 0n) break
    const balance = (await forkClient.readContract({
      address: CTF_ADDRESS,
      abi: ctfAbi,
      functionName: 'balanceOf',
      args: [h.address, BigInt(leg.tokenId)],
    })) as bigint
    if (balance === 0n) continue
    const amount = balance < remaining ? balance : remaining
    transfers.push({ from: h.address, amount })
    remaining -= amount
  }

  return remaining > 0n ? { shortfall: remaining } : transfers
}

async function runTransfers(tokenId: string, transfers: Transfer[], to: Address) {
  for (const transfer of transfers) {
    await forkRpc('anvil_impersonateAccount', [transfer.from])
    await forkRpc('anvil_setBalance', [transfer.from, '0x1000000000000000000'])
    await forkRpc('eth_sendTransaction', [
      {
        from: transfer.from,
        to: CTF_ADDRESS,
        data: encodeFunctionData({
          abi: ctfAbi,
          functionName: 'safeTransferFrom',
          args: [transfer.from, to, BigInt(tokenId), transfer.amount, '0x'],
        }),
      },
    ])
    await forkRpc('anvil_stopImpersonatingAccount', [transfer.from])
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { optionId, threshold, payoutUsdc, holder, profile, signature, maxPremiumUsdc } = body ?? {}
  if (typeof optionId !== 'string' || typeof threshold !== 'number' || typeof payoutUsdc !== 'number' || typeof holder !== 'string')
    throw createError({ statusCode: 400, statusMessage: 'optionId, threshold, payoutUsdc, holder required' })
  if (!/^0x[0-9a-fA-F]{40}$/.test(holder)) throw createError({ statusCode: 400, statusMessage: 'holder must be an address' })
  if (typeof maxPremiumUsdc !== 'number' || !(maxPremiumUsdc > 0))
    throw createError({ statusCode: 400, statusMessage: 'maxPremiumUsdc required' })

  const option = await findCoverOption(optionId)
  if (!option) throw createError({ statusCode: 404, statusMessage: 'unknown cover option' })
  const snapshot = buildBasket(option, threshold, payoutUsdc)
  if (!snapshot) throw createError({ statusCode: 422, statusMessage: 'no bucket covers this threshold' })

  // Quote and cover must price the same way. buildBasket alone is a top-of-book
  // snapshot, which is not what the client was shown or signed against.
  const basket = await priceBasketFromBook(snapshot)

  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signature))
    throw createError({ statusCode: 401, statusMessage: 'cover authorization signature required' })
  const authorized = await verifyCoverAuthorization(
    {
      market: option.question,
      threshold: `${threshold}°${option.unit}`,
      payout: `${payoutUsdc} USDC`,
      maxPremium: `${maxPremiumUsdc} USDC`,
      holder: holder as Address,
    },
    signature as `0x${string}`,
  )
  if (!authorized) throw createError({ statusCode: 401, statusMessage: 'authorization does not match this cover' })

  const total = Math.round((basket.premiumUsdc + basket.feesUsdc) * 100) / 100
  if (total > maxPremiumUsdc)
    throw createError({
      statusCode: 409,
      statusMessage: `book moved: ${total} USDC exceeds the authorized ${maxPremiumUsdc} USDC`,
    })

  try {
    await forkClient.getBlockNumber()
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'fork not running (anvil on :8545)' })
  }

  // Plan every leg first: one short leg aborts the whole cover before a single
  // token moves. Each fork cover permanently drains the holders it impersonates,
  // so a bucket that ran dry needs a re-fork, not a retry.
  const plans: { leg: Leg, transfers: Transfer[] }[] = []
  for (const leg of basket.legs) {
    const planned = await planLeg(leg)
    if ('shortfall' in planned) {
      throw createError({
        statusCode: 409,
        statusMessage: `fork is ${Number(planned.shortfall) / 1e6} shares short on "${leg.label}" — re-fork anvil before retrying`,
      })
    }
    plans.push({ leg, transfers: planned })
  }

  for (const plan of plans) await runTransfers(plan.leg.tokenId, plan.transfers, holder as Address)

  const policy = await issuePolicy(
    {
      holder,
      eventSlug: option.id,
      question: option.question,
      tokenIds: basket.legs.map((l) => l.tokenId),
      conditionIds: basket.legs.map((l) => l.conditionId),
      shares: payoutUsdc,
      premiumUsdc: basket.premiumUsdc,
      feesUsdc: basket.feesUsdc,
      profile: typeof profile === 'string' ? profile : '',
      authorization: signature,
    },
    { city: option.city, peril: option.peril, date: option.date },
  )

  return { policy, basket }
})
