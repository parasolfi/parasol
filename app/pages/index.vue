<script setup lang="ts">
const coverable = [
  {
    tag: 'Weather',
    example: '15 mm of rain on the Saturday of an outdoor wedding.',
  },
  {
    tag: 'Travel',
    example: 'A flight that lands more than three hours late.',
  },
  {
    tag: 'Energy',
    example: 'Day-ahead power above €200 per megawatt-hour for a week.',
  },
  {
    tag: 'Logistics',
    example: 'A port or a border closed for more than forty-eight hours.',
  },
  {
    tag: 'Catastrophe',
    example: 'A quake above magnitude six within a hundred kilometres.',
  },
  {
    tag: 'Anything else',
    example: 'If a public source publishes the number, a market can exist for it.',
  },
]

const steps = [
  {
    number: '01',
    title: 'Name the event',
    body: 'A source, a number, a window of days. "More than 15 mm of rain in Lisbon this weekend" is already a complete policy.',
  },
  {
    number: '02',
    title: 'Pay the premium',
    body: 'The moment you buy, your payout is locked in escrow on-chain. It is already funded, sitting there, waiting.',
  },
  {
    number: '03',
    title: 'It happens — you are paid',
    body: 'The source publishes its number. Past your threshold, the escrow releases to you. You never file anything.',
  },
]

const differences = [
  {
    title: 'Nothing to claim',
    body: 'The trigger is a number from a public source, not a conversation with an adjuster. There is no one to convince and nothing to prove.',
  },
  {
    title: 'Funded before you buy',
    body: 'Every euro of your payout is escrowed up front by the people underwriting you. You are not trusting a balance sheet.',
  },
  {
    title: 'You hold your own money',
    body: 'Non-custodial from end to end. Your position lives in your wallet, and no one — including us — can move it.',
  },
  {
    title: 'A market price, not a tariff',
    body: 'Underwriters compete to cover your risk. The premium is simply what the market believes it is worth, updated live.',
  },
]

const stack = [
  { name: 'Uniswap v4', role: 'The cover pool and its price' },
  { name: 'The Graph', role: 'Live odds, indexed across venues' },
  { name: 'ENS', role: 'A readable name per event' },
  { name: 'Polygon', role: 'Cheap enough to cover a weekend' },
]
</script>

