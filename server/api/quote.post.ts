import { findCoverOption } from '../utils/catalog'
import { basketTotal, buildBasket, cheapestViableThreshold, priceBasketFromBook } from '../utils/basket'
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

  // Cover that costs more than it can ever pay is not cover. Buying every
  // bucket above a low threshold reaches that point: Madrid July 27 at 33°C
  // priced at 1410 USDC for a 1000 USDC payout.
  const total = basketTotal(priced)
  if (total >= payoutUsdc) {
    const viable = cheapestViableThreshold(priced)
    throw createError({
      statusCode: 422,
      statusMessage: viable === null
        ? `${total} USDC to cover ${payoutUsdc} USDC: no threshold on this market pays for itself right now`
        : `${total} USDC to cover ${payoutUsdc} USDC — raise the threshold to ${viable}°${option.unit} or above`,
    })
  }

  return {
    option: { id: option.id, question: option.question, city: option.city, date: option.date, peril: option.peril, unit: option.unit },
    basket: priced,
    executionMode: EXECUTION_MODE,
  }
})
