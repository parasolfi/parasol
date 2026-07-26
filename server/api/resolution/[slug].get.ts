import { getEventResolution } from '../../utils/resolution'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'slug is required' })
  }

  const resolution = await getEventResolution(slug)
  if (!resolution) {
    throw createError({ statusCode: 404, statusMessage: `event ${slug} not found on Gamma` })
  }

  return resolution
})
