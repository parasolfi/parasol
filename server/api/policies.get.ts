import { listPolicies } from '../utils/policies'

export default defineEventHandler(() => ({ policies: listPolicies() }))
