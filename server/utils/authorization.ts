import { verifyTypedData, type Address } from 'viem'

export const COVER_DOMAIN = { name: 'Parasol', version: '1', chainId: 137 } as const

export const COVER_TYPES = {
  Cover: [
    { name: 'market', type: 'string' },
    { name: 'threshold', type: 'string' },
    { name: 'payout', type: 'string' },
    { name: 'maxPremium', type: 'string' },
    { name: 'holder', type: 'address' },
    { name: 'nonce', type: 'string' },
    { name: 'deadline', type: 'string' },
  ],
} as const

export interface CoverMessage {
  market: string
  threshold: string
  payout: string
  maxPremium: string
  holder: Address
  nonce: string
  deadline: string
}

// An authorization used to be replayable forever: the same signature posted
// twice issued two policies, and in fork mode moved tokens twice. It now
// carries a nonce spent on first use and an expiry.
export const AUTHORIZATION_WINDOW_MS = 15 * 60 * 1000
export const NONCE_RE = /^0x[0-9a-f]{32}$/i

// The persisted policies are the durable record of spent nonces; this covers
// the window before one lands there, which spans every 0G and ENS write
// issuance makes.
const claimed = new Set<string>()

export function claimNonce(nonce: string, spent: (n: string) => boolean): boolean {
  const key = nonce.toLowerCase()
  if (claimed.has(key) || spent(key)) return false
  claimed.add(key)
  return true
}

// The client's key authorizes the basket before anything executes: the broker
// cannot open a position the holder did not sign for. The signed figure is a
// ceiling, so a book that moved between quote and signature does not void a
// cover the holder still wants — the caller must check the repriced total
// against it.
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
