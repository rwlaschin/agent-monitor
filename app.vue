<template>
  <div class="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 antialiased flex flex-col font-sans transition-colors duration-200">
    <AppHeader />
    <main class="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
      <NuxtPage />
    </main>
    <ToastContainer />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useTelemetryStore } from '~/stores/telemetryStore';
import AppHeader from '~/components/AppHeader.vue';
import ToastContainer from '~/components/ToastContainer.vue';

const store = useTelemetryStore();

onMounted(() => {
  store.init();
});
</script>

<style>
/* Modern Typography Hierarchy */
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  letter-spacing: -0.015em;
}

.font-mono, [class*="font-mono"], code, pre {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.025em;
}

</style>