<template>
  <main id="top">
    <section class="relative flex min-h-screen items-center overflow-hidden">
      <AsciiVideo
        src="/ocean.mp4"
        :cell-size="14"
        invert
        :color="false"
        :postfx="{
          colorPalette: 5,
          contrastAdjust: 1.25,
          vignetteIntensity: 0.55,
          vignetteRadius: 2.2,
        }"
      />
      <div class="absolute inset-0 bg-linear-to-b from-canvas/60 via-transparent to-canvas" />
      <div
        class="absolute inset-0"
        style="
          background: linear-gradient(
            95deg,
            var(--color-canvas) 0%,
            var(--color-canvas) 34%,
            color-mix(in oklab, var(--color-canvas) 82%, transparent) 48%,
            transparent 74%
          );
        "
      />
      <div class="absolute inset-0 bg-canvas/78 lg:hidden" />

      <div class="relative mx-auto w-full max-w-6xl px-6 pt-32 pb-24">
        <p class="rise text-xs uppercase tracking-[0.28em] text-teal">
          Parametric cover · Polygon
        </p>

        <h1
          class="rise mt-8 max-w-4xl font-display text-hero leading-[0.95] tracking-tight text-ink"
          style="animation-delay: 80ms"
        >
          If it can be measured,<br />it can be insured.
        </h1>

        <p
          class="rise mt-8 max-w-xl text-lg leading-relaxed text-ink/65"
          style="animation-delay: 160ms"
        >
          Rain on your festival. A flight that never leaves. An energy bill that triples. Name the
          event and the number that would hurt, and you are paid the moment it happens — no claim, no
          adjuster, no forms at all.
        </p>

        <div class="rise mt-10 flex flex-wrap gap-3" style="animation-delay: 240ms">
          <a
            href="#quote"
            class="rounded-full bg-ink px-7 py-3.5 font-medium text-canvas transition-transform hover:scale-[1.03]"
          >
            Price my risk
          </a>
          <a
            href="#how"
            class="rounded-full border border-ink/15 px-7 py-3.5 font-medium text-ink/70 transition-colors hover:border-ink/40 hover:text-ink"
          >
            How it works
          </a>
        </div>

        <dl
          class="rise mt-16 grid max-w-2xl grid-cols-2 gap-8 border-t border-ink/10 pt-8 sm:grid-cols-3"
          style="animation-delay: 320ms"
        >
          <div>
            <dt class="font-display text-3xl text-ocean">Minutes</dt>
            <dd class="mt-1 text-sm text-ink/45">from event to payout</dd>
          </div>
          <div>
            <dt class="font-display text-3xl text-ocean">100%</dt>
            <dd class="mt-1 text-sm text-ink/45">of payouts escrowed up front</dd>
          </div>
          <div>
            <dt class="font-display text-3xl text-ocean">Zero</dt>
            <dd class="mt-1 text-sm text-ink/45">claims forms, ever</dd>
          </div>
        </dl>
      </div>
    </section>

    <section id="cover" class="relative scroll-mt-24 border-y border-ink/8 bg-canvas-soft">
      <div class="mx-auto max-w-6xl px-6 py-28 lg:py-36">
        <p class="text-xs uppercase tracking-[0.28em] text-teal">What people cover</p>
        <h2 class="mt-6 max-w-3xl font-display text-section leading-tight text-ink">
          Insurance stops at what an insurer feels like selling. This does not.
        </h2>
        <p class="mt-6 max-w-xl text-lg leading-relaxed text-ink/60">
          Any event a public source can settle can become a market. Some of them already exist; the
          rest are one underwriter away.
        </p>

        <ul class="mt-16 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          <li v-for="item in coverable" :key="item.tag">
            <p class="text-xs uppercase tracking-[0.2em] text-teal">{{ item.tag }}</p>
            <div class="rule-fade mt-4 h-px w-full" />
            <p class="mt-4 leading-relaxed text-ink/65">{{ item.example }}</p>
          </li>
        </ul>
      </div>
    </section>

    <section id="quote" class="relative mx-auto max-w-6xl scroll-mt-24 px-6 py-28 lg:py-36">
      <div class="grid items-center gap-14 lg:grid-cols-2">
        <div>
          <p class="text-xs uppercase tracking-[0.28em] text-teal">The quote</p>
          <h2 class="mt-6 font-display text-section leading-tight text-ink">
            Every risk has a price. Here is yours.
          </h2>
          <p class="mt-6 max-w-md text-lg leading-relaxed text-ink/60">
            A cover is a simple bet against an event, and the market quotes it live. Move the dials
            and watch the premium follow the odds.
          </p>
          <p class="mt-6 max-w-md text-ink/45">
            The same machinery prices a wet Saturday, a late plane and a spike in power. Only the
            number being watched changes.
          </p>
        </div>

        <QuoteCard />
      </div>
    </section>

    <section id="how" class="relative scroll-mt-24 border-y border-ink/8 bg-canvas-soft">
      <div class="mx-auto max-w-6xl px-6 py-28 lg:py-36">
        <p class="text-xs uppercase tracking-[0.28em] text-teal">How it works</p>
        <h2 class="mt-6 max-w-2xl font-display text-section leading-tight text-ink">
          Three steps, and one of them is just waiting.
        </h2>

        <ol class="mt-16 grid gap-12 md:grid-cols-3">
          <li v-for="step in steps" :key="step.number">
            <span class="font-display text-5xl text-teal">{{ step.number }}</span>
            <div class="rule-fade mt-6 h-px w-full" />
            <h3 class="mt-6 text-xl text-ink">{{ step.title }}</h3>
            <p class="mt-3 leading-relaxed text-ink/60">{{ step.body }}</p>
          </li>
        </ol>
      </div>
    </section>

    <section id="why" class="relative mx-auto max-w-6xl scroll-mt-24 px-6 py-28 lg:py-36">
      <p class="text-xs uppercase tracking-[0.28em] text-teal">Why it pays</p>
      <h2 class="mt-6 max-w-3xl font-display text-section leading-tight text-ink">
        Insurance usually fails you at the worst moment. This cannot.
      </h2>

      <div class="mt-16 grid gap-px overflow-hidden rounded-3xl border border-ink/10 bg-ink/10 sm:grid-cols-2">
        <article v-for="item in differences" :key="item.title" class="bg-canvas p-8 lg:p-10">
          <h3 class="font-display text-2xl text-ocean">{{ item.title }}</h3>
          <p class="mt-4 leading-relaxed text-ink/60">{{ item.body }}</p>
        </article>
      </div>
    </section>

    <section id="underwrite" class="relative scroll-mt-24 overflow-hidden border-y border-ink/8">
      <MeshGradient :intensity="0.22" :scale="1.6" :speed="0.6" />
      <div class="relative mx-auto grid max-w-6xl gap-14 px-6 py-28 lg:grid-cols-2 lg:py-36">
        <div>
          <p class="text-xs uppercase tracking-[0.28em] text-teal">The other side</p>
          <h2 class="mt-6 font-display text-section leading-tight text-ink">
            Someone has to bet it will be fine.
          </h2>
          <p class="mt-6 max-w-md text-lg leading-relaxed text-ink/65">
            That someone can be you. Post collateral, cover other people's bad days, and keep the
            premiums when the event never comes. Your risk is capped at what you put in — never a cent
            more.
          </p>
          <a
            href="#quote"
            class="mt-10 inline-flex rounded-full border border-ocean/25 bg-canvas/70 px-7 py-3.5 font-medium text-ocean transition-colors hover:bg-canvas"
          >
            Underwrite a market
          </a>
        </div>

        <div class="surface rounded-3xl p-8 lg:p-10">
          <h3 class="text-xs uppercase tracking-[0.28em] text-ink/40">Under the hood</h3>
          <p class="mt-6 leading-relaxed text-ink/65">
            Underwriters are liquidity providers in a Uniswap v4 pool. Buying cover is a swap against
            that pool, so the price of protection is just the price of the asset — set by the market,
            second by second.
          </p>
          <p class="mt-4 leading-relaxed text-ink/65">
            Collateral is split into paired outcome tokens before any cover is sold. Whichever way the
            event goes, the winning side is already fully funded on-chain.
          </p>
          <dl class="mt-8 grid grid-cols-2 gap-6 border-t border-ink/10 pt-6 text-sm">
            <div>
              <dt class="text-ink/40">Capital model</dt>
              <dd class="mt-1 text-ocean">Fully funded</dd>
            </div>
            <div>
              <dt class="text-ink/40">Custody</dt>
              <dd class="mt-1 text-ocean">None. Ever.</dd>
            </div>
            <div>
              <dt class="text-ink/40">Settlement</dt>
              <dd class="mt-1 text-ocean">Public data source</dd>
            </div>
            <div>
              <dt class="text-ink/40">Downside</dt>
              <dd class="mt-1 text-ocean">Capped at collateral</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-6xl px-6 py-24">
      <p class="text-xs uppercase tracking-[0.28em] text-ink/35">Built on</p>
      <div class="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="item in stack" :key="item.name">
          <p class="font-display text-2xl text-ink">{{ item.name }}</p>
          <p class="mt-2 text-sm text-ink/45">{{ item.role }}</p>
        </div>
      </div>
    </section>

    <section id="faq" class="mx-auto max-w-4xl scroll-mt-24 px-6 py-24 lg:py-32">
      <h2 class="font-display text-section leading-tight text-ink">Reasonable questions.</h2>

      <div class="mt-12">
        <FaqItem question="What counts as the event actually happening?">
          A number published by a public source that is named in the contract before you buy —
          millimetres of rain, degrees, minutes late, euros per megawatt-hour. No interpretation, no
          discretion, no one deciding after the fact.
        </FaqItem>
        <FaqItem question="How fast do I actually get paid?">
          As soon as the window closes and the source publishes its reading, settlement runs on-chain
          and the escrow releases. Minutes, not months — and nobody has to approve it.
        </FaqItem>
        <FaqItem question="Can I cover something that has no market yet?">
          If a public source settles it, yes. A market starts existing the moment somebody underwrites
          the first cover on it, and their price is the opening price.
        </FaqItem>
        <FaqItem question="What if nobody wants to cover my risk?">
          Then there is no market for it and you will not be able to buy. Cover exists only where
          somebody is willing to take the other side, which is also why the price is honest.
        </FaqItem>
        <FaqItem question="Do I need to understand crypto to use this?">
          You need a wallet and stablecoins. Everything else — the pool, the collateral, the
          settlement — happens underneath. The product you see is a price and a payout.
        </FaqItem>
        <FaqItem question="Is this really insurance?">
          It is a parametric contract: it pays on a measured event, the way flight-delay cover does.
          What it deliberately does not do is assess whether you personally suffered a loss.
        </FaqItem>
      </div>
    </section>

    <section class="relative overflow-hidden border-t border-ink/8 bg-canvas-soft">
      <div class="relative mx-auto max-w-4xl px-6 py-28 text-center lg:py-36">
        <h2 class="font-display text-section leading-tight text-ink">
          Name the thing that would ruin it.
        </h2>
        <a
          href="#quote"
          class="mt-10 inline-flex rounded-full bg-ink px-8 py-4 font-medium text-canvas transition-transform hover:scale-[1.03]"
        >
          Price my risk
        </a>
      </div>
    </section>
  </main>
</template>
