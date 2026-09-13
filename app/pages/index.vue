<script setup lang="ts">
// Landing: a wide panorama that pans horizontally as you scroll — the scenery
// streams left, like the view from a moving train. Natural resolution, no zoom.
const trainImg = ref<HTMLElement | null>(null)

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  let ticking = false
  const apply = () => {
    ticking = false
    const img = trainImg.value
    if (!img) return
    const maxPan = Math.max(img.offsetWidth - window.innerWidth, 0)
    const scrollable = document.documentElement.scrollHeight - window.innerHeight
    const frac = scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0
    // full scroll traverses the whole panorama, left to right
    img.style.transform = `translate3d(${-frac * maxPan}px, 0, 0)`
  }
  const onScroll = () => {
    if (!ticking) {
      ticking = true
      requestAnimationFrame(apply)
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', apply)
  apply()
  onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', apply)
  })
})

const steps = [
  {
    n: '01',
    t: 'Describe the risk',
    d: 'Tell the assistant what would ruin your day — a storm, a delay, a price spike.',
  },
  {
    n: '02',
    t: 'Buy from your wallet',
    d: 'One click, one signature. Your keys hold the position. We never touch your money.',
  },
  {
    n: '03',
    t: 'Get paid automatically',
    d: 'When the public number crosses your threshold, the payout is already yours.',
  },
]

const points = [
  { t: 'Non-custodial', d: 'Every move is signed by your own wallet.' },
  { t: 'Priced live', d: 'The market sets your premium, second by second.' },
  { t: 'No claims', d: 'Settlement is automatic and on-chain.' },
]
</script>

<template>
  <main id="top">
    <!-- wide panorama, panned by scroll -->
    <div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <img
        ref="trainImg"
        src="/background-long.png"
        alt=""
        aria-hidden="true"
        class="absolute inset-y-0 left-0 h-full w-auto max-w-none will-change-transform"
      />
      <div class="absolute inset-0 bg-canvas/35" />
    </div>

    <!-- Hero -->
    <section class="relative flex min-h-screen items-center overflow-hidden">
      <div class="mx-auto w-full max-w-6xl px-6">
        <div class="surface max-w-xl rounded-3xl p-8 lg:p-11">
          <h1 class="font-display text-5xl font-medium leading-[0.98] tracking-tight text-ink sm:text-6xl">
            Cover any number that could ruin your day.
          </h1>
          <p class="mt-6 text-lg leading-relaxed text-ink/75">
            An assistant builds the cover, you buy it from your own wallet, and you are paid the second
            it happens.
          </p>
          <div class="mt-8 flex flex-wrap gap-3">
            <NuxtLink
              to="/cover"
              class="rounded-full bg-ink px-7 py-3.5 font-medium text-canvas transition-transform hover:scale-[1.03]"
            >
              Get covered
            </NuxtLink>
            <NuxtLink
              to="/policies"
              class="rounded-full border border-ink/25 px-7 py-3.5 font-medium text-ink/80 transition-colors hover:border-ink/50 hover:text-ink"
            >
              My cover
            </NuxtLink>
          </div>
        </div>
      </div>
      <span class="absolute bottom-8 left-1/2 -translate-x-1/2 text-xs uppercase tracking-[0.3em] text-ink/50">
        Scroll
      </span>
    </section>

    <!-- How it works -->
    <section class="relative px-6 py-24 lg:py-32">
      <div class="mx-auto max-w-6xl">
        <h2 class="font-display text-3xl text-ink sm:text-4xl">Three steps. One of them is just waiting.</h2>
        <div class="mt-12 grid gap-6 md:grid-cols-3">
          <div v-for="s in steps" :key="s.n" class="surface rounded-3xl p-7">
            <span class="font-display text-4xl text-teal">{{ s.n }}</span>
            <h3 class="mt-5 text-xl text-ink">{{ s.t }}</h3>
            <p class="mt-2 leading-relaxed text-ink/70">{{ s.d }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Why -->
    <section class="relative px-6 py-24 lg:py-32">
      <div class="mx-auto max-w-6xl">
        <div class="surface grid gap-8 rounded-3xl p-8 sm:grid-cols-3 lg:p-12">
          <div v-for="p in points" :key="p.t">
            <h3 class="font-display text-2xl text-ink">{{ p.t }}</h3>
            <p class="mt-2 leading-relaxed text-ink/70">{{ p.d }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="relative px-6 pb-28 pt-8 text-center lg:pb-40">
      <div class="mx-auto max-w-2xl">
        <h2 class="font-display text-4xl leading-tight text-ink sm:text-5xl">
          Name the thing that would ruin it.
        </h2>
        <NuxtLink
          to="/cover"
          class="mt-8 inline-flex rounded-full bg-ink px-8 py-4 font-medium text-canvas transition-transform hover:scale-[1.03]"
        >
          Get covered
        </NuxtLink>
      </div>
    </section>
  </main>
</template>
