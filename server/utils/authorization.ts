import { verifyTypedData, type Address } from 'viem'

export const COVER_DOMAIN = { name: 'Parasol', version: '1', chainId: 137 } as const

export const COVER_TYPES = {
  Cover: [
    { name: 'market', type: 'string' },
    { name: 'threshold', type: 'string' },
    { name: 'payout', type: 'string' },
    { name: 'premium', type: 'string' },
    { name: 'holder', type: 'address' },
  ],
} as const

export interface CoverMessage {
  market: string
  threshold: string
  payout: string
  premium: string
  holder: Address
}

// The client's key authorizes the basket before anything executes: Parasol
// cannot open a position the holder did not sign for.
export async function verifyCoverAuthorization(message: CoverMessage, signature: `0x${string}`): Promise<boolean> {
  try {
    return await verifyTypedData({
      address: message.holder,
      domain: COVER_DOMAIN,
      types: COVER_TYPES,
      primaryType: 'Cover',
      message,
      signature,
    })
  } catch {
    return false
  }
}
