<template>
  <div class="relative min-h-screen overflow-x-hidden">
    <!-- the photo lives behind the whole app; content floats on frosted glass -->
    <div class="pointer-events-none fixed inset-0 -z-10">
      <img src="/background.jpg" alt="" aria-hidden="true" class="size-full object-cover" />
      <div class="absolute inset-0 bg-canvas/35" />
    </div>

    <NuxtRouteAnnouncer />
    <AppHeader />
    <NuxtPage />
    <AppFooter />
  </div>
</template>
