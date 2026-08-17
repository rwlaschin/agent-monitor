<template>
  <div class="flex flex-col items-center select-none font-mono">
    <!-- HSL Wheel: White (center) -> Color (mid) -> Black (edge) -->
    <div 
      ref="wheelContainerRef"
      draggable="false"
      @dragstart.stop.prevent
      @pointerdown.stop="handlePointerDown"
      @pointermove.stop="handlePointerMove"
      @pointerup.stop="handlePointerUp"
      @pointercancel.stop="handlePointerUp"
      class="relative cursor-crosshair rounded-full shadow-2xl border border-zinc-300 dark:border-zinc-700 select-none overflow-hidden touch-none"
      :style="{
        width: `${size}px`,
        height: `${size}px`
      }"
    >
      <canvas 
        ref="canvasRef" 
        :width="size" 
        :height="size"
        class="w-full h-full block pointer-events-none"
      ></canvas>

      <!-- 5px Radius / 10px Diameter White Selector Dot -->
      <div 
        class="absolute pointer-events-none rounded-full bg-white -translate-x-1/2 -translate-y-1/2"
        :style="{
          left: `${selectorPos.x}px`,
          top: `${selectorPos.y}px`,
          width: '10px',
          height: '10px',
          boxShadow: '0 0 0 1.5px rgba(0,0,0,0.8), 0 2px 6px rgba(0,0,0,0.9)'
        }"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue';

const props = withDefaults(defineProps<{
  modelValue: string;
  size?: number;
}>(), {
  size: 160
});

const emit = defineEmits<{
  (e: 'update:modelValue', color: string): void;
  (e: 'change', color: string): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const wheelContainerRef = ref<HTMLDivElement | null>(null);
const isDragging = ref(false);

const selectorPos = ref<{ x: number; y: number }>({
  x: props.size / 2,
  y: props.size / 2
});

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = (hex || '').replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  const num = parseInt(clean || '000000', 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return { h: (h + 360) % 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
  else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
  else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
  else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
  else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
  else if (h >= 300 && h < 360) { r = c; g = 0; b = x; }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(x => Math.min(255, Math.max(0, x)).toString(16).padStart(2, '0')).join('')}`;
}

function renderHslWheel() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const radius = w / 2;
  const cx = radius;
  const cy = radius;

  const imgData = ctx.createImageData(w, h);
  const data = imgData.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * w + x) * 4;

      if (dist <= radius) {
        const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        const ratio = Math.min(dist / radius, 1.0);
        
        // Lightness: 1.0 (white at center) -> 0.5 (full color at mid) -> 0.0 (black at edge)
        const l = Math.max(0, Math.min(1.0, 1.0 - ratio));
        const s = ratio === 0 ? 0 : 1.0;

        const rgb = hslToRgb(angle, s, l);
        data[idx] = rgb.r;
        data[idx + 1] = rgb.g;
        data[idx + 2] = rgb.b;
        data[idx + 3] = 255;
      } else {
        data[idx + 3] = 0;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

function updateSelectorFromHex(hex: string) {
  if (isDragging.value || !hex) return;
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  const radius = props.size / 2;
  const angleRad = (hsl.h * Math.PI) / 180;
  
  // Ratio from center: 0 (white, l=1) -> 0.5 (color, l=0.5) -> 1.0 (black, l=0)
  const ratio = Math.max(0, Math.min(1.0, 1.0 - hsl.l));
  const dist = ratio * (radius - 3);

  selectorPos.value = {
    x: radius + dist * Math.cos(angleRad),
    y: radius + dist * Math.sin(angleRad)
  };
}

function sampleColorAt(clientX: number, clientY: number) {
  const container = wheelContainerRef.value;
  if (!container) return;

  const rect = container.getBoundingClientRect();
  const radius = props.size / 2;
  let dx = clientX - (rect.left + radius);
  let dy = clientY - (rect.top + radius);
  let dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > radius - 2) {
    const angle = Math.atan2(dy, dx);
    dist = radius - 2;
    dx = Math.cos(angle) * dist;
    dy = Math.sin(angle) * dist;
  }

  selectorPos.value = {
    x: radius + dx,
    y: radius + dy
  };

  const angleDeg = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  const ratio = Math.min(1.0, dist / (radius - 2));

  // Lightness: 1.0 at center (white) -> 0.5 at midpoint (color) -> 0.0 at edge (black)
  const l = Math.max(0, Math.min(1.0, 1.0 - ratio));
  const s = ratio === 0 ? 0 : 1.0;

  const rgb = hslToRgb(angleDeg, s, l);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

  emit('update:modelValue', hex);
  emit('change', hex);
}

function handlePointerDown(e: PointerEvent) {
  const target = e.currentTarget as HTMLElement | null;
  if (target && target.setPointerCapture) {
    try {
      target.setPointerCapture(e.pointerId);
    } catch {}
  }
  isDragging.value = true;
  sampleColorAt(e.clientX, e.clientY);
}

function handlePointerMove(e: PointerEvent) {
  if (!isDragging.value) return;
  sampleColorAt(e.clientX, e.clientY);
}

function handlePointerUp(e: PointerEvent) {
  if (!isDragging.value) return;
  isDragging.value = false;
  const target = e.currentTarget as HTMLElement | null;
  if (target && target.releasePointerCapture) {
    try {
      target.releasePointerCapture(e.pointerId);
    } catch {}
  }
}

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    updateSelectorFromHex(newVal);
  }
});

onMounted(() => {
  nextTick(() => {
    renderHslWheel();
    if (props.modelValue) {
      updateSelectorFromHex(props.modelValue);
    }
  });
});
</script>
