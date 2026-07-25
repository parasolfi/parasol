<script setup lang="ts">
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface Quote {
  option: { id: string; question: string; city: string; date: string; peril: string; unit: string }
  basket: {
    legs: { tokenId: string; label: string; ask: number; shares: number }[]
    payoutUsdc: number
    premiumUsdc: number
    impliedProbability: number
    signatureCount: number
  }
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
}

const messages = ref<ChatMessage[]>([])
const draft = ref('')
const thinking = ref(false)
const agentSource = ref<'zg-router' | 'mock' | null>(null)
const quote = ref<Quote | null>(null)
const exposure = ref<Exposure | null>(null)
const holder = ref('')
const buying = ref(false)
const buyError = ref('')
const { data: policiesData, refresh: refreshPolicies } = useFetch<{ policies: Policy[] }>('/api/policies')

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
    const res = await $fetch<{ reply: string; exposure: Exposure | null; source: 'zg-router' | 'mock'; quote: Quote | null }>(
      '/api/agent',
      { method: 'POST', body: { messages: messages.value } },
    )
    messages.value.push({ role: 'assistant', content: res.reply })
    agentSource.value = res.source
    if (res.quote) {
      quote.value = res.quote
      exposure.value = res.exposure
    }
  } catch {
    messages.value.push({ role: 'assistant', content: 'Something went wrong on my side — say that again?' })
  } finally {
    thinking.value = false
  }
}

async function connectWallet() {
  const eth = (window as any).ethereum
  if (!eth) return
  const accounts = await eth.request({ method: 'eth_requestAccounts' })
  if (accounts?.[0]) holder.value = accounts[0]
}

async function buy() {
  if (!exposure.value || !holder.value || buying.value) return
  buying.value = true
  buyError.value = ''
  try {
    await $fetch('/api/cover', {
      method: 'POST',
      body: {
        optionId: exposure.value.optionId,
        threshold: exposure.value.threshold,
        payoutUsdc: exposure.value.payoutUsdc,
        holder: holder.value,
        profile: exposure.value.rationale,
      },
    })
    quote.value = null
    exposure.value = null
    await refreshPolicies()
  } catch (err: any) {
    buyError.value = err?.data?.statusMessage ?? 'execution failed'
  } finally {
    buying.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-canvas">
    <AppHeader />

    <main class="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <p class="text-xs uppercase tracking-[0.18em] text-teal">Parasol broker</p>
      <h1 class="mt-2 font-display text-4xl text-ink sm:text-5xl">Tell us what a bad day looks like.</h1>
      <p class="mt-3 max-w-xl text-ink/55">
        The broker interviews you, finds the market that already prices your risk, and structures the cover.
        Your wallet holds the position — we never touch your money.
      </p>

      <div class="mt-10 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section class="surface flex min-h-[28rem] flex-col rounded-3xl p-6">
          <div class="flex items-baseline justify-between">
            <h2 class="font-display text-2xl text-ink">Interview</h2>
            <span v-if="agentSource" class="text-xs uppercase tracking-[0.18em]" :class="agentSource === 'zg-router' ? 'text-teal' : 'text-ink/35'">
              {{ agentSource === 'zg-router' ? 'Live on 0G Compute' : 'Offline fallback' }}
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
              <div class="flex justify-between"><dt class="text-ink/45">Market odds</dt><dd class="text-ink">{{ (quote.basket.impliedProbability * 100).toFixed(1) }}%</dd></div>
              <div class="flex justify-between"><dt class="text-ink/45">Positions</dt><dd class="text-ink">{{ quote.basket.signatureCount }} market{{ quote.basket.signatureCount > 1 ? 's' : '' }}</dd></div>
            </dl>

            <div class="mt-5 border-t border-ink/10 pt-4">
              <div class="flex gap-2">
                <input
                  v-model="holder"
                  type="text"
                  placeholder="0x… your wallet"
                  class="flex-1 rounded-full border border-ink/10 bg-canvas px-4 py-2.5 text-xs text-ink placeholder:text-ink/30 focus:border-teal/60 focus:outline-none"
                />
                <button type="button" class="rounded-full border border-ink/15 px-4 py-2.5 text-xs text-ink/70 hover:border-ink/30" @click="connectWallet">
                  Connect
                </button>
              </div>
              <button
                type="button"
                class="mt-3 w-full rounded-full bg-linear-to-r from-teal to-mint px-6 py-3.5 font-medium text-ink transition-transform hover:scale-[1.01] disabled:opacity-40"
                :disabled="!holder || buying"
                @click="buy"
              >
                {{ buying ? 'Executing…' : 'Cover me' }}
              </button>
              <p v-if="buyError" class="mt-2 text-center text-xs text-red-600/70">{{ buyError }}</p>
              <p class="mt-2 text-center text-xs text-ink/35">Position delivered to your wallet. Settled against Polymarket prices.</p>
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
                <p class="mt-2 text-xs text-ink/45">Pays ${{ p.shares }} · premium ${{ p.premiumUsdc }}</p>
                <a
                  v-if="p.chain"
                  :href="`https://chainscan-galileo.0g.ai/tx/${p.chain.txHash}`"
                  target="_blank"
                  rel="noopener"
                  class="mt-1 inline-block text-xs text-teal hover:underline"
                >
                  Attestation on 0G ↗
                </a>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </main>

    <AppFooter />
  </div>
</template>
