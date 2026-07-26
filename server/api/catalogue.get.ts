import { getCatalogue } from '../utils/catalogue'

export default defineEventHandler(async (event) => {
  const { city, peril, refresh } = getQuery(event)

  let events = await getCatalogue(refresh === 'true')

  if (typeof city === 'string' && city.length > 0) {
    const needle = city.toLowerCase()
    events = events.filter(coverEvent => coverEvent.city.includes(needle))
  }

  if (peril === 'heat' || peril === 'cold') {
    events = events.filter(coverEvent => coverEvent.peril === peril)
  }

  return { count: events.length, events }
})
