import { encodeFunctionData, parseAbi, type Address } from 'viem'
import { getPolymarketMarket } from '../../adapters/polymarket/polymarket'
import { listPolicies, updatePolicyStatus } from '../utils/policies'
import { forkRpc } from '../utils/chain'

const USDCE: Address = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
// Aave v3 aPolUSDC token contract — deepest USDC.e balance on Polygon,
// impersonable on anvil like any address.
const USDCE_WHALE: Address = '0x625E7708f30cA75bfd92586e17077590C60eb4cD'
const erc20Abi = parseAbi(['function transfer(address to, uint256 amount) returns (bool)'])

async function payOut(holder: Address, amountUsdc: number) {
  await forkRpc('anvil_impersonateAccount', [USDCE_WHALE])
  await forkRpc('anvil_setBalance', [USDCE_WHALE, '0x1000000000000000000'])
  const txHash = (await forkRpc('eth_sendTransaction', [
    {
      from: USDCE_WHALE,
      to: USDCE,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [holder, BigInt(Math.round(amountUsdc * 1e6))],
      }),
    },
  ])) as string
  await forkRpc('anvil_stopImpersonatingAccount', [USDCE_WHALE])
  const receipt = (await forkRpc('eth_getTransactionReceipt', [txHash])) as { status: string }
  if (receipt?.status !== '0x1') throw new Error(`payout transfer reverted (${txHash})`)
}

// Reads real Polymarket resolutions for every issued policy: a policy pays
// when one of its bucket conditions resolved to YES (outcomeIndex 0).
export default defineEventHandler(async () => {
  const updates: { id: number; status: string }[] = []
  for (const p of listPolicies()) {
    if (p.status !== 'Issued' && p.status !== 'ResolvedYes') continue

    if (p.status === 'Issued') {
      const buckets = await Promise.all(
        p.tokenIds.map(async (tokenId, i) => {
          const conditionId = p.conditionIds?.[i]
          if (!conditionId) return null
          const m = await getPolymarketMarket(conditionId)
          if (!m?.resolution || m.resolution.status !== 'Resolved') return null
          const yes = m.outcomes.find((o) => o.venueOutcomeId === tokenId)
          return { won: yes ? m.resolution.winningOutcomeIndex === yes.outcomeIndex : false }
        }),
      )
      if (buckets.some((b) => b === null)) continue
      const won = buckets.some((b) => b!.won)
      updatePolicyStatus(p.id, won ? 'ResolvedYes' : 'ResolvedNo')
      if (!won) {
        updates.push({ id: p.id, status: 'ResolvedNo' })
        continue
      }
    }

    await payOut(p.holder as Address, p.shares)
    updatePolicyStatus(p.id, 'Paid')
    updates.push({ id: p.id, status: 'Paid' })
  }
  return { updates }
})
