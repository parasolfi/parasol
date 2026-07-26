import type { Address } from 'viem'
import { listPolicies } from '../utils/policies'
import { findCoverOption } from '../utils/catalog'
import { ENS_PARENT, policyName, readPolicyRecord, reverseName } from '../utils/ens'

// ensName is the reserved naming scheme; ensPublished says whether the policy's
// records actually resolve on ENS today, so the UI never links a name that
// would return nothing.
export default defineEventHandler(async () => {
  const policies = await Promise.all(
    listPolicies().map(async (p) => {
      const option = await findCoverOption(p.eventSlug)
      const ensName = option ? policyName(option.city, option.peril, option.date, p.id) : null
      const published = ensName ? await readPolicyRecord(ensName, 'parasol.status') : null
      return {
        ...p,
        holderName: await reverseName(p.holder as Address),
        ensName,
        ensPublished: published !== null,
        ensParent: ENS_PARENT,
      }
    }),
  )
  return { policies }
})
