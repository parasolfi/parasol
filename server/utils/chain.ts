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
  const res = await fetch(`https://data-api.polymarket.com/holders?market=${conditionId}&limit=20`)
  if (!res.ok) return []
  const data = await res.json()
  const entry = (Array.isArray(data) ? data : []).find((t: any) => t.token === tokenId)
  return (entry?.holders ?? [])
    .map((h: any) => ({ address: h.proxyWallet as Address, amount: Number(h.amount) }))
    .filter((h: TokenHolder) => h.address && h.amount > 0)
    .sort((a: TokenHolder, b: TokenHolder) => b.amount - a.amount)
}
