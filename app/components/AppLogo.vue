<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 28 })
</script>

<template>
  <img
    src="/logo.png"
    alt="free"
    :width="size"
    :height="size"
    :style="{ width: `${size}px`, height: `${size}px` }"
    class="shrink-0 object-contain"
  />
</template>
