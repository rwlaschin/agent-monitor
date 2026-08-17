<template>
  <header class="border-b border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-md sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
      <!-- Brand Logo -->
      <div class="flex items-center space-x-3">
        <div class="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
          <Activity class="w-5 h-5" />
        </div>
        <NuxtLink to="/" class="font-bold text-sm tracking-wide text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          AGENT MONITOR
        </NuxtLink>
      </div>

      <!-- Center Controls: 1/2/3/4 Column Layout Switcher (Only on Overview page) -->
      <div 
        v-if="isOverviewPage"
        class="hidden sm:flex items-center bg-zinc-100 dark:bg-zinc-900 rounded-lg p-0.5 border border-zinc-200 dark:border-zinc-800"
      >
        <button 
          v-for="item in columnOptions" 
          :key="item.cols"
          @click="store.setColumnLayout(item.cols)"
          :class="[
            'p-1.5 rounded-md transition-all flex items-center justify-center cursor-pointer',
            store.columnLayout === item.cols 
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm' 
              : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
          ]"
          :title="`${item.cols} Column${item.cols > 1 ? 's' : ''}`"
          :aria-label="`${item.cols} Column${item.cols > 1 ? 's' : ''}`"
        >
          <component :is="item.icon" class="w-4 h-4" />
        </button>
      </div>

      <!-- Right Controls: Theme Toggle & Settings Link -->
      <div class="flex items-center space-x-2">
        <button 
          @click="toggleColorMode" 
          class="p-2 rounded-lg text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
          title="Toggle Dark/Light Mode"
        >
          <Sun v-if="colorMode.value === 'dark'" class="w-4 h-4" />
          <Moon v-else class="w-4 h-4" />
        </button>

        <NuxtLink 
          to="/settings" 
          class="p-2 rounded-lg text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          title="Settings & Config"
        >
          <Settings class="w-4 h-4" />
        </NuxtLink>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { Activity, Sun, Moon, Settings, Square, Columns2, Columns3, Columns4 } from 'lucide-vue-next';
import { useTelemetryStore } from '~/stores/telemetryStore';

const store = useTelemetryStore();
const route = useRoute();
const colorMode = useColorMode();

const isOverviewPage = computed(() => !route || !route.path || route.path === '/');

const columnOptions = [
  { cols: 1 as const, icon: Square },
  { cols: 2 as const, icon: Columns2 },
  { cols: 3 as const, icon: Columns3 },
  { cols: 4 as const, icon: Columns4 }
];

const toggleColorMode = () => {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';
};
</script>
