<template>
  <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none font-mono text-xs">
    <TransitionGroup
      enter-active-class="transform ease-out duration-300 transition"
      enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
      enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
      leave-active-class="transition ease-in duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="[
          'pointer-events-auto flex items-start gap-2.5 p-3.5 rounded-xl shadow-xl border backdrop-blur-md transition-all',
          toast.type === 'success' ? 'bg-zinc-950/90 dark:bg-zinc-900/90 text-zinc-100 border-emerald-500/30 shadow-emerald-500/5' : '',
          toast.type === 'error' ? 'bg-zinc-950/90 dark:bg-zinc-900/90 text-zinc-100 border-red-500/30 shadow-red-500/5' : '',
          toast.type === 'warning' ? 'bg-zinc-950/90 dark:bg-zinc-900/90 text-zinc-100 border-amber-500/30 shadow-amber-500/5' : '',
          toast.type === 'info' ? 'bg-zinc-950/90 dark:bg-zinc-900/90 text-zinc-100 border-violet-500/30 shadow-violet-500/5' : ''
        ]"
      >
        <CheckCircle2 v-if="toast.type === 'success'" class="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <AlertCircle v-else-if="toast.type === 'error'" class="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
        <AlertTriangle v-else-if="toast.type === 'warning'" class="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <Info v-else class="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />

        <div class="flex-1 min-w-0">
          <div v-if="toast.title" class="font-bold text-zinc-100 text-[11px] mb-0.5">{{ toast.title }}</div>
          <div class="text-zinc-300 text-[11px] leading-relaxed">{{ toast.message }}</div>
        </div>

        <button
          @click="dismiss(toast.id)"
          class="text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition-colors cursor-pointer shrink-0"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-vue-next';
import { useToast } from '~/composables/useToast';

const { toasts, dismiss } = useToast();
</script>
