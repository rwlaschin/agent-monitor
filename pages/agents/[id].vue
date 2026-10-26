<template>
  <div class="agent-drilldown-container">
    <div v-if="snapshot">
      <!-- Breadcrumb Nav -->
      <BreadcrumbNav 
        :items="[
          { label: 'Agents', to: '/' },
          { label: snapshot.agentName }
        ]" 
      />

      <!-- Agent Focused Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 p-4 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 font-mono">
        <div class="flex items-center space-x-3">
          <span class="w-4 h-4 rounded-full shadow-md" :style="{ backgroundColor: snapshot.color }"></span>
          <div>
            <h1 class="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              {{ snapshot.agentName }}
              <span v-if="snapshot.activePid" class="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                PID: {{ snapshot.activePid }}
              </span>
            </h1>
            <span class="text-xs text-zinc-500">Dedicated Real-Time Stream</span>
          </div>
        </div>

        <div class="flex items-center gap-3 self-start sm:self-auto flex-wrap">
          <!-- Upstream Provider Health Card -->
          <a
            v-if="agentProvider"
            :href="agentProvider.url"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-violet-500/50 transition-colors"
            :title="`Open official status page: ${agentProvider.url}`"
          >
            <span 
              :class="[
                'w-2 h-2 rounded-full shrink-0',
                agentProvider.status === 'operational' ? 'bg-emerald-500' :
                agentProvider.status === 'degraded' ? 'bg-amber-500' :
                agentProvider.status === 'major_outage' ? 'bg-red-500' : 'bg-zinc-400'
              ]"
            ></span>
            <div class="text-left">
              <div class="font-bold text-[11px] text-zinc-900 dark:text-zinc-100 flex items-center gap-1">
                <span>{{ agentProvider.name }}</span>
                <ExternalLink class="w-2.5 h-2.5 text-zinc-400" />
              </div>
              <div class="text-[10px] text-zinc-400">{{ agentProvider.description }}</div>
            </div>
          </a>

          <!-- Subdued Secondary Action Button -->
          <button 
            @click="handleEmergencyStop"
            :disabled="snapshot.status === 'stopped' || isKilling"
            :class="[
              'px-3 py-1.5 rounded-lg font-mono text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border',
              snapshot.status === 'stopped'
                ? 'opacity-40 cursor-not-allowed bg-zinc-100 dark:bg-zinc-800 border-transparent text-zinc-400 dark:text-zinc-500'
                : snapshot.isAlertBreached
                  ? 'bg-red-500 text-white border-red-500 hover:bg-red-600 shadow-md shadow-red-500/20'
                  : 'bg-zinc-100/80 dark:bg-zinc-900/80 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10 active:scale-95'
            ]"
            :title="snapshot.activePid ? `Terminate process PID ${snapshot.activePid}` : 'Process not running'"
          >
            <Square class="w-3 h-3 fill-current" />
            <span>{{ isKilling ? 'Stopping...' : 'Stop Agent' }}</span>
          </button>
        </div>
      </div>

      <!-- Metrics Row -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 font-mono text-xs">
        <div class="bg-white dark:bg-zinc-950 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800/80">
          <span class="text-zinc-500 block uppercase">Current Burn</span>
          <span class="text-xl font-bold text-zinc-900 dark:text-zinc-100">{{ snapshot.currentRate.toLocaleString() }}</span>
          <span class="text-zinc-400"> tok/m</span>
        </div>

        <div class="bg-white dark:bg-zinc-950 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800/80">
          <span class="text-zinc-500 block uppercase">Local Max (15m)</span>
          <span class="text-xl font-bold text-zinc-900 dark:text-zinc-100">{{ snapshot.localMax.toLocaleString() }}</span>
          <span class="text-zinc-400"> tok/m</span>
        </div>

        <div class="bg-white dark:bg-zinc-950 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800/80">
          <span class="text-zinc-500 block uppercase">Alert Threshold</span>
          <span class="text-xl font-bold text-zinc-900 dark:text-zinc-100">{{ (snapshot.alertThreshold / 1000).toFixed(0) }}k</span>
          <span class="text-zinc-400"> tok/m</span>
        </div>

        <div class="bg-white dark:bg-zinc-950 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800/80">
          <span class="text-zinc-500 block uppercase">Active Subagents</span>
          <span class="text-xl font-bold text-zinc-900 dark:text-zinc-100">{{ snapshot.subagents.length }}</span>
          <span class="text-zinc-400"> running</span>
        </div>
      </div>

      <!-- High-Resolution Dedicated Swarm Master Chart -->
      <div class="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 shadow-sm mb-6">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-xs font-mono font-semibold text-zinc-500 uppercase tracking-wider">
            Master Swarm Telemetry Curve
          </h2>
          <span class="text-[10px] font-mono text-zinc-400">All processes combined against alert threshold</span>
        </div>
        <AgentChart 
          :history="snapshot.history" 
          :color="snapshot.color" 
          :alert-threshold="snapshot.alertThreshold" 
          :local-max="snapshot.localMax" 
          :subagents="snapshot.subagents"
        />
      </div>

      <!-- Individual Process Streams (1 Chart per Process) -->
      <div v-if="individualProcesses.length > 0" class="mb-6">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-xs font-mono font-semibold text-zinc-500 uppercase tracking-wider">
            Individual Process Streams ({{ orderedProcesses.length }} active)
          </h2>
          <span class="text-[10px] font-mono text-zinc-400">15-minute isolated sparklines</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div 
            v-for="proc in orderedProcesses" 
            :key="proc.id"
            draggable="true"
            @dragstart="handleProcessDragStart($event, proc.id)"
            @dragover.prevent="handleProcessDragOver($event, proc.id)"
            @dragleave="handleProcessDragLeave($event, proc.id)"
            @drop="handleProcessDrop($event, proc.id)"
            @dragend="handleProcessDragEnd"
            :class="[
              'transition-all duration-200 rounded-xl cursor-grab active:cursor-grabbing',
              draggedProcessId === proc.id ? 'opacity-30 scale-[0.98]' : '',
              dragOverProcessId === proc.id && draggedProcessId !== proc.id ? 'ring-2 ring-violet-500 shadow-lg shadow-violet-500/20' : ''
            ]"
          >
            <ProcessStreamCard 
              :process-id="proc.id"
              :name="proc.name"
              :pid="proc.pid"
              :color="proc.color"
              :history="snapshot.history"
              :stream-ids="proc.streamIds"
              :current-rate="proc.currentRate"
              :total-tokens="proc.totalTokens"
              :status="proc.status"
              :alert-threshold="snapshot.alertThreshold"
              :is-killing="proc.pid ? !!store.killInProgress[`${snapshot.agentId}-${proc.pid}`] : false"
              @kill="handleKillSubagent"
            />
          </div>
        </div>
      </div>

      <!-- Draggable & Minimizable Fleet Activity Dock -->
      <div 
        v-if="otherSnapshots.length > 0 && !isDockClosed"
        ref="dockRef"
        :style="dockStyle"
        :class="[
          'fixed w-72 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl z-40 font-mono text-xs hidden md:block select-none',
          isDockDragging ? 'cursor-grabbing ring-2 ring-violet-500/50 shadow-violet-500/10' : ''
        ]"
      >
        <!-- Draggable Header -->
        <div 
          @mousedown="startDockDrag"
          class="flex items-center justify-between px-2.5 py-1.5 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 cursor-grab active:cursor-grabbing hover:bg-zinc-50 dark:hover:bg-zinc-900/50 rounded-t-xl select-none"
          title="Drag to reposition Fleet Activity dock anywhere"
        >
          <div class="flex items-center gap-1.5">
            <GripVertical class="w-3 h-3 text-zinc-400 dark:text-zinc-600" />
            <Activity class="w-3 h-3 text-violet-500" />
            <span class="font-bold text-[9px] uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              Fleet Activity ({{ otherSnapshots.length }})
            </span>
          </div>

          <div class="flex items-center gap-0.5">
            <button 
              @click.stop="isDockMinimized = !isDockMinimized" 
              class="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-[10px] px-1 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded transition-colors cursor-pointer"
              :title="isDockMinimized ? 'Expand dock' : 'Minimize dock'"
            >
              {{ isDockMinimized ? '▲' : '▼' }}
            </button>
            <button 
              @click.stop="isDockClosed = true" 
              class="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-[10px] px-1 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded transition-colors cursor-pointer"
              title="Close dock"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- Expandable Body with Sparklines -->
        <div v-if="!isDockMinimized" class="p-2 pt-1.5">
          <div class="space-y-0.5 max-h-44 overflow-y-auto pr-0.5">
            <NuxtLink 
              v-for="other in otherSnapshots" 
              :key="other.agentId"
              :to="`/agents/${other.agentId}`"
              class="flex items-center justify-between text-[11px] py-1 px-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 group block"
            >
              <div class="flex items-center space-x-1.5 truncate w-24">
                <span class="w-1.5 h-1.5 rounded-full shrink-0 shadow-sm" :style="{ backgroundColor: other.color }"></span>
                <span class="truncate text-zinc-800 dark:text-zinc-200 group-hover:text-white font-medium text-[10px]">{{ other.agentName }}</span>
              </div>

              <!-- Mini Sparkline Path -->
              <div class="w-24 h-3.5 mx-1.5 flex items-center shrink-0">
                <svg class="w-full h-full overflow-visible" viewBox="0 0 96 14">
                  <path 
                    :d="getSparklineSvgPath(other.history)" 
                    fill="none" 
                    :stroke="other.color" 
                    stroke-width="1.5" 
                    stroke-linecap="round" 
                    stroke-linejoin="round" 
                  />
                </svg>
              </div>

              <div class="text-right shrink-0">
                <span class="font-bold text-zinc-900 dark:text-zinc-100 block text-[10px]">
                  {{ other.currentRate > 1000 ? `${(other.currentRate / 1000).toFixed(1)}k` : other.currentRate }}
                </span>
              </div>
            </NuxtLink>
          </div>

          <div class="mt-1.5 pt-1 border-t border-zinc-100 dark:border-zinc-800/60 text-right">
            <NuxtLink to="/" class="hover:text-zinc-900 dark:hover:text-zinc-100 text-[9px] text-zinc-400 inline-flex items-center gap-1 transition-colors">
              All Agents Overview &rarr;
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>

    <!-- Agent Not Found State -->
    <div v-else class="text-center py-16">
      <p class="text-zinc-500 font-mono text-sm mb-3">Agent not found or currently inactive.</p>
      <NuxtLink to="/" class="px-4 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg">
        &larr; Return to Overview
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { Square, Activity, GripVertical, ExternalLink } from 'lucide-vue-next';
import { useTelemetryStore } from '~/stores/telemetryStore';
import { useProviderHealth } from '~/composables/useProviderHealth';
import BreadcrumbNav from '~/components/BreadcrumbNav.vue';
import AgentChart from '~/components/AgentChart.vue';
import ProcessStreamCard from '~/components/ProcessStreamCard.vue';
import type { MinuteBucket } from '~/server/types/telemetry';

