<script setup lang="ts">
const route = useRoute()
// The landing renders its own wide, scroll-panned panorama; inner pages use the
// plain fixed backdrop.
const showBackdrop = computed(() => route.path !== '/')
</script>

<template>
  <div class="relative min-h-screen overflow-x-hidden">
    <div v-if="showBackdrop" class="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <img src="/background.jpg" alt="" aria-hidden="true" class="size-full object-cover" />
      <div class="absolute inset-0 bg-canvas/35" />
    </div>

    <NuxtRouteAnnouncer />
    <AppHeader />
    <NuxtPage />
    <AppFooter />
  </div>
</template>
