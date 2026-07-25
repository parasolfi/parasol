<script setup lang="ts">
defineProps<{ question: string }>()
</script>

<template>
  <details class="group border-b border-ink/10 py-6">
    <summary
      class="flex cursor-pointer list-none items-center justify-between gap-6 text-lg text-ink/85 transition-colors hover:text-ink"
    >
      {{ question }}
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        class="shrink-0 text-teal transition-transform duration-300 group-open:rotate-45"
      >
        <path d="M12 5v14M5 12h14" stroke-linecap="round" />
      </svg>
    </summary>
    <div class="mt-4 max-w-2xl text-ink/60">
      <slot />
    </div>
  </details>
</template>