const route = useRoute();
const store = useTelemetryStore();
const { getProviderForAgent } = useProviderHealth();

const agentId = computed(() => route.params.id as string);
const snapshot = computed(() => store.getAgentById(agentId.value));
const agentProvider = computed(() => snapshot.value ? getProviderForAgent(snapshot.value.agentId, snapshot.value.agentName, snapshot.value.statusUrl) : null);

const otherSnapshots = computed(() => {
  return store.snapshots.filter(s => s.agentId !== agentId.value);
});

const isKilling = computed(() => !!store.killInProgress[agentId.value]);

const dockRef = ref<HTMLElement | null>(null);
const dockPosition = ref<{ x: number; y: number } | null>(null);
const isDockDragging = ref(false);
const isDockMinimized = ref(false);
const isDockClosed = ref(false);
let dragStartPos = { mouseX: 0, mouseY: 0, dockX: 0, dockY: 0 };

const startDockDrag = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (target.closest('a') || target.closest('button')) return;

  const dockEl = dockRef.value;
  if (!dockEl) return;

  const rect = dockEl.getBoundingClientRect();
  isDockDragging.value = true;

  dragStartPos = {
    mouseX: e.clientX,
    mouseY: e.clientY,
    dockX: rect.left,
    dockY: rect.top
  };

  if (typeof document !== 'undefined') {
    document.body.style.userSelect = 'none';
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('mousemove', onDockDrag);
    window.addEventListener('mouseup', stopDockDrag);
  }
};

