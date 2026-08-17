<template>
  <div 
    :class="[
      'rounded-xl p-4 transition-all duration-200 border bg-white dark:bg-zinc-950/80 shadow-sm flex flex-col justify-between relative',
      snapshot.isAlertBreached 
        ? 'border-red-500/80 ring-1 ring-red-500/50 shadow-red-500/10' 
        : 'border-zinc-200 dark:border-zinc-800/90'
    ]"
  >
    <!-- Top Accent Bar (Rounded to match card top corners) -->
    <div 
      class="absolute top-0 left-0 right-0 h-1 rounded-t-xl pointer-events-none"
      :style="{ backgroundColor: snapshot.isAlertBreached ? '#ef4444' : snapshot.color }"
    ></div>

    <div>
      <!-- Card Top Header -->
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center space-x-2">
          <GripVertical 
            @mouseenter="$emit('dragHandleEnter')"
            @mouseleave="$emit('dragHandleLeave')"
            class="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600 cursor-grab active:cursor-grabbing hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors" 
            title="Drag to reorder card" 
          />
          
          <!-- Clickable Color Dot & Floating Color Picker -->
          <div class="relative popover-container" @click.stop>
            <button 
              @click="toggleColorPopover"
              class="w-3.5 h-3.5 rounded-full shadow-sm shrink-0 border border-white/20 hover:scale-110 transition-transform cursor-pointer block"
              :style="{ backgroundColor: snapshot.color }"
              title="Click to change agent & chart color"
            ></button>

            <!-- Floating Color Picker Popover (Zero Layout Shift) -->
            <div 
              v-if="isEditingColor" 
              draggable="false"
              @dragstart.stop.prevent
              @mousedown.stop
              @pointerdown.stop
              class="absolute left-0 top-full mt-2 w-48 p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-2xl backdrop-blur-xl z-50 text-xs font-mono flex flex-col items-center select-none"
            >
              <div class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800/80 pb-1.5 mb-2.5 w-full">
                <span class="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1">
                  <Palette class="w-3.5 h-3.5 text-violet-500" />
                  Chart Color
                </span>
                <button @click="isEditingColor = false" class="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer">✕</button>
              </div>

              <!-- Circular HSL Color Disc with 5px White Selector Dot -->
              <div class="mb-2.5">
                <HsvColorWheel 
                  :model-value="snapshot.color"
                  :size="140"
                  @change="selectColor"
                />
              </div>

              <!-- 1 Single Clean Line: Dynamic Hex Input with Contrast Text -->
              <div class="w-full">
                <input 
                  :value="snapshot.color"
                  @change="e => selectColor((e.target as HTMLInputElement).value)"
                  class="w-full py-1.5 px-2 rounded-lg font-mono text-xs font-bold text-center uppercase tracking-wider transition-colors shadow-sm cursor-text border border-black/15 dark:border-white/20 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  :style="{
                    backgroundColor: snapshot.color,
                    color: getContrastTextColor(snapshot.color)
                  }"
                  title="Click to edit Hex code directly"
                />
              </div>
            </div>
          </div>

          <h3 class="font-bold text-sm text-zinc-900 dark:text-zinc-100 tracking-tight">
            {{ snapshot.agentName }}
          </h3>
          <span 
            v-if="snapshot.activePid" 
            class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
          >
            PID: {{ snapshot.activePid }}
          </span>
        </div>

        <div class="flex items-center space-x-2 relative">
          <!-- Quick Alert Threshold Badge & Floating Popover -->
          <div class="relative popover-container" @click.stop>
            <button 
              @click="toggleThresholdPopover"
              class="text-[10px] font-mono px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 hover:border-violet-500 dark:hover:border-violet-500 text-zinc-500 dark:text-zinc-400 hover:text-violet-500 flex items-center gap-1 transition-colors cursor-pointer"
              title="Click to edit alert threshold"
            >
              <Bell class="w-3 h-3 text-red-500" />
              <span>{{ (snapshot.alertThreshold / 1000).toFixed(0) }}k</span>
            </button>

            <!-- Floating Popover for Alert Threshold (Zero Layout Shift) -->
            <div 
              v-if="isEditingThreshold" 
              class="absolute right-0 top-full mt-2 w-72 p-3.5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-2xl backdrop-blur-xl z-50 text-xs font-mono"
            >
              <div class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2 mb-2.5">
                <span class="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Bell class="w-3.5 h-3.5 text-red-500" />
                  Alert Threshold
                </span>
                <button @click="isEditingThreshold = false" class="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-sm">✕</button>
              </div>

              <!-- Quick Presets -->
              <div class="grid grid-cols-4 gap-1.5 mb-3">
                <button 
                  v-for="preset in [5000, 10000, 15000, 25000]" 
                  :key="preset"
                  @click="tempThreshold = preset"
                  :class="[
                    'py-1 rounded-md text-[11px] font-bold transition-all border text-center cursor-pointer',
                    tempThreshold === preset
                      ? 'bg-violet-600 border-violet-600 text-white shadow-sm'
                      : 'bg-zinc-50 dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700/80 text-zinc-600 dark:text-zinc-300 hover:border-violet-500'
                  ]"
                >
                  {{ preset / 1000 }}k
                </button>
              </div>

              <!-- Custom Input with Stepper Controls -->
              <div class="flex items-center gap-1.5">
                <div class="relative flex-1 flex items-center bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-violet-500">
                  <button 
                    type="button"
                    @click="tempThreshold = Math.max(1000, tempThreshold - 1000)"
                    class="px-2.5 py-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors font-bold text-sm select-none cursor-pointer"
                  >
                    -
                  </button>
                  <input 
                    v-model.number="tempThreshold" 
                    type="number" 
                    step="1000" 
                    min="1000"
                    class="w-full bg-transparent text-center font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none py-1"
                  />
                  <span class="text-[10px] text-zinc-400 pr-1 shrink-0 font-mono">tok/m</span>
                  <button 
                    type="button"
                    @click="tempThreshold = tempThreshold + 1000"
                    class="px-2.5 py-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors font-bold text-sm select-none cursor-pointer"
                  >
                    +
                  </button>
                </div>

                <button 
                  @click="saveThreshold"
                  class="px-3.5 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-bold text-xs shadow-sm transition-all active:scale-95 shrink-0 cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
          <!-- Status Indicator Badge & Floating Process Diagnostics Popover -->
          <div class="relative popover-container" @click.stop>
            <button 
              @click="toggleStatusPopover"
              class="flex items-center space-x-1.5 text-xs font-mono px-2 py-0.5 rounded-md bg-zinc-100/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors cursor-pointer"
              title="Click to view process telemetry diagnostics"
            >
              <span 
                :class="[
                  'w-1.5 h-1.5 rounded-full',
                  snapshot.status === 'active' ? 'bg-emerald-500 animate-pulse' : 
                  snapshot.status === 'idle' ? 'bg-zinc-400' : 'bg-red-500'
                ]"
              ></span>
              <span class="capitalize text-zinc-700 dark:text-zinc-300 text-[11px] font-medium">
                {{ snapshot.status }}
              </span>
            </button>

            <!-- Floating Process Diagnostics Popover -->
            <div 
              v-if="isShowingStatusInfo" 
              class="absolute right-0 top-full mt-2 w-64 p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-2xl backdrop-blur-xl z-50 text-xs font-mono"
            >
              <div class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-1.5 mb-2">
                <span class="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Activity class="w-3.5 h-3.5 text-emerald-500" />
                  Process Diagnostics
                </span>
                <button @click="isShowingStatusInfo = false" class="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">✕</button>
              </div>

              <div class="space-y-1.5 text-[11px]">
                <div class="flex justify-between">
                  <span class="text-zinc-500">Active PID:</span>
                  <span class="font-bold text-zinc-800 dark:text-zinc-200">{{ snapshot.activePid || 'None (Stopped)' }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-zinc-500">Current State:</span>
                  <span class="capitalize font-bold text-emerald-500">{{ snapshot.status }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-zinc-500">Live Burn Rate:</span>
                  <span class="font-bold text-zinc-800 dark:text-zinc-200">{{ snapshot.currentRate.toLocaleString() }} tok/m</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-zinc-500">15m Peak Burn:</span>
                  <span class="font-bold text-zinc-800 dark:text-zinc-200">{{ snapshot.localMax.toLocaleString() }} tok/m</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-zinc-500">Active Subagents:</span>
                  <span class="font-bold text-zinc-800 dark:text-zinc-200">{{ snapshot.subagents ? snapshot.subagents.length : 0 }} running</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-zinc-500">24h Total Tokens:</span>
                  <span class="font-bold text-zinc-800 dark:text-zinc-200">{{ snapshot.totalTokens24h ? snapshot.totalTokens24h.toLocaleString() : '0' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Key Metrics Row -->
      <div class="grid grid-cols-2 gap-2 mb-3 font-mono text-xs">
        <div class="bg-zinc-50 dark:bg-zinc-900/50 p-2 rounded-lg border border-zinc-100 dark:border-zinc-800/40">
          <span class="text-[10px] text-zinc-500 block uppercase">Current Burn</span>
          <span class="text-base font-bold text-zinc-900 dark:text-zinc-100">
            {{ snapshot.currentRate.toLocaleString() }}
          </span>
          <span class="text-[10px] text-zinc-400"> tok/m</span>
        </div>

        <div class="bg-zinc-50 dark:bg-zinc-900/50 p-2 rounded-lg border border-zinc-100 dark:border-zinc-800/40">
          <span class="text-[10px] text-zinc-500 block uppercase">Local Max (15m)</span>
          <span class="text-base font-bold text-zinc-900 dark:text-zinc-100">
            {{ snapshot.localMax.toLocaleString() }}
          </span>
          <span class="text-[10px] text-zinc-400"> tok/m</span>
        </div>
      </div>

      <!-- Real-Time Chart Graph -->
      <AgentChart 
        :history="snapshot.history" 
        :color="snapshot.color" 
        :alert-threshold="snapshot.alertThreshold" 
        :local-max="snapshot.localMax"
        :subagents="snapshot.subagents" 
      />

    </div>

    <!-- Action Bar (Fixed Uniform Alignment Across Grid) -->
    <div class="flex items-center justify-between mt-3 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/60 font-mono text-xs">
      <NuxtLink 
        :to="`/agents/${snapshot.agentId}`"
        class="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors p-1"
      >
        <Maximize2 class="w-3.5 h-3.5" />
        <span>Zoom In</span>
        <span 
          v-if="snapshot.subagents && snapshot.subagents.length > 0" 
          class="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 font-semibold"
        >
          {{ snapshot.subagents.length }} active
        </span>
      </NuxtLink>

      <!-- Emergency Stop Button -->
      <button 
        @click="$emit('killAgent', snapshot.agentId)"
        :disabled="snapshot.status === 'stopped' || isKilling"
        :class="[
          'px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-all text-xs shadow-sm',
          snapshot.status === 'stopped'
            ? 'opacity-40 cursor-not-allowed bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500'
            : 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white active:scale-95 border border-red-500/20'
        ]"
      >
        <Square class="w-3 h-3 fill-current" />
        <span>{{ isKilling ? 'STOPPING...' : (snapshot.isAlertBreached ? 'EMERGENCY STOP' : 'STOP AGENT') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { Maximize2, Square, Bell, GripVertical, Info, Palette, Activity } from 'lucide-vue-next';
import type { AgentTelemetrySnapshot } from '~/server/types/telemetry';
import AgentChart from './AgentChart.vue';
import HsvColorWheel from './HsvColorWheel.vue';

const props = defineProps<{
  snapshot: AgentTelemetrySnapshot;
  isKilling: boolean;
}>();

const emit = defineEmits<{
  (e: 'killAgent', agentId: string): void;
  (e: 'killSubagent', agentId: string, pid: number): void;
  (e: 'updateThreshold', agentId: string, threshold: number): void;
  (e: 'updateColor', agentId: string, color: string): void;
  (e: 'dragHandleEnter'): void;
  (e: 'dragHandleLeave'): void;
}>();

const isEditingThreshold = ref(false);
const isEditingColor = ref(false);
const isShowingStatusInfo = ref(false);
const tempThreshold = ref(props.snapshot.alertThreshold);

const agentColor = computed(() => props.snapshot.color || (props.snapshot.agentId === 'claude' ? '#a855f7' : '#06b6d4'));

function colorWithAlpha(colorStr: string, alpha: number): string {
  if (!colorStr) return `rgba(6, 182, 212, ${alpha})`;
  if (colorStr.startsWith('#')) {
    const hex = colorStr.replace('#', '');
    let r = 0, g = 0, b = 0;
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length >= 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (colorStr.startsWith('hsl')) {
    return colorStr.replace('hsl', 'hsla').replace(')', `, ${alpha})`);
  }
  return colorStr;
}

function getContrastTextColor(hex: string): string {
  if (!hex) return '#ffffff';
  let clean = hex.replace('#', '');
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
  const num = parseInt(clean || '000000', 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000000' : '#ffffff';
}

const colorPresets = [
  '#06b6d4', // Cyan
  '#a855f7', // Purple
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#f43f5e', // Rose
  '#6366f1', // Indigo
  '#3b82f6', // Blue
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#f97316'  // Orange
];

watch(() => props.snapshot.alertThreshold, (val) => {
  if (!isEditingThreshold.value) {
    tempThreshold.value = val;
  }
});

const toggleThresholdPopover = () => {
  isEditingThreshold.value = !isEditingThreshold.value;
  if (isEditingThreshold.value) {
    isEditingColor.value = false;
    isShowingStatusInfo.value = false;
  }
};

const toggleColorPopover = () => {
  isEditingColor.value = !isEditingColor.value;
  if (isEditingColor.value) {
    isEditingThreshold.value = false;
    isShowingStatusInfo.value = false;
  }
};

const toggleStatusPopover = () => {
  isShowingStatusInfo.value = !isShowingStatusInfo.value;
  if (isShowingStatusInfo.value) {
    isEditingThreshold.value = false;
    isEditingColor.value = false;
  }
};

const selectColor = (color: string) => {
  emit('updateColor', props.snapshot.agentId, color);
};

const closeAllPopovers = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target || !target.isConnected) return;
  if (!target.closest('.popover-container')) {
    isEditingThreshold.value = false;
    isEditingColor.value = false;
    isShowingStatusInfo.value = false;
  }
};

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('click', closeAllPopovers);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('click', closeAllPopovers);
  }
});

const saveThreshold = () => {
  if (tempThreshold.value > 0) {
    emit('updateThreshold', props.snapshot.agentId, tempThreshold.value);
    isEditingThreshold.value = false;
  }
};
</script>
