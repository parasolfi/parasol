import type { Address } from 'viem'
import { listPolicies } from '../utils/policies'
import { findCoverOption } from '../utils/catalog'
import { policyName, reverseName } from '../utils/ens'

export default defineEventHandler(async () => {
  const policies = await Promise.all(
    listPolicies().map(async (p) => {
      const option = await findCoverOption(p.eventSlug)
      return {
        ...p,
        holderName: await reverseName(p.holder as Address),
        ensName: option ? policyName(option.city, option.peril, option.date, p.id) : null,
      }
    }),
  )
  return { policies }
})
