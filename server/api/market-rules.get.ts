import { getMarketRules, isGeoBlocked } from '../utils/clob'

// The browser needs tick size and the negRisk flag to build a signable order:
// a wrong tick is rejected outright, and a missing negRisk flag signs against
// the wrong exchange domain (SPEC.md §4.3.1).
export default defineEventHandler(async (event) => {
  const { conditionId } = getQuery(event)
  if (typeof conditionId !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(conditionId))
    throw createError({ statusCode: 400, statusMessage: 'conditionId required' })

  const rules = await getMarketRules(conditionId)
  if (!rules) throw createError({ statusCode: 404, statusMessage: 'unknown market' })

  return { ...rules, geoBlocked: await isGeoBlocked() }
})
