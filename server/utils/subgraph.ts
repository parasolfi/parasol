// The Studio subgraph is slugged "freefi". The fallback below is a guess at the
// query URL: Studio mints its own numeric id per subgraph, so set
// POLYMARKET_SUBGRAPH_URL to the URL the deploy prints — otherwise every lookup
// misses and the watcher silently falls back to the venue API.
const POLYMARKET_SUBGRAPH =
  process.env.POLYMARKET_SUBGRAPH_URL ??
  'https://api.studio.thegraph.com/query/1756988/freefi/version/latest'

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

export async function getSubgraphHead(): Promise<number | null> {
  try {
    const res = await fetch(POLYMARKET_SUBGRAPH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ _meta { block { number } } }' }),
    })
    const data = await res.json()
    return Number(data?.data?._meta?.block?.number) || null
  } catch {
    return null
  }
}
