<script setup lang="ts">
const links = [
  { label: 'What you can cover', href: '#cover' },
  { label: 'How it works', href: '#how' },
  { label: 'Underwriters', href: '#underwrite' },
  { label: 'FAQ', href: '#faq' },
]

const scrolled = ref(false)
const menuOpen = ref(false)

onMounted(() => {
  const onScroll = () => (scrolled.value = window.scrollY > 24)
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
  onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
})
</script>

<template>
  <header
    class="fixed inset-x-0 top-0 z-50 transition-colors duration-500"
    :class="scrolled ? 'border-b border-white/5 bg-ink/70 backdrop-blur-xl' : ''"
  >
    <nav class="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-5">
      <a href="#top" class="flex items-center gap-2.5">
        <AppLogo />
        <span class="font-display text-xl tracking-tight text-white">Parasol</span>
      </a>

      <ul class="hidden items-center gap-8 text-sm text-white/60 md:flex">
        <li v-for="link in links" :key="link.href">
          <a :href="link.href" class="transition-colors hover:text-white">{{ link.label }}</a>
        </li>
      </ul>

      <div class="flex items-center gap-3">
        <a
          href="#quote"
          class="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-ink transition-transform hover:scale-[1.03]"
        >
          Get a quote
        </a>
        <button
          type="button"
          class="text-white/70 md:hidden"
          :aria-expanded="menuOpen"
          aria-label="Toggle navigation"
          @click="menuOpen = !menuOpen"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path :d="menuOpen ? 'M6 6l12 12M18 6L6 18' : 'M4 8h16M4 16h16'" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </nav>

    <ul
      v-if="menuOpen"
      class="border-t border-white/5 bg-ink/95 px-6 py-4 text-sm text-white/70 backdrop-blur-xl md:hidden"
    >
      <li v-for="link in links" :key="link.href" class="py-2">
        <a :href="link.href" @click="menuOpen = false">{{ link.label }}</a>
      </li>
    </ul>
  </header>
</template>
