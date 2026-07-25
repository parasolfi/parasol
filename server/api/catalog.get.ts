import { getCatalog } from '../utils/catalog'

export default defineEventHandler(async () => {
  return { options: await getCatalog() }
})