const onDockDrag = (e: MouseEvent) => {
  if (!isDockDragging.value || typeof window === 'undefined') return;
  e.preventDefault();
  const deltaX = e.clientX - dragStartPos.mouseX;
  const deltaY = e.clientY - dragStartPos.mouseY;

  const newX = Math.max(10, Math.min(window.innerWidth - 340, dragStartPos.dockX + deltaX));
  const newY = Math.max(10, Math.min(window.innerHeight - 60, dragStartPos.dockY + deltaY));

  dockPosition.value = { x: newX, y: newY };
};

const stopDockDrag = () => {
  isDockDragging.value = false;
  if (typeof document !== 'undefined') {
    document.body.style.userSelect = '';
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('mousemove', onDockDrag);
    window.removeEventListener('mouseup', stopDockDrag);
  }
};

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('mousemove', onDockDrag);
    window.removeEventListener('mouseup', stopDockDrag);
  }
});

const dockStyle = computed(() => {
  if (!dockPosition.value) {
    return {
      bottom: '24px',
      right: '24px'
    };
  }
  return {
    left: `${dockPosition.value.x}px`,
    top: `${dockPosition.value.y}px`,
    right: 'auto',
    bottom: 'auto'
  };
});

function getSparklineSvgPath(history: MinuteBucket[] = []): string {
  if (!history || history.length <= 1) {
    return 'M 0 14 L 96 14';
  }
  const series = history.map(b => b.totalTokens || 0);
  const max = Math.max(...series, 1000);
  const count = series.length;
  
  const points = series.map((val, i) => {
    const x = (i / (count - 1)) * 96;
    const y = 14 - (val / max) * 12;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  
  return `M ${points.join(' L ')}`;
}

const PROCESS_PALETTE = [
  '#ec4899', // Pink / Magenta
  '#f59e0b', // Amber / Gold
  '#10b981', // Emerald
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#f97316', // Orange
  '#14b8a6', // Teal
  '#e11d48'  // Rose
];

const individualProcesses = computed(() => {
  if (!snapshot.value) return [];
  const subs = snapshot.value.subagents || [];
  
  return subs.map((sub: any, idx: number) => {
    const procId = sub.id || sub.subagentId || sub.name;
    return {
      id: procId,
      name: sub.name,
      pid: sub.pid,
      currentRate: sub.currentRate,
      totalTokens: sub.totalTokens,
      status: sub.status,
      color: sub.color || PROCESS_PALETTE[idx % PROCESS_PALETTE.length],
      streamIds: [procId]
    };
  });
});

const draggedProcessId = ref<string | null>(null);
const dragOverProcessId = ref<string | null>(null);

const orderedProcesses = computed(() => {
  const procs = individualProcesses.value;
  const savedOrder = store.processOrders[agentId.value] || [];
  if (!savedOrder.length) return procs;

  const orderMap = new Map(savedOrder.map((id, index) => [id, index]));
  return [...procs].sort((a, b) => {
    const orderA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
    const orderB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
    return orderA - orderB;
  });
});

const handleProcessDragStart = (e: DragEvent, procId: string) => {
  draggedProcessId.value = procId;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', procId);
  }
};

const handleProcessDragOver = (_e: DragEvent, procId: string) => {
  if (draggedProcessId.value && draggedProcessId.value !== procId) {
    dragOverProcessId.value = procId;
  }
};

const handleProcessDragLeave = (_e: DragEvent, procId: string) => {
  if (dragOverProcessId.value === procId) {
    dragOverProcessId.value = null;
  }
};

const handleProcessDrop = (e: DragEvent, targetProcId: string) => {
  e.preventDefault();
  const sourceId = draggedProcessId.value;
  if (!sourceId || sourceId === targetProcId) {
    handleProcessDragEnd();
    return;
  }

  const currentIds = orderedProcesses.value.map(p => p.id);
  const fromIndex = currentIds.indexOf(sourceId);
  const toIndex = currentIds.indexOf(targetProcId);

  if (fromIndex !== -1 && toIndex !== -1) {
    const nextOrder = [...currentIds];
    nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, sourceId);
    store.setProcessOrder(agentId.value, nextOrder);
  }

  handleProcessDragEnd();
};

const handleProcessDragEnd = () => {
  draggedProcessId.value = null;
  dragOverProcessId.value = null;
};

const handleEmergencyStop = async () => {
  if (snapshot.value) {
    await store.triggerEmergencyStop(snapshot.value.agentId);
  }
};

const handleKillSubagent = async (pid: number) => {
  if (snapshot.value) {
    await store.triggerEmergencyStop(snapshot.value.agentId, pid);
  }
};
</script>
