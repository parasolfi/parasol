import { createPublicClient, http, parseAbi, type Address } from 'viem'

export const CTF_ADDRESS: Address = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045'
export const FORK_RPC = process.env.FORK_RPC_URL ?? 'http://127.0.0.1:8545'
export const GALILEO_RPC = process.env.ZG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai'

export const ctfAbi = parseAbi([
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
  'function balanceOf(address owner, uint256 id) view returns (uint256)',
])

export const registryAbi = parseAbi([
  'function issue(address holder, bytes32 profileHash, string eventSlug, uint256[] tokenIds, uint256 shares, uint256 premium) returns (uint256)',
  'function setStatus(uint256 id, uint8 s)',
  'function nextId() view returns (uint256)',
  'event PolicyIssued(uint256 indexed id, address indexed holder, string eventSlug, bytes32 profileHash)',
])

export const forkClient = createPublicClient({ transport: http(FORK_RPC) })

// polygon-rpc.com answers "tenant disabled" (403) as of 2026-07-26.
export const POLYGON_RPC = process.env.POLYGON_RPC_URL ?? 'https://polygon-bor-rpc.publicnode.com'

// Real mainnet, not the fork: venue mode proves delivery by reading the
// holder's ERC-1155 balance on Polygon, which needs no API credentials and so
// keeps the client's CLOB session on the client (SPEC.md §0).
export const polygonClient = createPublicClient({ transport: http(POLYGON_RPC) })

export type ExecutionMode = 'fork' | 'venue'

export const EXECUTION_MODE: ExecutionMode = process.env.EXECUTION_MODE === 'venue' ? 'venue' : 'fork'

export async function forkRpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(FORK_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const data = await res.json()
  if (data.error) throw new Error(`${method}: ${data.error.message}`)
  return data.result
}

export interface TokenHolder {
  address: Address
  amount: number
}

// Polymarket's data-api lists live holders per condition — the fork leg
// impersonates one instead of splitting (negRisk position ids cannot be
// reproduced with a raw CTF split, see SPEC.md §10).
export async function findHolders(conditionId: string, tokenId: string): Promise<TokenHolder[]> {
  // 20 was not enough depth on the thin tail buckets: a 1000-share leg can
  // exhaust the top holders and abort the cover on an otherwise fresh fork.
  const res = await fetch(`https://data-api.polymarket.com/holders?market=${conditionId}&limit=100`)
  if (!res.ok) return []
  const data = await res.json()
  const entry = (Array.isArray(data) ? data : []).find((t: any) => t.token === tokenId)
  return (entry?.holders ?? [])
    .map((h: any) => ({ address: h.proxyWallet as Address, amount: Number(h.amount) }))
    .filter((h: TokenHolder) => h.address && h.amount > 0)
    .sort((a: TokenHolder, b: TokenHolder) => b.amount - a.amount)
}
