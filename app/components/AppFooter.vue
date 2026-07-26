<script setup lang="ts">
const columns = [
  {
    title: 'Product',
    links: [
      { label: 'Get covered', href: '/cover' },
      { label: 'My cover', href: '/policies' },
    ],
  },
]
</script>

<template>
  <footer class="glass relative border-t border-white/40">
    <div class="relative mx-auto max-w-6xl px-6 py-16">
      <div class="grid gap-12 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <div class="flex items-center gap-2.5">
            <AppLogo :size="26" />
            <span class="font-display text-xl text-ink">free</span>
          </div>
          <p class="mt-4 max-w-xs text-sm leading-relaxed text-ink/40">
            Parametric cover for anything a public source can measure.
          </p>
        </div>

        <div v-for="column in columns" :key="column.title">
          <p class="text-xs uppercase tracking-[0.18em] text-ink/30">{{ column.title }}</p>
          <ul class="mt-4 space-y-3 text-sm text-ink/55">
            <li v-for="link in column.links" :key="link.label">
              <a :href="link.href" class="transition-colors hover:text-ink">{{ link.label }}</a>
            </li>
          </ul>
        </div>
      </div>

      <div
        class="mt-14 flex flex-col gap-4 border-t border-ink/6 pt-8 text-xs text-ink/30 sm:flex-row sm:items-center sm:justify-between"
      >
        <p>Built at ETHGlobal Lisbon 2026.</p>
        <p class="max-w-md sm:text-right">
          Experimental software. free is not a regulated insurance product and nothing here is
          financial advice.
        </p>
      </div>
    </div>
  </footer>
</template>
