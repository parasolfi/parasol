<script setup lang="ts">
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface Quote {
  option: { id: string; question: string; city: string; date: string; peril: string; unit: string }
  basket: {
    legs: { tokenId: string; conditionId: string; label: string; ask: number; shares: number; limitPrice?: number }[]
    payoutUsdc: number
    premiumUsdc: number
    feesUsdc: number
    maxPremiumUsdc: number
    impliedProbability: number
    signatureCount: number
  }
  executionMode?: 'fork' | 'venue'
}

interface Exposure {
  optionId: string
  threshold: number
  payoutUsdc: number
  rationale: string
}

interface Policy {
  id: number
  question: string
  shares: number
  premiumUsdc: number
  status: string
  issuedAt: string
  chain: { network: string; registry: string; txHash: string } | null
  storage: { rootHash: string; txHash: string } | null
  holderName: string | null
  ensName: string | null
  ensPublished: boolean
  ensParent: string
}

interface Alternative {
  id: string
  question: string
  date: string
  premiumUsdc: number
}

const messages = ref<ChatMessage[]>([])
const draft = ref('')
const thinking = ref(false)
type InferenceSource = 'zg-router' | 'zg-compute' | 'mock'
const agentSource = ref<InferenceSource | null>(null)
const sourceLabel: Record<InferenceSource, string> = {
  'zg-router': 'Live on 0G Compute',
  'zg-compute': 'Live on 0G Compute',
  mock: 'Offline fallback',
}
const quote = ref<Quote | null>(null)
const exposure = ref<Exposure | null>(null)
const alternatives = ref<Alternative[]>([])
const holder = ref('')
const manualEntry = ref(false)
const buying = ref(false)
const buyError = ref('')
// Venue mode asks for several wallet confirmations in a row; naming the current
// one stops it looking like a hang.
const buyStep = ref('')
const clob = useClob()

const holderEns = ref<string | null>(null)
const shortHolder = computed(() =>
  holderEns.value ? holderEns.value : holder.value ? `${holder.value.slice(0, 6)}…${holder.value.slice(-4)}` : '',
)

// Accepts an ENS name as well as an address, and shows the holder's own name
// back to them once one reverse-resolves.
async function normalizeHolder(input: string) {
  const value = input.trim()
  if (value.endsWith('.eth')) {
    const { address } = await $fetch<{ address: string | null }>('/api/ens/resolve', { query: { name: value } })
    if (address) {
      holder.value = address
      holderEns.value = value
    }
    return
  }
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) {
    holder.value = value
    const { name } = await $fetch<{ name: string | null }>('/api/ens/resolve', { query: { address: value } })
    holderEns.value = name
  }
}
const { data: policiesData, refresh: refreshPolicies } = useFetch<{ policies: Policy[] }>('/api/policies')
const { data: brokerData } = useFetch<{ broker: { name: string; address: string; policiesPublished: number } | null }>(
  '/api/ens/broker',
)

const statusLabel: Record<string, string> = {
  Issued: 'Active',
  ResolvedYes: 'Event happened — payout due',
  ResolvedNo: 'No event — expired',
  Paid: 'Paid out',
}

async function send() {
  const content = draft.value.trim()
  if (!content || thinking.value) return
  messages.value.push({ role: 'user', content })
  draft.value = ''
  thinking.value = true
  try {
    const res = await $fetch<{ reply: string; exposure: Exposure | null; source: 'zg-router' | 'mock'; quote: Quote | null; alternatives: Alternative[] }>(
      '/api/agent',
      { method: 'POST', body: { messages: messages.value } },
    )
    messages.value.push({ role: 'assistant', content: res.reply })
    agentSource.value = res.source
    if (res.quote) {
      quote.value = res.quote
      exposure.value = res.exposure
      alternatives.value = res.alternatives ?? []
    }
  } catch {
    messages.value.push({ role: 'assistant', content: 'Something went wrong on my side — say that again?' })
  } finally {
    thinking.value = false
  }
}

const POLYGON = {
  chainId: '0x89',
  chainName: 'Polygon',
  nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  // polygon-rpc.com returns "tenant disabled" (403) as of 2026-07-26, so a
  // wallet that has to add Polygon would land on a dead endpoint.
  rpcUrls: ['https://polygon-bor-rpc.publicnode.com'],
  blockExplorerUrls: ['https://polygonscan.com'],
}

// The Cover authorization is signed against chainId 137, so the wallet has to
// be on Polygon or the signature verifies against the wrong domain.
async function ensurePolygon() {
  const eth = (window as any).ethereum
  if (!eth) return
  if ((await eth.request({ method: 'eth_chainId' })) === POLYGON.chainId) return
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: POLYGON.chainId }] })
  } catch (err: any) {
    if (err?.code !== 4902) throw err
    await eth.request({ method: 'wallet_addEthereumChain', params: [POLYGON] })
  }
}

