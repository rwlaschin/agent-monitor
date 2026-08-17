<template>
  <div class="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 shadow-sm font-mono flex flex-col justify-between select-none relative">
    <!-- Top Accent Bar -->
    <div 
      class="absolute top-0 left-0 right-0 h-1 rounded-t-xl pointer-events-none"
      :style="{ backgroundColor: color }"
    ></div>

    <!-- Process Header -->
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center space-x-2 truncate">
        <GripVertical class="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600 shrink-0 cursor-grab active:cursor-grabbing hover:text-zinc-300 transition-colors" />
        <span class="w-3 h-3 rounded-full shrink-0 shadow-sm" :style="{ backgroundColor: color }"></span>
        <div class="truncate">
          <div class="flex items-center gap-1.5 truncate">
            <span class="font-bold text-xs text-zinc-900 dark:text-zinc-100 truncate">{{ cleanDisplayName }}</span>
            <span v-if="effectivePid" class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
              PID {{ effectivePid }}
            </span>
          </div>
          <span class="text-[10px] text-zinc-500 block truncate">{{ cleanSubtitle }}</span>
        </div>
      </div>

      <!-- Live Status & Stop Button -->
      <div class="flex items-center gap-2 shrink-0">
        <span 
          :class="[
            'text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 transition-colors',
            liveBurnRate > 0 
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
              : 'bg-zinc-500/10 text-zinc-500 border border-zinc-500/20'
          ]"
        >
          <span :class="['w-1.5 h-1.5 rounded-full', liveBurnRate > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500']"></span>
          {{ liveBurnRate > 0 ? 'Active' : 'Idle' }}
        </span>

        <button 
          v-if="effectivePid"
          @click="$emit('kill', effectivePid)"
          :disabled="isKilling"
          class="kill-btn text-[10px] px-2.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white transition-all font-semibold border border-red-500/20 active:scale-95 cursor-pointer disabled:opacity-50"
          :title="`Terminate process PID ${effectivePid}`"
        >
          {{ isKilling ? 'Stopping...' : 'Stop' }}
        </button>
      </div>
    </div>

    <!-- Metric Badges Row -->
    <div class="grid grid-cols-3 gap-2 mb-3 text-[11px] bg-zinc-50 dark:bg-zinc-900/50 p-2 rounded-lg border border-zinc-100 dark:border-zinc-800/50">
      <div>
        <span class="text-zinc-500 block text-[9px] uppercase">Burn Rate</span>
        <span class="font-bold text-zinc-900 dark:text-zinc-100">{{ liveBurnRate.toLocaleString() }}</span>
        <span class="text-[9px] text-zinc-400"> tok/m</span>
      </div>
      <div>
        <span class="text-zinc-500 block text-[9px] uppercase">Peak (15m)</span>
        <span class="font-bold text-zinc-900 dark:text-zinc-100">{{ (calculatedPeak / 1000).toFixed(1) }}k</span>
        <span class="text-[9px] text-zinc-400"> tok/m</span>
      </div>
      <div>
        <span class="text-zinc-500 block text-[9px] uppercase">15m Total</span>
        <span class="font-bold text-zinc-900 dark:text-zinc-100">{{ (calculatedTotal / 1000).toFixed(1) }}k</span>
        <span class="text-[9px] text-zinc-400"> tok</span>
      </div>
    </div>

    <!-- Process Streaming Sparkline Chart -->
    <div class="relative w-full h-28 bg-zinc-900/40 dark:bg-black/40 rounded-lg p-1.5 border border-zinc-800/60 overflow-hidden">
      <canvas 
        ref="canvasRef" 
        @mousemove="handleMouseMove" 
        @mouseleave="handleMouseLeave"
        class="w-full h-full block cursor-crosshair"
      ></canvas>

      <!-- Floating Hover Tooltip -->
      <div 
        v-if="hoveredPoint" 
        class="absolute pointer-events-none z-20 bg-zinc-950/95 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-zinc-700 shadow-xl text-[10px] text-zinc-200 min-w-[100px]"
        :style="tooltipStyle"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-zinc-400 font-mono">{{ hoveredPoint.timeLabel }}</span>
          <span class="font-bold text-white font-mono">{{ hoveredPoint.tokens.toLocaleString() }} tok/m</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onBeforeUnmount, nextTick } from 'vue';
import { GripVertical } from 'lucide-vue-next';
import type { MinuteBucket } from '~/server/types/telemetry';

