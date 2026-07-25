<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 28 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    fill="none"
    role="img"
    aria-label="Parasol"
    class="shrink-0"
  >
    <defs>
      <linearGradient id="parasol-dome" x1="4" y1="25" x2="28" y2="7" gradientUnits="userSpaceOnUse">
        <stop stop-color="#1d4f7a" />
        <stop offset="0.55" stop-color="#3aa9b6" />
        <stop offset="1" stop-color="#c6f4cf" />
      </linearGradient>
    </defs>
    <path
      d="M4 25a12 12 0 0 1 24 0"
      stroke="url(#parasol-dome)"
      stroke-width="3"
      stroke-linecap="round"
    />
    <path
      d="M9.5 25a6.5 6.5 0 0 1 13 0"
      stroke="#7bd9b8"
      stroke-width="2.25"
      stroke-linecap="round"
      opacity="0.75"
    />
    <circle cx="16" cy="25" r="1.75" fill="#c6f4cf" />
  </svg>
</template>
