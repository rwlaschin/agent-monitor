<template>
  <div class="relative w-full bg-zinc-900/40 dark:bg-black/40 rounded-lg p-2 border border-zinc-800/60 overflow-hidden flex flex-col justify-between select-none font-mono">
    <!-- Interactive Process Legend (Focus Mode on Hover) -->
    <div class="flex items-center gap-1.5 mb-1.5 overflow-x-auto text-[10px] text-zinc-400 shrink-0 scrollbar-none pb-0.5">
      <!-- Total Swarm Pill -->
      <button 
        @mouseenter="focusLayer('total')"
        @mouseleave="focusLayer(null)"
        :class="[
          'legend-pill flex items-center gap-1 shrink-0 px-2 py-0.5 rounded border transition-all cursor-pointer',
          focusedLayerId === 'total' 
            ? 'bg-zinc-800 border-zinc-500 text-white shadow-sm ring-1 ring-white/30' 
            : focusedLayerId !== null 
            ? 'opacity-30 border-transparent bg-zinc-900/40' 
            : 'bg-zinc-800/60 border-zinc-700/50 hover:bg-zinc-800 hover:text-zinc-200'
        ]"
        title="Hover to isolate Total Swarm curve"
      >
        <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ backgroundColor: props.color }"></span>
        <span class="font-medium text-zinc-200">Total</span>
        <span class="font-semibold text-zinc-400">({{ (latestTotalRate / 1000).toFixed(1) }}k)</span>
      </button>

      <!-- Subagent / Subprocess Pills -->
      <button 
        v-for="layer in topProcessLayers" 
        :key="layer.id" 
        @mouseenter="focusLayer(layer.id)"
        @mouseleave="focusLayer(null)"
        :class="[
          'legend-pill flex items-center gap-1 shrink-0 px-2 py-0.5 rounded border transition-all cursor-pointer',
          focusedLayerId === layer.id 
            ? 'bg-zinc-800 border-zinc-500 text-white shadow-sm ring-1 ring-white/30 scale-[1.02]' 
            : focusedLayerId !== null 
            ? 'opacity-30 border-transparent bg-zinc-900/40' 
            : 'bg-zinc-800/60 border-zinc-700/50 hover:bg-zinc-800 hover:text-zinc-200'
        ]"
        :title="`Hover to isolate ${layer.name} curve`"
      >
        <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ backgroundColor: layer.color }"></span>
        <span class="truncate max-w-[90px] text-zinc-300">{{ layer.name }}</span>
        <span class="font-semibold text-zinc-400">({{ (layer.currentRate / 1000).toFixed(1) }}k)</span>
      </button>
    </div>

    <!-- Canvas Chart Viewport with Interactive Hover Listeners -->
    <div class="relative w-full h-36">
      <canvas 
        ref="canvasRef" 
        @mousemove="handleMouseMove" 
        @mouseleave="handleMouseLeave"
        class="w-full h-full block cursor-crosshair"
      ></canvas>

      <!-- Floating Hover Tooltip -->
      <div 
        v-if="hoveredData" 
        class="chart-tooltip absolute pointer-events-none z-30 bg-zinc-950/95 backdrop-blur-md p-2.5 rounded-lg border border-zinc-700/80 shadow-2xl text-[11px] font-mono text-zinc-100 min-w-[140px] transition-transform duration-75 ease-out"
        :style="tooltipStyle"
      >
        <div class="flex items-center justify-between border-b border-zinc-800 pb-1 mb-1 text-[10px] text-zinc-400">
          <span class="font-semibold">{{ hoveredData.timeLabel }}</span>
          <span class="font-bold text-zinc-100">{{ hoveredData.total.toLocaleString() }} tok/m</span>
        </div>

        <div class="space-y-0.5">
          <div 
            v-for="item in hoveredData.breakdown" 
            :key="item.name" 
            class="flex items-center justify-between gap-2 text-[10px]"
          >
            <span class="flex items-center gap-1.5 truncate max-w-[100px] text-zinc-400">
              <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ backgroundColor: item.color }"></span>
              <span class="truncate">{{ item.name }}</span>
            </span>
            <span :class="['font-semibold tabular-nums', item.isBreached ? 'text-red-400 font-bold' : 'text-zinc-200']">
              {{ item.tokens.toLocaleString() }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue';
import type { MinuteBucket } from '~/server/types/telemetry';

const props = defineProps<{
  history: MinuteBucket[];
  color: string;
  alertThreshold: number;
  localMax: number;
  subagents?: { id: string; name: string; color?: string; currentRate?: number; totalTokens?: number; pid?: number }[];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let animationFrameId: number | null = null;

const hoverIndex = ref<number | null>(null);
const hoverCoords = ref<{ x: number; y: number } | null>(null);
const focusedLayerId = ref<string | null>(null);

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

const latestTotalRate = computed(() => {
  const buckets = props.history || [];
  if (buckets.length === 0) return 0;
  return buckets[buckets.length - 1].totalTokens || 0;
});

// Compute Process Layers across all known and active subagent streams
const topProcessLayers = computed(() => {
  const buckets = props.history || [];
  const activeSubs = props.subagents || [];

  const subagentTotals = new Map<string, { id: string; name: string; color: string; totalTokens: number; currentRate: number }>();
  const latestBucket = buckets.length > 0 ? buckets[buckets.length - 1] : null;

  const getCanonicalKey = (id: string, name: string) => {
    const cleanId = (id || '').replace(/^project-+/i, '').trim();
    const cleanName = (name || '').trim();
    return cleanName && cleanName !== cleanId ? cleanName : cleanId;
  };

  // Initialize from known subagents
  for (const sub of activeSubs) {
    const key = getCanonicalKey(sub.id, sub.name);
    const existing = subagentTotals.get(key);
    if (existing) {
      existing.totalTokens += (sub.totalTokens || 0);
      existing.currentRate += (sub.currentRate || 0);
      if (sub.color && !existing.color) existing.color = sub.color;
    } else {
      subagentTotals.set(key, {
        id: sub.id,
        name: sub.name || sub.id,
        color: sub.color || '',
        totalTokens: sub.totalTokens || 0,
        currentRate: sub.currentRate || 0
      });
    }
  }

  // Aggregate from 15m history buckets
  for (const bucket of buckets) {
    if (!bucket.subagentTokens) continue;
    for (const [subId, data] of Object.entries(bucket.subagentTokens)) {
      const key = getCanonicalKey(subId, data.name || subId);
      let existing = subagentTotals.get(key);
      if (!existing) {
        existing = {
          id: subId,
          name: data.name || subId,
          color: '',
          totalTokens: 0,
          currentRate: 0
        };
        subagentTotals.set(key, existing);
      }
      existing.totalTokens += data.tokens;
    }
  }

  if (latestBucket && latestBucket.subagentTokens) {
    for (const [subId, data] of Object.entries(latestBucket.subagentTokens)) {
      const key = getCanonicalKey(subId, data.name || subId);
      const existing = subagentTotals.get(key);
      if (existing) {
        existing.currentRate = data.tokens;
      }
    }
  }

  const sortedSubagents = Array.from(subagentTotals.values()).sort((a, b) => (b.currentRate || b.totalTokens) - (a.currentRate || a.totalTokens));
  if (sortedSubagents.length === 0) return [];

  const result: { id: string; name: string; color: string; totalTokens: number; currentRate: number }[] = [];
  let colorIdx = 0;

  // Include Main Process if mainTokens exist alongside subagents
  const totalMainTokens = buckets.reduce((sum, b) => sum + (b.mainTokens || 0), 0);
  if (totalMainTokens > 0) {
    result.push({
      id: 'main',
      name: 'Main Process',
      color: props.color || PROCESS_PALETTE[colorIdx % PROCESS_PALETTE.length],
      totalTokens: totalMainTokens,
      currentRate: latestBucket ? (latestBucket.mainTokens || 0) : 0
    });
    colorIdx++;
  }

  for (const sub of sortedSubagents) {
    result.push({
      id: sub.id,
      name: sub.name,
      color: sub.color || PROCESS_PALETTE[colorIdx % PROCESS_PALETTE.length],
      totalTokens: sub.totalTokens,
      currentRate: sub.currentRate
    });
    colorIdx++;
  }

  return result;
});

const focusLayer = (layerId: string | null) => {
  focusedLayerId.value = layerId;
  renderChart();
};

const renderChart = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Handle high-DPI displays
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const buckets = props.history || [];
  if (buckets.length === 0) {
    ctx.restore();
    return;
  }

  const paddingBottom = 18;
  const paddingTop = 12;
  const paddingLeft = 38;
  const paddingRight = 8;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Compute maximum for Y-axis scale
  const maxY = Math.max(props.alertThreshold * 1.1, props.localMax * 1.2, 1000);

  // Draw Grid Lines & Y-Axis Labels
  ctx.strokeStyle = '#27272a';
  ctx.lineWidth = 0.5;
  ctx.fillStyle = '#71717a';
  ctx.font = '9px monospace';
  ctx.textAlign = 'right';

  for (let i = 0; i <= 3; i++) {
    const yVal = (maxY / 3) * i;
    const yPos = paddingTop + chartHeight - (chartHeight * (yVal / maxY));
    
    ctx.beginPath();
    ctx.moveTo(paddingLeft, yPos);
    ctx.lineTo(width - paddingRight, yPos);
    ctx.stroke();

    ctx.fillText(`${(yVal / 1000).toFixed(1)}k`, paddingLeft - 4, yPos + 3);
  }

  // Draw Horizontal Alert Threshold Line
  if (props.alertThreshold > 0 && props.alertThreshold <= maxY) {
    const alertY = paddingTop + chartHeight - (chartHeight * (props.alertThreshold / maxY));
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, alertY);
    ctx.lineTo(width - paddingRight, alertY);
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`ALERT: ${(props.alertThreshold / 1000).toFixed(0)}k`, paddingLeft + 4, alertY - 4);
    ctx.restore();
  }

  const count = buckets.length;
  if (count <= 1) {
    ctx.restore();
    return;
  }

  const stepX = (i: number) => paddingLeft + (chartWidth * (i / (count - 1)));
  const layers = topProcessLayers.value;
  const isFocusing = focusedLayerId.value !== null;

  // 1. Draw Total Swarm Area Fill (from baseline y=0)
  const totalPoints: { x: number; y: number; val: number }[] = [];
  for (let i = 0; i < count; i++) {
    const val = buckets[i].totalTokens;
    const x = stepX(i);
    const y = paddingTop + chartHeight - (chartHeight * (val / maxY));
    totalPoints.push({ x, y, val });
  }

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(totalPoints[0].x, paddingTop + chartHeight);
  for (const p of totalPoints) ctx.lineTo(p.x, p.y);
  ctx.lineTo(totalPoints[totalPoints.length - 1].x, paddingTop + chartHeight);
  ctx.closePath();

  const isTotalDimmed = isFocusing && focusedLayerId.value !== 'total';
  const areaAlpha = isTotalDimmed ? 0.05 : 0.35;
  const gradient = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + chartHeight);
  gradient.addColorStop(0, colorWithAlpha(props.color, areaAlpha));
  gradient.addColorStop(0.7, colorWithAlpha(props.color, areaAlpha * 0.35));
  gradient.addColorStop(1, colorWithAlpha(props.color, 0.01));
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();

  // 2. Draw Total Swarm Guide Line (Bright, Clear & High Visibility)
  ctx.save();
  ctx.strokeStyle = colorWithAlpha(props.color, isTotalDimmed ? 0.25 : 0.9);
  ctx.lineWidth = focusedLayerId.value === 'total' ? 2.5 : (layers.length > 0 ? 1.5 : 2.0);
  if (layers.length > 0 && focusedLayerId.value !== 'total') {
    ctx.setLineDash([4, 4]);
  }
  ctx.beginPath();
  ctx.moveTo(totalPoints[0].x, totalPoints[0].y);
  for (let i = 1; i < totalPoints.length; i++) {
    ctx.lineTo(totalPoints[i].x, totalPoints[i].y);
  }
  ctx.stroke();
  ctx.restore();

  // 3. Draw Independent Subagent Curves from Baseline y=0
  if (layers.length > 0) {
    for (const layer of layers) {
      const layerPoints: { x: number; y: number; val: number }[] = [];
      for (let i = 0; i < count; i++) {
        const b = buckets[i];
        let sliceTokens = 0;

        if (layer.id === 'main') {
          sliceTokens = b.mainTokens || 0;
        } else {
          sliceTokens = b.subagentTokens?.[layer.id]?.tokens || 0;
        }

        const x = stepX(i);
        const y = paddingTop + chartHeight - (chartHeight * (sliceTokens / maxY));
        layerPoints.push({ x, y, val: sliceTokens });
      }

      const isThisLayerFocused = focusedLayerId.value === layer.id;
      const layerOpacity = isFocusing ? (isThisLayerFocused ? 1.0 : 0.12) : 0.9;
      const lineWidth = isThisLayerFocused ? 2.5 : 2.0;

      ctx.save();
      if (isThisLayerFocused) {
        // Fill area under the focused curve with rich gradient
        ctx.beginPath();
        ctx.moveTo(layerPoints[0].x, paddingTop + chartHeight);
        for (const p of layerPoints) ctx.lineTo(p.x, p.y);
        ctx.lineTo(layerPoints[layerPoints.length - 1].x, paddingTop + chartHeight);
        ctx.closePath();
        const layerGrad = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + chartHeight);
        layerGrad.addColorStop(0, colorWithAlpha(layer.color, 0.4));
        layerGrad.addColorStop(0.7, colorWithAlpha(layer.color, 0.15));
        layerGrad.addColorStop(1, colorWithAlpha(layer.color, 0.01));
        ctx.fillStyle = layerGrad;
        ctx.fill();

        ctx.shadowColor = layer.color;
        ctx.shadowBlur = 10;
      }

      // Draw Curve
      ctx.strokeStyle = colorWithAlpha(layer.color, layerOpacity);
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(layerPoints[0].x, layerPoints[0].y);
      for (let i = 1; i < layerPoints.length; i++) {
        ctx.lineTo(layerPoints[i].x, layerPoints[i].y);
      }
      ctx.stroke();

      // Draw Subagent Data Point Nodes in its own distinct color
      if (!isFocusing || isThisLayerFocused) {
        for (const p of layerPoints) {
          if (p.val > 0) {
            const isBreached = props.alertThreshold > 0 && p.val >= props.alertThreshold;

            if (isBreached) {
              // Breached Alert Beacon
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
            } else {
              ctx.fillStyle = layer.color;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
      ctx.restore();
    }
  } else {
    // 4. Standalone Nodes when no subagents exist
    for (const p of totalPoints) {
      if (p.val > 0) {
        const isBreached = props.alertThreshold > 0 && p.val >= props.alertThreshold;
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
  }

  // 5. Draw X-Axis Labels (-15m, -10m, -5m, NOW)
  ctx.fillStyle = '#71717a';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('-15m', paddingLeft, height - 3);
  ctx.fillText('-10m', paddingLeft + (chartWidth * 0.33), height - 3);
  ctx.fillText('-5m', paddingLeft + (chartWidth * 0.66), height - 3);
  ctx.fillText('NOW', width - paddingRight - 8, height - 3);

  // 6. Draw Crosshair and Hover Highlight
  if (hoverIndex.value !== null && hoverIndex.value >= 0 && hoverIndex.value < count) {
    const hIdx = hoverIndex.value;
    const hPoint = totalPoints[hIdx];

    if (hPoint) {
      // Vertical crosshair
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hPoint.x, paddingTop);
      ctx.lineTo(hPoint.x, paddingTop + chartHeight);
      ctx.stroke();

      // Glowing hover beacon ring on Total
      ctx.beginPath();
      ctx.arc(hPoint.x, hPoint.y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore();
};

const hoveredData = computed(() => {
  if (hoverIndex.value === null) return null;
  const buckets = props.history || [];
  const idx = hoverIndex.value;
  if (idx < 0 || idx >= buckets.length) return null;

  const b = buckets[idx];
  const offsetMin = buckets.length - 1 - idx;
  const timeLabel = offsetMin === 0 ? 'NOW' : `-${offsetMin}m`;

  const layers = topProcessLayers.value;
  const breakdown: { name: string; color: string; tokens: number }[] = [];

  if (layers.length > 0) {
    for (const layer of layers) {
      let tokens = 0;
      if (layer.id === 'main') {
        tokens = b.mainTokens || 0;
      } else if (layer.id === 'others') {
        const top3Ids = new Set(layers.filter(l => l.id !== 'others' && l.id !== 'main').map(l => l.id));
        if (b.subagentTokens) {
          for (const [subId, data] of Object.entries(b.subagentTokens)) {
            if (!top3Ids.has(subId)) tokens += data.tokens;
          }
        }
      } else {
        tokens = b.subagentTokens?.[layer.id]?.tokens || 0;
      }
      if (tokens > 0) {
        breakdown.push({
          name: layer.name,
          color: layer.color,
          tokens
        });
      }
    }
  }

  return {
    timeLabel,
    total: b.totalTokens,
    breakdown
  };
});

const tooltipStyle = computed(() => {
  if (!hoverCoords.value) return {};
  const { x, y } = hoverCoords.value;
  const isRight = x > 150;
  return {
    left: isRight ? `${x - 145}px` : `${x + 12}px`,
    top: `${Math.max(6, Math.min(y - 25, 75))}px`
  };
});

const handleMouseMove = (e: MouseEvent) => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const buckets = props.history || [];
  const count = buckets.length;
  if (count <= 1) return;

  const paddingLeft = 38;
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

const handleVisibilityChange = () => {
  if (typeof document !== 'undefined' && !document.hidden) {
    renderChart();
  }
};

watch(() => props.history, () => {
  if (typeof document !== 'undefined' && document.hidden) return;
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = requestAnimationFrame(renderChart);
});

onMounted(() => {
  renderChart();
  window.addEventListener('resize', renderChart);
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onBeforeUnmount(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  window.removeEventListener('resize', renderChart);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>