async function connectWallet() {
  const eth = (window as any).ethereum
  if (!eth) {
    manualEntry.value = true
    return
  }
  const accounts = await eth.request({ method: 'eth_requestAccounts' })
  if (accounts?.[0]) await normalizeHolder(accounts[0])
  await ensurePolygon()
}

const SEPOLIA_CHAIN_ID = '0xaa36a7'
const authorizing = ref(false)
const authorizeState = ref<'idle' | 'done' | 'error'>('idle')

// The name owner grants the server write access to the policy record keys by
// signing one multicall in their own wallet — no key ever leaves MetaMask.
async function authorizeEnsWriter() {
  const eth = (window as any).ethereum
  if (!eth || authorizing.value) return
  authorizing.value = true
  authorizeState.value = 'idle'
  try {
    const { tx } = await $fetch<{ tx: { to: string; data: string } }>('/api/ens/authorize-tx')
    const [from] = await eth.request({ method: 'eth_requestAccounts' })
    if ((await eth.request({ method: 'eth_chainId' })) !== SEPOLIA_CHAIN_ID)
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: SEPOLIA_CHAIN_ID }] })
    await eth.request({ method: 'eth_sendTransaction', params: [{ from, to: tx.to, data: tx.data }] })
    authorizeState.value = 'done'
  } catch {
    authorizeState.value = 'error'
  } finally {
    authorizing.value = false
  }
}

async function switchOption(alt: Alternative) {
  if (!exposure.value) return
  const res = await $fetch<{ option: Quote['option']; basket: Quote['basket'] }>('/api/quote', {
    method: 'POST',
    body: { optionId: alt.id, thresholdC: exposure.value.threshold, payoutUsdc: exposure.value.payoutUsdc },
  })
  const previous = quote.value
  quote.value = res
  exposure.value = { ...exposure.value, optionId: alt.id }
  if (previous)
    alternatives.value = [
      { id: previous.option.id, question: previous.option.question, date: previous.option.date, premiumUsdc: previous.basket.premiumUsdc },
      ...alternatives.value.filter((a) => a.id !== alt.id),
    ]
}

const COVER_DOMAIN = { name: 'Parasol', version: '1', chainId: 137 }
const COVER_TYPES = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
  ],
  Cover: [
    { name: 'market', type: 'string' },
    { name: 'threshold', type: 'string' },
    { name: 'payout', type: 'string' },
    { name: 'maxPremium', type: 'string' },
    { name: 'holder', type: 'address' },
  ],
}

async function signCover(): Promise<string> {
  if (!quote.value || !exposure.value) throw new Error('no quote')
  const eth = (window as any).ethereum
  if (!eth) throw new Error('no wallet: connect one to authorize the cover')
  await ensurePolygon()
  const message = {
    market: quote.value.option.question,
    threshold: `${exposure.value.threshold}°${quote.value.option.unit}`,
    payout: `${exposure.value.payoutUsdc} USDC`,
    maxPremium: `${quote.value.basket.maxPremiumUsdc} USDC`,
    holder: holder.value,
  }
  return await eth.request({
    method: 'eth_signTypedData_v4',
    params: [holder.value, JSON.stringify({ domain: COVER_DOMAIN, types: COVER_TYPES, primaryType: 'Cover', message })],
  })
}

async function buy() {
  if (!exposure.value || !holder.value || buying.value) return
  buying.value = true
  buyError.value = ''
  try {
    const maxPremiumUsdc = quote.value!.basket.maxPremiumUsdc
    const signature = await signCover()

    // Venue mode: the wallet buys the positions on Polymarket itself, before
    // the server is told anything. Parasol never holds funds and never relays
    // an order — the CLOB accepts cross-origin posts straight from the browser.
    if (quote.value!.executionMode === 'venue') {
      buyStep.value = 'Approving collateral…'
      await clob.ensureCollateral(maxPremiumUsdc)

      buyStep.value = 'Signing in to Polymarket…'
      await clob.authenticate()

      buyStep.value = `Buying ${quote.value!.basket.legs.length} position(s)…`
      const fills = await clob.executeBasket(
        quote.value!.basket.legs.map((l) => ({
          tokenId: l.tokenId,
          conditionId: l.conditionId,
          label: l.label,
          shares: l.shares,
          limitPrice: l.limitPrice ?? l.ask,
        })),
      )

      const failed = fills.filter((f) => f.error)
      if (failed.length) throw new Error(failed.map((f) => `${f.leg.label}: ${f.error}`).join(' · '))

      buyStep.value = 'Confirming settlement…'
    }

    await $fetch('/api/cover', {
      method: 'POST',
      body: {
        optionId: exposure.value.optionId,
        threshold: exposure.value.threshold,
        payoutUsdc: exposure.value.payoutUsdc,
        holder: holder.value,
        profile: exposure.value.rationale,
        signature,
        maxPremiumUsdc,
      },
    })
    quote.value = null
    exposure.value = null
    alternatives.value = []
    await refreshPolicies()
  } catch (err: any) {
    buyError.value = err?.data?.statusMessage ?? err?.message ?? 'execution failed'
  } finally {
    buying.value = false
    buyStep.value = ''
  }
}
</script>

