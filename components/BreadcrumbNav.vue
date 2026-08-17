<template>
  <nav class="flex items-center space-x-2 text-xs font-mono text-zinc-400 dark:text-zinc-500 py-2 border-b border-zinc-200 dark:border-zinc-800/80 mb-4">
    <NuxtLink to="/" class="hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors flex items-center gap-1">
      <Home class="w-3.5 h-3.5" />
      <span>Dashboard</span>
    </NuxtLink>

    <template v-for="(item, index) in items" :key="index">
      <span class="text-zinc-300 dark:text-zinc-700">/</span>
      <NuxtLink 
        v-if="item.to" 
        :to="item.to" 
        class="hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
      >
        {{ item.label }}
      </NuxtLink>
      <span v-else class="text-zinc-900 dark:text-zinc-200 font-semibold">
        {{ item.label }}
      </span>
    </template>
  </nav>
</template>

<script setup lang="ts">
import { Home } from 'lucide-vue-next';

interface BreadcrumbItem {
  label: string;
  to?: string;
}

defineProps<{
  items: BreadcrumbItem[];
}>();
</script>
