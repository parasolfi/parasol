import { encodeFunctionData, type Address } from 'viem'
import { findCoverOption } from '../utils/catalog'
import { buildBasket } from '../utils/basket'
import { issuePolicy } from '../utils/policies'
import { CTF_ADDRESS, ctfAbi, forkClient, forkRpc, findHolders } from '../utils/chain'
import { verifyCoverAuthorization } from '../utils/authorization'

// Fork-mode settlement: impersonate a live holder of each leg's YES token
// and deliver the exact clobTokenIds at the quoted size. Real prices, real
// tokens, local settlement — the honest geoblock fallback (SPEC.md §10).
async function deliverLeg(leg: { tokenId: string; conditionId: string; shares: number }, to: Address) {
  const wanted = BigInt(Math.round(leg.shares * 1e6))
  const holders = await findHolders(leg.conditionId, leg.tokenId)
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
    await forkRpc('anvil_impersonateAccount', [h.address])
    await forkRpc('anvil_setBalance', [h.address, '0x1000000000000000000'])
    await forkRpc('eth_sendTransaction', [
      {
        from: h.address,
        to: CTF_ADDRESS,
        data: encodeFunctionData({
          abi: ctfAbi,
          functionName: 'safeTransferFrom',
          args: [h.address, to, BigInt(leg.tokenId), amount, '0x'],
        }),
      },
    ])
    await forkRpc('anvil_stopImpersonatingAccount', [h.address])
    remaining -= amount
  }
  if (remaining > 0n) throw new Error(`liquidity gap on ${leg.tokenId.slice(0, 12)}…: missing ${remaining}`)
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { optionId, threshold, payoutUsdc, holder, profile, signature } = body ?? {}
  if (typeof optionId !== 'string' || typeof threshold !== 'number' || typeof payoutUsdc !== 'number' || typeof holder !== 'string')
    throw createError({ statusCode: 400, statusMessage: 'optionId, threshold, payoutUsdc, holder required' })
  if (!/^0x[0-9a-fA-F]{40}$/.test(holder)) throw createError({ statusCode: 400, statusMessage: 'holder must be an address' })

  const option = await findCoverOption(optionId)
  if (!option) throw createError({ statusCode: 404, statusMessage: 'unknown cover option' })
  const basket = buildBasket(option, threshold, payoutUsdc)
  if (!basket) throw createError({ statusCode: 422, statusMessage: 'no bucket covers this threshold' })

  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signature))
    throw createError({ statusCode: 401, statusMessage: 'cover authorization signature required' })
  const authorized = await verifyCoverAuthorization(
    {
      market: option.question,
      threshold: `${threshold}°${option.unit}`,
      payout: `${payoutUsdc} USDC`,
      premium: `${basket.premiumUsdc} USDC`,
      holder: holder as Address,
    },
    signature as `0x${string}`,
  )
  if (!authorized) throw createError({ statusCode: 401, statusMessage: 'authorization does not match this quote' })

  try {
    await forkClient.getBlockNumber()
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'fork not running (anvil on :8545)' })
  }

  for (const leg of basket.legs) await deliverLeg(leg, holder as Address)

  const policy = await issuePolicy(
    {
      holder,
      eventSlug: option.id,
      question: option.question,
      tokenIds: basket.legs.map((l) => l.tokenId),
      conditionIds: basket.legs.map((l) => l.conditionId),
      shares: payoutUsdc,
      premiumUsdc: basket.premiumUsdc,
      profile: typeof profile === 'string' ? profile : '',
      authorization: signature,
    },
    { city: option.city, peril: option.peril, date: option.date },
  )

  return { policy, basket }
})
