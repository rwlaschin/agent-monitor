<template>
  <div v-if="subagents.length > 0" class="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800/80 text-xs font-mono">
    <div class="flex items-center justify-between text-zinc-500 mb-2">
      <span>SUBAGENTS ({{ subagents.length }} active)</span>
      <span>RATE</span>
    </div>

    <div class="space-y-1.5 max-h-36 overflow-y-auto pr-1">
      <div 
        v-for="sub in sortedSubagents" 
        :key="sub.id"
        class="flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/60 p-1.5 rounded border border-zinc-200 dark:border-zinc-800/60"
      >
        <div class="flex items-center space-x-2 truncate">
          <span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" :style="{ backgroundColor: getSubColor(sub) }"></span>
          <span class="font-medium truncate text-zinc-900 dark:text-zinc-200">{{ sub.name }}</span>
        </div>

        <div class="flex items-center space-x-2 shrink-0">
          <span class="font-semibold text-zinc-700 dark:text-zinc-300">{{ sub.currentRate.toLocaleString() }} tok/m</span>
          <button 
            v-if="sub.pid"
            @click="$emit('killSubagent', sub.pid)"
            class="px-2 py-0.5 text-[10px] bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white rounded font-semibold transition-colors border border-red-500/20 active:scale-95 cursor-pointer"
            :title="`Stop process PID ${sub.pid}`"
          >
            Stop
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getProcessColor } from '~/utils/palette';

interface SubagentItem {
  id: string;
  name: string;
  color: string;
  currentRate: number;
  pid: number | null;
}

const props = defineProps<{
  subagents: SubagentItem[];
  parentColor: string;
}>();

defineEmits<{
  (e: 'killSubagent', pid: number): void;
}>();

const getSubColor = (sub: SubagentItem): string => {
  return sub.color || getProcessColor(sub.id || sub.name);
};

const sortedSubagents = computed(() => {
  return [...props.subagents].sort((a, b) => (b.currentRate || 0) - (a.currentRate || 0));
});
</script>