const props = withDefaults(defineProps<{
  processId: string;
  name: string;
  color?: string;
  history: MinuteBucket[];
  streamIds?: string[];
  currentRate?: number;
  localMax?: number;
  totalTokens?: number;
  pid?: number | null;
  parentPid?: number | null;
  status?: 'active' | 'idle' | 'stopped';
  alertThreshold?: number;
  isKilling?: boolean;
}>(), {
  color: '#ec4899',
  streamIds: () => [],
  currentRate: 0,
  totalTokens: 0,
  alertThreshold: 15000
});

const effectivePid = computed(() => props.pid || props.parentPid || null);

const cleanDisplayName = computed(() => {
  let display = props.name || props.processId || '';
  display = display.replace(/^Project\s*\[?/i, '').replace(/^Session\s*\[?/i, '').replace(/\]$/, '');
  return display.trim() || props.processId;
});

const cleanSubtitle = computed(() => {
  let sub = props.processId || '';
  if (sub.startsWith('project--')) {
    sub = sub.replace(/^project--/, '').replace(/-/g, '/');
  } else if (sub.startsWith('project-')) {
    sub = sub.replace(/^project-/, '');
  }
  return sub;
});

defineEmits<{
  (e: 'kill', pid: number): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let animationFrameId: number | null = null;

const hoverIndex = ref<number | null>(null);
const hoverCoords = ref<{ x: number; y: number } | null>(null);

function matchesTarget(subKey: string, targetId: string): boolean {
  if (!subKey || !targetId) return false;
  if (subKey === targetId) return true;
  if (subKey === `project-${targetId}` || targetId === `project-${subKey}`) return true;
  if (subKey === `session-${targetId}` || targetId === `session-${subKey}`) return true;
  return false;
}

// Extract series points for this specific process ONLY
const processSeries = computed(() => {
  const buckets = props.history || [];
  const targetIds = [props.processId, ...(props.streamIds || [])];

  return buckets.map(b => {
    if (props.processId === 'main') {
      return b.mainTokens || 0;
    }
    if (!b.subagentTokens) return 0;

    // Check exact matches across assigned stream IDs
    let sum = 0;
    const matched = new Set<string>();

    for (const tid of targetIds) {
      if (b.subagentTokens[tid] && !matched.has(tid)) {
        sum += b.subagentTokens[tid].tokens;
        matched.add(tid);
      }
    }

    if (sum === 0) {
      for (const [subKey, subVal] of Object.entries(b.subagentTokens)) {
        for (const tid of targetIds) {
          if (matchesTarget(subKey, tid) && !matched.has(subKey)) {
            sum += subVal.tokens;
            matched.add(subKey);
          }
        }
      }
    }

    return sum;
  });
});

// Live burn rate derived from the latest series point at NOW
const liveBurnRate = computed(() => {
  const series = processSeries.value;
  if (series.length > 0) {
    const latest = series[series.length - 1];
    if (typeof latest === 'number' && latest > 0) return latest;
  }
  return props.currentRate || 0;
});

const calculatedPeak = computed(() => {
  const series = processSeries.value;
  return series.length > 0 ? Math.max(...series, liveBurnRate.value) : liveBurnRate.value;
});

const calculatedTotal = computed(() => {
  const series = processSeries.value;
  const sum = series.reduce((acc, v) => acc + v, 0);
  return sum > 0 ? sum : (props.totalTokens || 0);
});

function colorWithAlpha(colorStr: string, alpha: number): string {
  if (!colorStr) return `rgba(236, 72, 153, ${alpha})`;
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

const renderChart = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 280;
  const height = canvas.clientHeight || canvas.parentElement?.clientHeight || 112;

  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }

  // Explicitly reset the transform matrix to DPR scaling every frame
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const series = processSeries.value;
  const count = series.length;
  if (count === 0) {
    return;
  }

  const paddingBottom = 16;
  const paddingTop = 8;
  const paddingLeft = 32;
  const paddingRight = 8;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const peak = Math.max(...series, 1000);
  const alertThreshold = props.alertThreshold || 15000;
  const maxY = Math.max(alertThreshold * 1.1, peak * 1.25, 1000);

  // Grid Lines
  ctx.strokeStyle = '#27272a';
  ctx.lineWidth = 0.5;
  ctx.fillStyle = '#71717a';
  ctx.font = '8px monospace';
  ctx.textAlign = 'right';

  for (let i = 0; i <= 2; i++) {
    const yVal = (maxY / 2) * i;
    const yPos = paddingTop + chartHeight - (chartHeight * (yVal / maxY));
    ctx.beginPath();
    ctx.moveTo(paddingLeft, yPos);
    ctx.lineTo(width - paddingRight, yPos);
    ctx.stroke();
    ctx.fillText(`${(yVal / 1000).toFixed(1)}k`, paddingLeft - 3, yPos + 3);
  }

  // Draw Horizontal Dashed Alert Threshold Line
  if (alertThreshold > 0 && alertThreshold <= maxY) {
    const alertY = paddingTop + chartHeight - (chartHeight * (alertThreshold / maxY));
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, alertY);
    ctx.lineTo(width - paddingRight, alertY);
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`ALERT: ${(alertThreshold / 1000).toFixed(0)}k`, paddingLeft + 3, alertY - 3);
    ctx.restore();
  }

  if (count <= 1) {
    return;
  }

  const stepX = (i: number) => paddingLeft + (chartWidth * (i / (count - 1)));
  const points: { x: number; y: number; val: number }[] = [];

  for (let i = 0; i < count; i++) {
    const val = series[i];
    const x = stepX(i);
    const y = paddingTop + chartHeight - (chartHeight * (val / maxY));
    points.push({ x, y, val });
  }

  // 1. Fill Area Gradient
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, paddingTop + chartHeight);
  for (const p of points) ctx.lineTo(p.x, p.y);
  ctx.lineTo(points[points.length - 1].x, paddingTop + chartHeight);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + chartHeight);
  gradient.addColorStop(0, colorWithAlpha(props.color, 0.35));
  gradient.addColorStop(1, colorWithAlpha(props.color, 0.02));
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();

  // 2. Line Stroke
  ctx.save();
  ctx.strokeStyle = props.color;
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < count; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  ctx.restore();

  // 3. Data Nodes
  for (const p of points) {
    if (p.val > 0) {
      const isBreached = alertThreshold > 0 && p.val >= alertThreshold;
      if (isBreached) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.fill();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = props.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 4. X-Axis Labels
  ctx.fillStyle = '#71717a';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('-15m', paddingLeft, height - 2);
  ctx.fillText('-10m', paddingLeft + (chartWidth * 0.33), height - 2);
  ctx.fillText('-5m', paddingLeft + (chartWidth * 0.66), height - 2);
  ctx.fillText('NOW', width - paddingRight - 6, height - 2);

  // 5. Crosshair Hover
  if (hoverIndex.value !== null && hoverIndex.value >= 0 && hoverIndex.value < count) {
    const hIdx = hoverIndex.value;
    const hPoint = points[hIdx];
    if (hPoint) {
      ctx.save();
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hPoint.x, paddingTop);
      ctx.lineTo(hPoint.x, paddingTop + chartHeight);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(hPoint.x, hPoint.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }
};

const hoveredPoint = computed(() => {
  if (hoverIndex.value === null) return null;
  const series = processSeries.value;
  const idx = hoverIndex.value;
  if (idx < 0 || idx >= series.length) return null;
  const offsetMin = series.length - 1 - idx;
  return {
    timeLabel: offsetMin === 0 ? 'NOW' : `-${offsetMin}m`,
    tokens: series[idx]
  };
});

const tooltipStyle = computed(() => {
  if (!hoverCoords.value) return {};
  const { x, y } = hoverCoords.value;
  const isRight = x > 120;
  return {
    left: isRight ? `${x - 105}px` : `${x + 12}px`,
    top: `${Math.max(4, Math.min(y - 20, 50))}px`
  };
});

const handleMouseMove = (e: MouseEvent) => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const count = processSeries.value.length;
  if (count <= 1) return;

  const paddingLeft = 32;
  const paddingRight = 8;
  const chartWidth = canvas.clientWidth - paddingLeft - paddingRight;
  const ratio = Math.max(0, Math.min(1, (x - paddingLeft) / chartWidth));
  const idx = Math.round(ratio * (count - 1));

  hoverIndex.value = idx;
  hoverCoords.value = { x, y };
  renderChart();
};

const handleMouseLeave = () => {
  hoverIndex.value = null;
  hoverCoords.value = null;
  renderChart();
};

watch(() => [props.history, props.streamIds], () => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = requestAnimationFrame(renderChart);
}, { deep: true });

onMounted(() => {
  nextTick(() => {
    renderChart();
    requestAnimationFrame(renderChart);
  });
  window.addEventListener('resize', renderChart);
});

onBeforeUnmount(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  window.removeEventListener('resize', renderChart);
});
</script>

