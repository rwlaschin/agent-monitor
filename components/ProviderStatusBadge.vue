<template>
  <div class="relative font-mono text-xs" ref="badgeRef">
    <button
      @click="isOpen = !isOpen"
      :class="[
        'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all cursor-pointer select-none text-[11px]',
        overallStatus === 'major_outage' 
          ? 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20' 
          : overallStatus === 'degraded' 
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20' 
            : 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
      ]"
      title="Click to view upstream LLM server status"
    >
      <span 
        :class="[
          'w-2 h-2 rounded-full shrink-0',
          overallStatus === 'major_outage' ? 'bg-red-500 animate-pulse' :
          overallStatus === 'degraded' ? 'bg-amber-500' :
          'bg-emerald-500'
        ]"
      ></span>
      <span class="font-medium hidden md:inline">
        {{ overallLabel }}
      </span>
      <span class="font-medium md:hidden">
        {{ overallShortLabel }}
      </span>
      <ChevronDown :class="['w-3 h-3 text-zinc-400 transition-transform duration-200', isOpen ? 'rotate-180' : '']" />
    </button>

    <!-- Status Breakdown Popover -->
    <div
      v-if="isOpen"
      class="absolute right-0 mt-2 w-72 p-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150"
    >
      <div class="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800/80 mb-2.5">
        <span class="font-bold text-zinc-900 dark:text-zinc-100 text-[11px]">Upstream LLM Health</span>
        <button 
          @click="fetchStatuses" 
          :disabled="isLoading"
          class="text-[10px] text-violet-500 hover:text-violet-400 flex items-center gap-1 font-semibold cursor-pointer disabled:opacity-50"
        >
          <RefreshCw :class="['w-2.5 h-2.5', isLoading ? 'animate-spin' : '']" />
          <span>Refresh</span>
        </button>
      </div>

      <div class="space-y-2">
        <div 
          v-for="provider in providers" 
          :key="provider.id"
          class="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/50 flex flex-col gap-1"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5">
              <span 
                :class="[
                  'w-2 h-2 rounded-full shrink-0',
                  provider.status === 'operational' ? 'bg-emerald-500' :
                  provider.status === 'degraded' ? 'bg-amber-500' :
                  provider.status === 'major_outage' ? 'bg-red-500' :
                  provider.status === 'offline' ? 'bg-zinc-500' :
                  'bg-zinc-400'
                ]"
              ></span>
              <span class="font-bold text-[11px] text-zinc-800 dark:text-zinc-200">{{ provider.name }}</span>
            </div>
            
            <a 
              :href="provider.url" 
              target="_blank" 
              rel="noopener noreferrer" 
              class="text-[10px] text-violet-500 hover:text-violet-400 flex items-center gap-0.5"
            >
              <span>Status</span>
              <ExternalLink class="w-2.5 h-2.5" />
            </a>
          </div>

          <div class="text-[10px] text-zinc-400 pl-3.5 leading-tight">
            {{ provider.description }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue';
import { ChevronDown, ExternalLink, RefreshCw } from 'lucide-vue-next';

interface ProviderHealth {
  id: string;
  name: string;
  status: 'operational' | 'degraded' | 'major_outage' | 'maintenance' | 'offline' | 'unknown';
  description: string;
  updatedAt: string;
  url: string;
}

const isOpen = ref(false);
const isLoading = ref(false);
const badgeRef = ref<HTMLElement | null>(null);
const providers = ref<ProviderHealth[]>([
  { id: 'claude', name: 'Anthropic Claude', status: 'operational', description: 'All Systems Operational', updatedAt: '', url: 'https://status.claude.com' },
  { id: 'openai', name: 'OpenAI (Codex/GPT)', status: 'operational', description: 'All Systems Operational', updatedAt: '', url: 'https://status.openai.com' }
]);

const overallStatus = computed(() => {
  if (providers.value.some(p => p.status === 'major_outage')) return 'major_outage';
  if (providers.value.some(p => p.status === 'degraded')) return 'degraded';
  return 'operational';
});

const overallLabel = computed(() => {
  if (overallStatus.value === 'major_outage') return 'LLM Outage Detected';
  if (overallStatus.value === 'degraded') return 'LLM Incident Reported';
  return 'LLM Status: Normal';
});

const overallShortLabel = computed(() => {
  if (overallStatus.value === 'major_outage') return 'Outage';
  if (overallStatus.value === 'degraded') return 'Incident';
  return 'LLMs OK';
});

async function fetchStatuses() {
  isLoading.value = true;
  try {
    const res = await $fetch<{ providers: ProviderHealth[] }>('/api/provider-status');
    if (res?.providers) {
      providers.value = res.providers;
    }
  } catch {}
  isLoading.value = false;
}

function handleClickOutside(event: MouseEvent) {
  if (badgeRef.value && !badgeRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
}

onMounted(() => {
  fetchStatuses();
  window.addEventListener('click', handleClickOutside);
  // Auto-refresh every 3 minutes
  const interval = setInterval(fetchStatuses, 180000);
  onUnmounted(() => {
    clearInterval(interval);
    window.removeEventListener('click', handleClickOutside);
  });
});
</script>
