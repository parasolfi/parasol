import { issuePolicy } from '../../utils/policies'

// Seeds a historical policy through the real issuance path, so yesterday's
// paid cover carries the same proofs as one bought live: encrypted profile on
// 0G Storage, attestation on Galileo, and its own ENS name. Writing the store
// directly (as the seed script used to) produced a policy with none of them.
export default defineEventHandler(async (event) => {
<<<<<<< HEAD
=======
  // It issues a policy with no authorization at all, spending the server's gas
  // on Galileo and its ENS write budget. Nitro ships every route in server/,
  // including this one, so the guard has to be here.
  if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'not found' })

>>>>>>> origin/main
  const body = await readBody(event)
  const { holder, eventSlug, question, tokenIds, conditionIds, shares, premiumUsdc, profile, issuedAt } = body ?? {}
  if (
    typeof holder !== 'string' ||
    typeof question !== 'string' ||
    !Array.isArray(tokenIds) ||
    !Array.isArray(conditionIds) ||
    typeof shares !== 'number'
  )
    throw createError({ statusCode: 400, statusMessage: 'holder, question, tokenIds, conditionIds, shares required' })

  const naming = question.match(/(highest|lowest) temperature in (.+?) on ([A-Za-z]+\s*\d{1,2})/i)

  const policy = await issuePolicy(
    {
      holder,
      eventSlug: typeof eventSlug === 'string' ? eventSlug : question,
      question,
      tokenIds: tokenIds.map(String),
      conditionIds: conditionIds.map(String),
      shares,
      premiumUsdc: typeof premiumUsdc === 'number' ? premiumUsdc : 0,
      feesUsdc: 0,
      profile: typeof profile === 'string' ? profile : '',
      authorization: 'seeded',
<<<<<<< HEAD
=======
      nonce: '',
>>>>>>> origin/main
      ...(typeof issuedAt === 'string' ? { issuedAt } : {}),
    },
    naming
      ? { city: naming[2]!, peril: naming[1]!.toLowerCase() === 'highest' ? 'heat' : 'cold', date: naming[3]! }
      : undefined,
  )

  return { policy }
})
