import { createPublicClient, fallback, http } from 'viem'
import { polygon } from 'viem/chains'
import { POLYGON_RPCS } from './polymarket'

let publicClient: ReturnType<typeof createPublicClient> | null = null

export function polygonClient() {
  publicClient ??= createPublicClient({
    chain: polygon,
    transport: fallback(POLYGON_RPCS.map(url => http(url))),
  })
  return publicClient
}
