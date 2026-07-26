// Studio deployment, slug "freefi", account id 107915. version/latest rather
// than a pinned version so a redeploy does not need an env change.
// POLYMARKET_SUBGRAPH_URL still overrides it — point that at a fork of this
// subgraph rather than editing the default.
const POLYMARKET_SUBGRAPH =
  process.env.POLYMARKET_SUBGRAPH_URL ??
  'https://api.studio.thegraph.com/query/107915/freefi/version/latest'

export interface IndexedResolution {
  winningOutcomeIndex: number
  finalizedAt: string
  resolutionSource: string
}

// The subgraph indexes the on-chain payout report, so it is the resolution
// authority — the venue API is only a fallback for conditions outside the
// indexed block range.
export async function getIndexedResolution(conditionId: string): Promise<IndexedResolution | null> {
  try {
    const res = await fetch(POLYMARKET_SUBGRAPH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query Resolution($id: String!) {
          markets(where: { venueConditionId: $id }, first: 1) {
            resolution { status winningOutcomeIndex finalizedAt resolutionSource }
          }
        }`,
        variables: { id: conditionId },
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const resolution = data?.data?.markets?.[0]?.resolution
    if (!resolution || resolution.status !== 'Resolved' || resolution.winningOutcomeIndex === null) return null
    return {
      winningOutcomeIndex: Number(resolution.winningOutcomeIndex),
      finalizedAt: String(resolution.finalizedAt ?? ''),
      resolutionSource: String(resolution.resolutionSource ?? ''),
    }
  } catch {
    return null
  }
}