<template>
  <div class="min-h-screen">
    <main class="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <h1 class="font-display text-4xl text-ink sm:text-5xl">Tell us what a bad day looks like.</h1>
      <p class="mt-3 max-w-xl text-ink/55">
        The broker interviews you, finds the market that already prices your risk, and structures the cover.
        Your wallet holds the position — we never touch your money.
      </p>
      <p v-if="brokerData?.broker" class="mt-2 text-xs text-ink/40">
        Brokered by
        <a
          :href="`https://sepolia.app.ens.domains/${brokerData.broker.name}`"
          target="_blank"
          rel="noopener"
          class="text-teal hover:underline"
          >{{ brokerData.broker.name }}</a
        >
        <span v-if="brokerData.broker.policiesPublished"> · {{ brokerData.broker.policiesPublished }} policies on ENS</span>
        <button
          v-else
          type="button"
          class="ml-2 text-teal underline decoration-dotted hover:no-underline disabled:opacity-50"
          :disabled="authorizing"
          @click="authorizeEnsWriter"
        >
          {{ authorizing ? 'sign in your wallet…' : 'let Parasol publish policies here' }}
        </button>
        <span v-if="authorizeState === 'done'" class="ml-2 text-teal">authorized — new policies will publish themselves</span>
        <span v-if="authorizeState === 'error'" class="ml-2 text-red-600/70">authorization cancelled</span>
      </p>

      <div class="mt-10 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section class="surface flex min-h-[28rem] flex-col rounded-3xl p-6">
          <div class="flex items-baseline justify-between">
            <h2 class="font-display text-2xl text-ink">Interview</h2>
            <span v-if="agentSource" class="text-xs uppercase tracking-[0.18em]" :class="agentSource === 'mock' ? 'text-ink/35' : 'text-teal'">
              {{ sourceLabel[agentSource] }}
            </span>
          </div>

          <div class="mt-4 flex-1 space-y-3 overflow-y-auto">
            <p v-if="messages.length === 0" class="text-sm text-ink/40">
              Try: "I run outdoor events in Madrid — above 33°C people stop coming."
            </p>
            <div
              v-for="(m, i) in messages"
              :key="i"
              class="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm"
              :class="m.role === 'user' ? 'ml-auto bg-ink text-canvas' : 'bg-canvas-soft text-ink/80'"
            >
              {{ m.content }}
            </div>
            <p v-if="thinking" class="text-sm text-ink/35">Broker is thinking…</p>
          </div>

          <form class="mt-4 flex gap-2" @submit.prevent="send">
            <input
              v-model="draft"
              type="text"
              placeholder="Describe your business and what hurts"
              class="flex-1 rounded-full border border-ink/10 bg-canvas px-4 py-2.5 text-sm text-ink placeholder:text-ink/30 focus:border-teal/60 focus:outline-none"
            />
            <button type="submit" class="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-canvas transition-transform hover:scale-[1.02]" :disabled="thinking">
              Send
            </button>
          </form>
        </section>

        <section class="space-y-6">
          <div v-if="quote" class="surface rounded-3xl p-6">
            <div class="flex items-baseline justify-between">
              <h2 class="font-display text-2xl text-ink">Your cover</h2>
              <span class="text-xs uppercase tracking-[0.18em] text-teal">Live pricing</span>
            </div>
            <p class="mt-2 text-sm text-ink/55">{{ quote.option.question }}</p>

            <dl class="mt-5 space-y-2 text-sm">
              <div class="flex justify-between"><dt class="text-ink/45">Pays out</dt><dd class="text-ink">${{ quote.basket.payoutUsdc }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink/45">Premium</dt><dd class="font-display text-2xl text-ocean">${{ quote.basket.premiumUsdc }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink/45">Taker fees</dt><dd class="text-ink">${{ quote.basket.feesUsdc }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink/45">You authorize up to</dt><dd class="text-ink">${{ quote.basket.maxPremiumUsdc }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink/45">Market odds</dt><dd class="text-ink">{{ (quote.basket.impliedProbability * 100).toFixed(1) }}%</dd></div>
              <div class="flex justify-between"><dt class="text-ink/45">Positions</dt><dd class="text-ink">{{ quote.basket.signatureCount }} market{{ quote.basket.signatureCount > 1 ? 's' : '' }}</dd></div>
            </dl>

            <div v-if="alternatives.length" class="mt-4">
              <p class="text-xs uppercase tracking-[0.18em] text-ink/40">Other windows</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <button
                  v-for="alt in alternatives"
                  :key="alt.id"
                  type="button"
                  class="rounded-full border border-ink/10 px-3 py-1.5 text-xs text-ink/60 hover:border-teal/50 hover:text-ocean"
                  @click="switchOption(alt)"
                >
                  {{ alt.date }} · ${{ alt.premiumUsdc }}
                </button>
              </div>
            </div>

            <div class="mt-5 border-t border-ink/10 pt-4">
              <div v-if="!holder && !manualEntry">
                <button type="button" class="w-full rounded-full border border-ink/15 px-4 py-2.5 text-sm text-ink/80 hover:border-ink/35" @click="connectWallet">
                  Connect wallet
                </button>
                <button type="button" class="mt-1.5 w-full text-center text-xs text-ink/35 hover:text-ink/60" @click="manualEntry = true">
                  or paste an address
                </button>
              </div>
              <input
                v-else-if="!holder"
                type="text"
                placeholder="0x… or yourname.eth"
                class="w-full rounded-full border border-ink/10 bg-canvas px-4 py-2.5 text-xs text-ink placeholder:text-ink/30 focus:border-teal/60 focus:outline-none"
                @change="normalizeHolder(($event.target as HTMLInputElement).value)"
              />
              <div v-else class="flex items-center justify-between rounded-full bg-canvas-soft px-4 py-2">
                <span class="text-xs text-ink/70">{{ shortHolder }}</span>
                <button type="button" class="text-xs text-ink/40 hover:text-ink/70" @click="holder = ''; holderEns = null; manualEntry = false">change</button>
              </div>
              <button
                type="button"
                class="mt-3 w-full rounded-full bg-linear-to-r from-teal to-mint px-6 py-3.5 font-medium text-ink transition-transform hover:scale-[1.01] disabled:opacity-40"
                :disabled="!holder || buying"
                @click="buy"
              >
                {{ buying ? (buyStep || 'Sign in your wallet, then executing…') : 'Cover me' }}
              </button>
              <p v-if="buyError" class="mt-2 text-center text-xs text-red-600/70">{{ buyError }}</p>
              <p class="mt-2 text-center text-xs text-ink/35">Your key authorizes the cover. Position delivered to your wallet, priced against Polymarket.</p>
            </div>
          </div>

          <div class="surface rounded-3xl p-6">
            <h2 class="font-display text-2xl text-ink">Policies</h2>
            <p v-if="!policiesData?.policies?.length" class="mt-3 text-sm text-ink/40">None yet.</p>
            <ul v-else class="mt-4 space-y-3">
              <li v-for="p in policiesData.policies" :key="p.id" class="rounded-2xl border border-ink/10 p-4">
                <div class="flex items-baseline justify-between gap-3">
                  <span class="text-sm text-ink">{{ p.question }}</span>
                  <span
                    class="shrink-0 rounded-full px-3 py-1 text-xs"
                    :class="p.status === 'Paid' || p.status === 'ResolvedYes' ? 'bg-mint/30 text-ink' : p.status === 'ResolvedNo' ? 'bg-ink/8 text-ink/50' : 'bg-teal/10 text-ocean'"
                  >
                    {{ statusLabel[p.status] ?? p.status }}
                  </span>
                </div>
                <p class="mt-2 text-xs text-ink/45">
                  Pays ${{ p.shares }} · premium ${{ p.premiumUsdc }}
                  <span v-if="p.holderName"> · {{ p.holderName }}</span>
                </p>
                <a
                  v-if="p.ensPublished && p.ensName"
                  :href="`https://sepolia.app.ens.domains/${p.ensName}`"
                  target="_blank"
                  rel="noopener"
                  class="text-xs text-teal hover:underline"
                  >{{ p.ensName }} ↗</a
                >
                <p v-else-if="p.ensName" class="text-xs text-ink/35" :title="`Reserved name — publish records to make it resolve`">
                  {{ p.ensName }} (reserved)
                </p>
                <div class="mt-1 flex flex-wrap gap-3">
                  <a
                    v-if="p.chain"
                    :href="`https://chainscan-galileo.0g.ai/tx/${p.chain.txHash}`"
                    target="_blank"
                    rel="noopener"
                    class="text-xs text-teal hover:underline"
                  >
                    Attestation on 0G ↗
                  </a>
                  <a
                    v-if="p.storage"
                    :href="`https://chainscan-galileo.0g.ai/tx/${p.storage.txHash}`"
                    target="_blank"
                    rel="noopener"
                    class="text-xs text-teal hover:underline"
                    title="Risk profile, AES-256-GCM encrypted before upload"
                  >
                    Encrypted profile on 0G Storage ↗
                  </a>
                </div>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
