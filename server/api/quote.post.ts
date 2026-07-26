import { findCoverOption } from '../utils/catalog'
import { buildBasket, priceBasketFromBook } from '../utils/basket'
import { EXECUTION_MODE } from '../utils/chain'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { optionId, thresholdC, payoutUsdc } = body ?? {}
  if (typeof optionId !== 'string' || typeof thresholdC !== 'number' || typeof payoutUsdc !== 'number')
    throw createError({ statusCode: 400, statusMessage: 'optionId, thresholdC, payoutUsdc required' })
  if (payoutUsdc <= 0 || payoutUsdc > 10_000)
    throw createError({ statusCode: 400, statusMessage: 'payoutUsdc out of range' })

  const option = await findCoverOption(optionId)
  if (!option) throw createError({ statusCode: 404, statusMessage: 'unknown cover option' })
  if (!option.executable) throw createError({ statusCode: 422, statusMessage: `${option.venue} is read-only` })

  const basket = buildBasket(option, thresholdC, payoutUsdc)
  if (!basket) throw createError({ statusCode: 422, statusMessage: 'no bucket covers this threshold' })
  const priced = await priceBasketFromBook(basket)

  return {
    option: { id: option.id, question: option.question, city: option.city, date: option.date, peril: option.peril, unit: option.unit },
    basket: priced,
    executionMode: EXECUTION_MODE,
  }
})
