<script setup lang="ts">
interface Policy {
  id: number
  question: string
  shares: number
  premiumUsdc: number
  status: 'Issued' | 'ResolvedYes' | 'ResolvedNo' | 'Paid' | string
  issuedAt: string
  chain: { network: string; registry: string; txHash: string } | null
}

const { data, pending, refresh } = await useFetch<{ policies: Policy[] }>('/api/policies')
const policies = computed(() => data.value?.policies ?? [])

const active = computed(() => policies.value.filter((p) => p.status === 'Issued' || p.status === 'ResolvedYes'))
const closed = computed(() => policies.value.filter((p) => p.status === 'Paid' || p.status === 'ResolvedNo'))

const claiming = ref(false)
const claimError = ref('')
async function checkAndClaim() {
  claiming.value = true
  claimError.value = ''
  try {
    await $fetch('/api/resolve', { method: 'POST' })
    await refresh()
  } catch (error) {
    claimError.value = error instanceof Error ? error.message : 'Could not resolve right now.'
  } finally {
    claiming.value = false
  }
}

const meta: Record<string, { label: string; tone: string }> = {
  Issued: { label: 'Active', tone: 'text-ocean bg-ocean/10 border-ocean/25' },
  ResolvedYes: { label: 'Won — claim ready', tone: 'text-teal bg-teal/10 border-teal/30' },
  Paid: { label: 'Paid out', tone: 'text-teal bg-teal/10 border-teal/30' },
  ResolvedNo: { label: 'Expired', tone: 'text-ink/45 bg-ink/5 border-ink/15' },
}
const badge = (s: string) => meta[s] ?? { label: s, tone: 'text-ink/45 bg-ink/5 border-ink/15' }
const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
</script>

<template>
  <main class="mx-auto min-h-screen max-w-4xl px-6 pt-32 pb-24">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="font-display text-section leading-tight text-ink">My cover</h1>
      </div>
      <button
        type="button"
        :disabled="claiming"
        class="rounded-full bg-ink px-6 py-3 text-sm font-medium text-canvas transition-transform hover:scale-[1.03] disabled:opacity-50"
        @click="checkAndClaim"
      >
        {{ claiming ? 'Checking…' : 'Check & claim' }}
      </button>
    </div>
    <p v-if="claimError" class="mt-3 text-sm text-teal">{{ claimError }}</p>

    <!-- Active -->
    <section class="mt-14">
      <h2 class="text-xs uppercase tracking-[0.2em] text-ink/45">In force</h2>
      <p v-if="!active.length && !pending" class="mt-6 text-ink/50">
        No active cover yet. <NuxtLink to="/cover" class="text-teal underline">Get covered →</NuxtLink>
      </p>
      <ul class="mt-6 space-y-4">
        <li v-for="p in active" :key="p.id" class="surface rounded-2xl p-6">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <p class="max-w-md font-display text-xl text-ink">{{ p.question }}</p>
            <span class="rounded-full border px-3 py-1 text-xs font-medium" :class="badge(p.status).tone">
              {{ badge(p.status).label }}
            </span>
          </div>
          <dl class="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt class="text-ink/45">Payout</dt>
              <dd class="mt-1 font-medium text-ink">{{ money(p.shares) }}</dd>
            </div>
            <div>
              <dt class="text-ink/45">Premium paid</dt>
              <dd class="mt-1 font-medium text-ink">{{ money(p.premiumUsdc) }}</dd>
            </div>
            <div v-if="p.chain">
              <dt class="text-ink/45">Registry</dt>
              <dd class="mt-1 truncate font-medium text-ocean">{{ p.chain.network }}</dd>
            </div>
          </dl>
        </li>
      </ul>
    </section>

    <!-- Closed -->
    <section v-if="closed.length" class="mt-14">
      <h2 class="text-xs uppercase tracking-[0.2em] text-ink/45">Closed</h2>
      <ul class="mt-6 space-y-4">
        <li v-for="p in closed" :key="p.id" class="rounded-2xl border border-ink/10 bg-canvas-soft/60 p-6">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <p class="max-w-md text-lg text-ink/80">{{ p.question }}</p>
            <span class="rounded-full border px-3 py-1 text-xs font-medium" :class="badge(p.status).tone">
              {{ badge(p.status).label }}
            </span>
          </div>
          <p class="mt-3 text-sm text-ink/50">
            {{ p.status === 'Paid' ? `Paid ${money(p.shares)} to your wallet.` : 'The event did not cross your threshold.' }}
          </p>
        </li>
      </ul>
    </section>
  </main>
</template>
