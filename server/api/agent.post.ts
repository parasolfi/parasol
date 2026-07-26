import { getCatalog, findCoverOption } from '../utils/catalog'
import { buildBasket } from '../utils/basket'
import { runAgentTurn } from '../utils/agent'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const history = body?.messages
  if (!Array.isArray(history) || history.some((m) => !['user', 'assistant'].includes(m?.role) || typeof m?.content !== 'string'))
    throw createError({ statusCode: 400, statusMessage: 'messages: [{role: user|assistant, content}] required' })
  if (history.length > 40) throw createError({ statusCode: 400, statusMessage: 'conversation too long' })

  const options = await getCatalog()
  const turn = await runAgentTurn(history, options)

  if (!turn.exposure) return { ...turn, quote: null, alternatives: [] }

  const option = await findCoverOption(turn.exposure.optionId)
  const basket = option ? buildBasket(option, turn.exposure.threshold, turn.exposure.payoutUsdc) : null
  const alternatives = option
    ? options
        .filter((o) => o.city === option.city && o.peril === option.peril && o.id !== option.id)
        .slice(0, 3)
        .map((o) => {
          const b = buildBasket(o, turn.exposure!.threshold, turn.exposure!.payoutUsdc)
          return b ? { id: o.id, question: o.question, date: o.date, premiumUsdc: b.premiumUsdc } : null
        })
        .filter(Boolean)
    : []
  return {
    ...turn,
    quote: option && basket ? { option: { id: option.id, question: option.question, city: option.city, date: option.date, peril: option.peril, unit: option.unit }, basket } : null,
    alternatives,
  }
})
