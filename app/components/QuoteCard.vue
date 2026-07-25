<script setup lang="ts">
const MARKET_SPREAD = 0.08

const markets = [
  {
    name: 'Rain in Lisbon',
    outcome: 'more than {threshold} of rain in Lisbon',
    dailyChance: 0.18,
    thresholds: [
      { label: '1 mm', hint: 'a drizzle', likelihood: 1 },
      { label: '5 mm', hint: 'a proper shower', likelihood: 0.55 },
      { label: '15 mm', hint: 'a washout', likelihood: 0.22 },
    ],
  },
  {
    name: 'Heat in Madrid',
    outcome: 'a day above {threshold} in Madrid',
    dailyChance: 0.34,
    thresholds: [
      { label: '35 °C', hint: 'a hot one', likelihood: 1 },
      { label: '40 °C', hint: 'a heatwave', likelihood: 0.38 },
      { label: '45 °C', hint: 'a record', likelihood: 0.07 },
    ],
  },
  {
    name: 'Flight delays',
    outcome: 'a flight landing over {threshold} late',
    dailyChance: 0.24,
    thresholds: [
      { label: '1 h', hint: 'a slip', likelihood: 1 },
      { label: '3 h', hint: 'compensation territory', likelihood: 0.42 },
      { label: '6 h', hint: 'a ruined day', likelihood: 0.15 },
    ],
  },
  {
    name: 'Power prices',
    outcome: 'day-ahead power above {threshold}',
    dailyChance: 0.3,
    thresholds: [
      { label: '€150', hint: 'a tense day', likelihood: 1 },
      { label: '€200', hint: 'a spike', likelihood: 0.45 },
      { label: '€300', hint: 'a crisis', likelihood: 0.12 },
    ],
  },
]

const windows = [
  { label: 'One day', days: 1 },
  { label: 'A weekend', days: 2 },
  { label: 'A week', days: 7 },
]

const market = ref(markets[0]!)
const thresholdIndex = ref(1)
const window_ = ref(windows[1]!)
const payout = ref(500)

const threshold = computed(() => market.value.thresholds[thresholdIndex.value]!)

const probability = computed(() => {
  const perDay = market.value.dailyChance * threshold.value.likelihood
  return 1 - Math.pow(1 - perDay, window_.value.days)
})

const premium = computed(() => Math.round(payout.value * probability.value * (1 + MARKET_SPREAD)))
const impliedOdds = computed(() => (probability.value * 100).toFixed(1))
const outcome = computed(() => market.value.outcome.replace('{threshold}', threshold.value.label))
</script>

<template>
  <div class="surface rounded-3xl p-6 sm:p-8">
    <div class="flex items-baseline justify-between gap-4">
      <h3 class="font-display text-2xl text-ink">Price a risk</h3>
      <span class="text-xs uppercase tracking-[0.18em] text-teal">Demo pricing</span>
    </div>

    <div class="mt-7 space-y-6">
      <fieldset>
        <legend class="text-xs uppercase tracking-[0.18em] text-ink/40">What worries you</legend>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            v-for="option in markets"
            :key="option.name"
            type="button"
            class="rounded-full border px-4 py-2 text-sm transition-colors"
            :class="
              market.name === option.name
                ? 'border-teal/60 bg-teal/10 text-ocean'
                : 'border-ink/10 text-ink/55 hover:border-ink/25 hover:text-ink/80'
            "
            @click="market = option"
          >
            {{ option.name }}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend class="text-xs uppercase tracking-[0.18em] text-ink/40">How long</legend>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            v-for="option in windows"
            :key="option.label"
            type="button"
            class="rounded-full border px-4 py-2 text-sm transition-colors"
            :class="
              window_.label === option.label
                ? 'border-teal/60 bg-teal/10 text-ocean'
                : 'border-ink/10 text-ink/55 hover:border-ink/25 hover:text-ink/80'
            "
            @click="window_ = option"
          >
            {{ option.label }}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend class="text-xs uppercase tracking-[0.18em] text-ink/40">Pays out above</legend>
        <div class="mt-3 grid gap-2 sm:grid-cols-3">
          <button
            v-for="(option, index) in market.thresholds"
            :key="option.label"
            type="button"
            class="rounded-2xl border px-4 py-3 text-left transition-colors"
            :class="
              thresholdIndex === index
                ? 'border-teal/60 bg-teal/8'
                : 'border-ink/10 hover:border-ink/25'
            "
            @click="thresholdIndex = index"
          >
            <span class="block text-sm text-ink">{{ option.label }}</span>
            <span class="block text-xs text-ink/45">{{ option.hint }}</span>
          </button>
        </div>
      </fieldset>

      <fieldset>
        <div class="flex items-baseline justify-between">
          <legend class="text-xs uppercase tracking-[0.18em] text-ink/40">If it happens, you get</legend>
          <span class="font-display text-2xl text-ocean">€{{ payout }}</span>
        </div>
        <input
          v-model.number="payout"
          type="range"
          min="100"
          max="2000"
          step="50"
          aria-label="Payout amount in euros"
          class="mt-4 h-1 w-full cursor-pointer appearance-none rounded-full bg-ink/12 accent-teal"
        />
      </fieldset>
    </div>

    <div class="mt-8 border-t border-ink/10 pt-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-xs uppercase tracking-[0.18em] text-ink/40">Your premium</p>
          <p class="font-display text-5xl text-ink">€{{ premium }}</p>
        </div>
        <p class="max-w-[15rem] text-sm text-ink/50">
          The market puts {{ impliedOdds }}% odds on {{ outcome }}.
        </p>
      </div>

      <button
        type="button"
        class="mt-6 w-full rounded-full bg-linear-to-r from-teal to-mint px-6 py-3.5 font-medium text-ink transition-transform hover:scale-[1.01]"
      >
        Get covered
      </button>
      <p class="mt-3 text-center text-xs text-ink/35">
        Illustrative numbers. Live markets are priced and settled on-chain.
      </p>
    </div>
  </div>
</template>
