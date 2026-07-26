import { brokerIdentity } from '../../utils/ens'

export default defineEventHandler(async () => ({ broker: await brokerIdentity() }))
