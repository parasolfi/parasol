import type { Address } from 'viem'
import { listPolicies } from '../utils/policies'
import { ENS_PARENT, policyNameFromQuestion, readPolicyRecord, reverseName } from '../utils/ens'

// ensPublished says whether the policy's records actually resolve on ENS today,
// so the UI never links a name that would return nothing.
export default defineEventHandler(async () => {
  const policies = await Promise.all(
    listPolicies().map(async (p) => {
      const ensName = policyNameFromQuestion(p.question, p.id)
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
