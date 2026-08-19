<template>
  <div>
    <!-- Top Breadcrumb Nav -->
    <BreadcrumbNav :items="[{ label: 'Overview' }]" />

    <!-- Summary Metrics Header -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 font-mono">
      <div class="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 shadow-sm">
        <span class="text-xs text-zinc-500 uppercase tracking-wider block">Total Burn (Last 15m)</span>
        <span class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {{ totalBurnRate.toLocaleString() }}
        </span>
        <span class="text-xs text-zinc-400"> tokens/min</span>
      </div>

      <div class="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 shadow-sm">
        <span class="text-xs text-zinc-500 uppercase tracking-wider block">Peak Velocity (15m Max)</span>
        <span class="text-2xl font-bold text-amber-500 dark:text-amber-400">
          {{ peakBurnRate.toLocaleString() }}
        </span>
        <span class="text-xs text-zinc-400"> max tok/min</span>
      </div>

      <div class="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 shadow-sm">
        <span class="text-xs text-zinc-500 uppercase tracking-wider block">Agents & Active Processes</span>
        <div class="flex items-baseline gap-1.5 mt-0.5">
          <span class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {{ store.snapshots.length }}
          </span>
          <span class="text-xs text-zinc-400">hosts</span>
          <span class="text-zinc-400 dark:text-zinc-600 font-bold mx-1">/</span>
          <span class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {{ activeProcessCount }}
          </span>
          <span class="text-xs text-zinc-400">active</span>
        </div>
      </div>
    </div>

    <!-- Monitored Host Grid (Dynamic 1 / 2 / 3 / 4 Columns) -->
    <div :class="['grid gap-4', gridClass]">
      <div
        v-for="snapshot in store.orderedSnapshots"
        :key="snapshot.agentId"
        :draggable="draggableAgentId === snapshot.agentId"
        @dragstart="handleDragStart($event, snapshot.agentId)"
        @dragover.prevent="handleDragOver($event, snapshot.agentId)"
        @dragleave="handleDragLeave($event, snapshot.agentId)"
        @drop="handleDrop($event, snapshot.agentId)"
        @dragend="handleDragEnd"
        :class="[
          'transition-all duration-200 rounded-xl',
          draggedId === snapshot.agentId ? 'opacity-30 scale-[0.98]' : '',
          dragOverId === snapshot.agentId && draggedId !== snapshot.agentId ? 'ring-2 ring-violet-500 shadow-lg shadow-violet-500/20' : ''
        ]"
      >
        <AgentCard 
          :snapshot="snapshot"
          :is-killing="!!store.killInProgress[snapshot.agentId]"
          @drag-handle-enter="draggableAgentId = snapshot.agentId"
          @drag-handle-leave="draggableAgentId = null"
          @kill-agent="handleKillAgent"
          @kill-subagent="handleKillSubagent"
          @update-threshold="handleUpdateThreshold"
          @update-color="handleUpdateColor"
        />
      </div>
    </div>

    <!-- Empty State if no agents configured -->
    <div v-if="store.snapshots.length === 0" class="text-center py-16 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
      <p class="text-zinc-500 font-mono text-sm mb-3">No agents monitored yet.</p>
      <NuxtLink to="/settings" class="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-lg shadow transition-colors">
        Configure Monitored Agents
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useTelemetryStore } from '~/stores/telemetryStore';
import BreadcrumbNav from '~/components/BreadcrumbNav.vue';
import AgentCard from '~/components/AgentCard.vue';

const store = useTelemetryStore();
const draggedId = ref<string | null>(null);
const dragOverId = ref<string | null>(null);
const draggableAgentId = ref<string | null>(null);

const gridClass = computed(() => {
  switch (store.columnLayout) {
    case 1: return 'grid-cols-1';
    case 2: return 'grid-cols-1 lg:grid-cols-2';
    case 3: return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    case 4: return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';
    default: return 'grid-cols-1 lg:grid-cols-2';
  }
});

const totalBurnRate = computed(() => {
  return store.snapshots.reduce((sum, s) => sum + s.currentRate, 0);
});

const peakBurnRate = computed(() => {
  return store.snapshots.reduce((sum, s) => sum + s.localMax, 0);
});

const activeProcessCount = computed(() => {
  let count = 0;
  for (const s of store.snapshots) {
    if (s.status !== 'stopped' && (s.activePid || s.currentRate > 0)) {
      count++;
    }
    if (s.subagents) {
      count += s.subagents.filter(sub => sub.pid !== null || sub.currentRate > 0).length;
    }
  }
  return count;
});

const handleDragStart = (e: DragEvent, agentId: string) => {
  const target = e.target as HTMLElement | null;
  if (
    target &&
    (target.closest('.popover-container') ||
     target.closest('button') ||
     target.closest('input') ||
     target.closest('.cursor-crosshair') ||
     target.closest('canvas'))
  ) {
    e.preventDefault();
    return;
  }
  draggedId.value = agentId;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', agentId);
  }
};

const handleDragOver = (_e: DragEvent, targetId: string) => {
  if (draggedId.value && draggedId.value !== targetId) {
    dragOverId.value = targetId;
  }
};

const handleDragLeave = (_e: DragEvent, targetId: string) => {
  if (dragOverId.value === targetId) {
    dragOverId.value = null;
  }
};

const handleDrop = (e: DragEvent, targetId: string) => {
  e.preventDefault();
  const sourceId = draggedId.value;
  if (!sourceId || sourceId === targetId) {
    handleDragEnd();
    return;
  }

  const currentList = store.orderedSnapshots.map(s => s.agentId);
  const sourceIndex = currentList.indexOf(sourceId);
  const targetIndex = currentList.indexOf(targetId);

  if (sourceIndex !== -1 && targetIndex !== -1) {
    currentList.splice(sourceIndex, 1);
    currentList.splice(targetIndex, 0, sourceId);
    store.setCardOrder(currentList);
  }

  handleDragEnd();
};

const handleDragEnd = () => {
  draggedId.value = null;
  dragOverId.value = null;
};

const handleKillAgent = async (agentId: string) => {
  await store.triggerEmergencyStop(agentId);
};

const handleKillSubagent = async (agentId: string, pid: number) => {
  await store.triggerEmergencyStop(agentId, pid);
};

const handleUpdateThreshold = async (agentId: string, threshold: number) => {
  await store.updateAgentThreshold(agentId, threshold);
};

const handleUpdateColor = async (agentId: string, color: string) => {
  await store.updateAgentColor(agentId, color);
};
</script>
