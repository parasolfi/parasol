import { ORDERBOOK_SUBGRAPH } from './polymarket'

export interface MarketLiquidity {
  tokenId: string
  tradesQuantity: number
  scaledCollateralVolume: number
}

interface GraphResponse<T> {
  data?: T
  errors?: { message: string }[]
}

async function query<T>(document: string, variables: Record<string, unknown>): Promise<T> {
  const response = await $fetch<GraphResponse<T>>(ORDERBOOK_SUBGRAPH, {
    method: 'POST',
    body: { query: document, variables },
  })

  if (response.errors?.length) {
    throw createError({ statusCode: 502, statusMessage: response.errors.map(error => error.message).join('; ') })
  }
  if (!response.data) {
    throw createError({ statusCode: 502, statusMessage: 'subgraph returned no data' })
  }

  return response.data
}

export async function getIndexedHead(): Promise<number> {
  const data = await query<{ _meta: { block: { number: number } } }>(
    '{ _meta { block { number } } }',
    {},
  )
  return data._meta.block.number
}

/**
 * The public orderbook subgraph does not index resolution (schema: marketData,
 * orderbook, orderFilledEvent, ordersMatched*), and it returns nothing for the
 * daily negRisk markets — it tracks the older exchange. Resolution comes from
 * the on-chain CTF instead; see SPEC.md §8.
 */
export async function getMarketLiquidity(tokenIds: string[]): Promise<Map<string, MarketLiquidity>> {
  if (tokenIds.length === 0) return new Map()

  const data = await query<{ orderbooks: { id: string, tradesQuantity: string, scaledCollateralVolume: string }[] }>(
    `query Liquidity($ids: [ID!]!) {
      orderbooks(where: { id_in: $ids }) {
        id
        tradesQuantity
        scaledCollateralVolume
      }
    }`,
    { ids: tokenIds },
  )

  return new Map(
    data.orderbooks.map(book => [
      book.id,
      {
        tokenId: book.id,
        tradesQuantity: Number(book.tradesQuantity),
        scaledCollateralVolume: Number(book.scaledCollateralVolume),
      },
    ]),
  )
}
