import type { Address } from 'viem'
import { resolveOwner, reverseName } from '../../utils/ens'

export default defineEventHandler(async (event) => {
  const { name, address } = getQuery(event)
  if (typeof name === 'string' && name.endsWith('.eth')) return { address: await resolveOwner(name) }
  if (typeof address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(address))
    return { name: await reverseName(address as Address) }
  throw createError({ statusCode: 400, statusMessage: 'name=<x.eth> or address=<0x…> required' })
})
