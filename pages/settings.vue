<template>
  <div class="max-w-4xl mx-auto font-mono text-xs">
    <!-- Breadcrumb Nav -->
    <BreadcrumbNav :items="[{ label: 'Configuration' }]" />

    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-base font-bold text-zinc-900 dark:text-zinc-100">Agent Configuration & Stream Health</h1>
        <p class="text-zinc-500 text-[11px]">Inspect monitored stream directories, validate file locations, and update telemetry engine parameters.</p>
      </div>

      <button 
        @click="openAddModal"
        class="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
      >
        <Plus class="w-3.5 h-3.5" />
        <span>Add Agent</span>
      </button>
    </div>

    <!-- Agent List -->
    <div class="space-y-4 mb-8">
      <div 
        v-for="(agent, idx) in agents" 
        :key="agent.id"
        class="p-4 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all"
      >
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div class="flex items-start space-x-3">
            <span class="w-3.5 h-3.5 rounded-full mt-0.5 shrink-0 shadow-sm" :style="{ backgroundColor: agent.color }"></span>
            <div>
              <div class="flex items-center space-x-2">
                <span class="font-bold text-sm text-zinc-900 dark:text-zinc-100">{{ agent.name }}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  {{ agent.parser }}
                </span>
                <!-- Live Path Health Badge -->
                <span 
                  v-if="pathStatuses[agent.id]"
                  :class="[
                    'text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1',
                    pathStatuses[agent.id].exists && pathStatuses[agent.id].fileCount > 0
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : pathStatuses[agent.id].exists
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                  ]"
                >
                  <span 
                    :class="[
                      'w-1.5 h-1.5 rounded-full',
                      pathStatuses[agent.id].exists && pathStatuses[agent.id].fileCount > 0
                        ? 'bg-emerald-500'
                        : pathStatuses[agent.id].exists
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                    ]"
                  ></span>
                  {{ 
                    pathStatuses[agent.id].exists && pathStatuses[agent.id].fileCount > 0
                      ? `Verified (${pathStatuses[agent.id].fileCount} active streams)`
                      : pathStatuses[agent.id].exists
                        ? 'No active streams detected'
                        : 'Path missing'
                  }}
                </span>
              </div>
              <span class="text-zinc-500 block truncate max-w-md text-[11px] mt-0.5 font-mono">{{ agent.path }}</span>
              <span class="text-zinc-400 text-[10px]">Process: "{{ agent.processName }}" | Alert: {{ ((agent.alertThreshold || 15000) / 1000).toFixed(0) }}k tok/m</span>
            </div>
          </div>

          <div class="flex items-center space-x-1.5 shrink-0 self-end sm:self-center">
            <!-- Move Up / Down Reorder Buttons -->
            <div class="flex items-center space-x-0.5 mr-2 bg-zinc-100 dark:bg-zinc-900 rounded-lg p-0.5 border border-zinc-200 dark:border-zinc-800">
              <button 
                @click="moveAgent(idx, -1)"
                :disabled="idx === 0"
                class="p-1 rounded text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-20 disabled:hover:text-zinc-400 transition-colors cursor-pointer disabled:cursor-not-allowed"
                title="Move Up"
              >
                <ChevronUp class="w-3.5 h-3.5" />
              </button>
              <button 
                @click="moveAgent(idx, 1)"
                :disabled="idx === agents.length - 1"
                class="p-1 rounded text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-20 disabled:hover:text-zinc-400 transition-colors cursor-pointer disabled:cursor-not-allowed"
                title="Move Down"
              >
                <ChevronDown class="w-3.5 h-3.5" />
              </button>
            </div>

            <!-- Toggle Enabled Switch -->
            <button 
              @click="toggleAgent(idx)"
              :class="[
                'px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer',
                agent.enabled 
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
              ]"
            >
              {{ agent.enabled ? 'Enabled' : 'Disabled' }}
            </button>

            <!-- Edit Agent Button -->
            <button 
              @click="openEditModal(idx)"
              class="p-1.5 text-zinc-400 hover:text-violet-500 transition-colors cursor-pointer"
              title="Edit Agent"
            >
              <Pencil class="w-3.5 h-3.5" />
            </button>

            <button 
              @click="deleteAgent(idx)"
              class="p-1.5 text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
              title="Delete Agent"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- Discovered Streams & Validation Details Accordion -->
        <div class="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/60 flex flex-col gap-1.5">
          <div class="flex items-center justify-between text-[10px] text-zinc-400">
            <span class="flex items-center gap-1">
              <FolderTree class="w-3 h-3 text-zinc-500" />
              <span>Discovery Structure:</span>
              <span class="text-zinc-300 font-bold">{{ getDiscoveryPattern(agent) }}</span>
            </span>
            <button 
              @click="validateAgentPath(agent)" 
              class="text-violet-500 hover:text-violet-400 flex items-center gap-1 font-semibold cursor-pointer"
            >
              <RefreshCw :class="['w-3 h-3', validatingPaths[agent.id] ? 'animate-spin' : '']" />
              <span>Validate Path</span>
            </button>
          </div>

          <!-- Sample Discovered Files Preview -->
          <div v-if="pathStatuses[agent.id]?.sampleFiles?.length" class="bg-zinc-50 dark:bg-zinc-900/60 p-2 rounded text-[10px] text-zinc-400">
            <span class="text-zinc-500 font-semibold block mb-1">Active Discovered Files ({{ pathStatuses[agent.id].fileCount }} total):</span>
            <div class="space-y-0.5 truncate">
              <div v-for="sf in pathStatuses[agent.id].sampleFiles" :key="sf" class="truncate text-zinc-300">
                • {{ sf }}
              </div>
            </div>
          </div>
          
          <!-- Warning banner if path missing or empty -->
          <div v-else-if="pathStatuses[agent.id]?.error" class="bg-red-500/10 border border-red-500/20 p-2 rounded text-[10px] text-red-400 flex items-center gap-1.5">
            <AlertTriangle class="w-3.5 h-3.5 shrink-0" />
            <span>{{ pathStatuses[agent.id].error }}</span>
          </div>
          <div v-else-if="pathStatuses[agent.id]?.warning" class="bg-amber-500/10 border border-amber-500/20 p-2 rounded text-[10px] text-amber-400 flex items-center gap-1.5">
            <AlertTriangle class="w-3.5 h-3.5 shrink-0" />
            <span>{{ pathStatuses[agent.id].warning }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Global Sliding Window Settings -->
    <div class="p-4 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 mb-6">
      <h2 class="font-bold text-sm text-zinc-900 dark:text-zinc-100 mb-3">Sliding Window Parameters</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-zinc-500 mb-1">Window Duration (Minutes)</label>
          <input 
            v-model.number="slidingWindowMinutes" 
            type="number" 
            min="5" 
            max="60"
            class="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-zinc-900 dark:text-zinc-100"
          />
        </div>
        <div>
          <label class="block text-zinc-500 mb-1">Broadcast Interval (Milliseconds)</label>
          <input 
            v-model.number="refreshIntervalMs" 
            type="number" 
            min="200" 
            max="2000"
            step="100"
            class="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-zinc-900 dark:text-zinc-100"
          />
        </div>
      </div>
    </div>

    <!-- Save Button -->
    <div class="flex justify-end">
      <button 
        @click="saveAll"
        class="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-lg shadow-md transition-colors cursor-pointer"
      >
        Save & Apply Configuration
      </button>
    </div>

    <!-- Add / Edit Agent Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl font-mono">
        <h2 class="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-4">
          {{ editingIndex !== null ? 'Edit Monitored Agent' : 'Add Monitored Agent' }}
        </h2>

        <!-- Agent Template Dropdown -->
        <div class="mb-3">
          <label class="block text-zinc-500 mb-1 font-semibold">Agent Template / Preset (Dropdown)</label>
          <div class="relative flex items-center">
            <select
              v-model="selectedTemplateId"
              @change="onTemplateDropdownChange"
              class="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-3 pr-10 py-2.5 text-zinc-900 dark:text-zinc-100 font-medium appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            >
              <option :value="null">-- Select a Template Preset or Enter Custom --</option>
              <option v-for="tmpl in agentTemplates" :key="tmpl.id" :value="tmpl.id">
                {{ tmpl.name }} ({{ tmpl.parser }})
              </option>
            </select>
            <ChevronDown class="w-4 h-4 text-zinc-400 dark:text-zinc-500 absolute right-3 pointer-events-none" />
          </div>
        </div>

        <div class="space-y-3 mb-6">
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-zinc-500">Agent Display Name</label>
              <span class="text-[10px] text-zinc-400">e.g. CodeGPT 1, CodeGPT (Personal)</span>
            </div>
            <input 
              v-model="newAgent.name" 
              placeholder="e.g. CodeGPT - Work" 
              class="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-zinc-900 dark:text-zinc-100" 
            />
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-zinc-500">Log Directory or File Path</label>
              <span v-if="isValidatingModal" class="text-[10px] text-violet-400 flex items-center gap-1">
                <RefreshCw class="w-3 h-3 animate-spin" />
                <span>Checking...</span>
              </span>
            </div>
            <input 
              v-model="newAgent.path" 
              @input="onModalPathChange"
              placeholder="e.g. ~/.codegpt/ or ~/.claude/ or custom path" 
              class="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-zinc-900 dark:text-zinc-100 font-mono" 
            />

            <!-- Real-Time Modal Validation Banner -->
            <div v-if="modalValidationResult" class="mt-2 text-[10px]">
              <div 
                v-if="modalValidationResult.valid && modalValidationResult.fileCount > 0"
                class="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded text-emerald-500 flex items-start gap-1.5"
              >
                <CheckCircle2 class="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div class="truncate">
                  <span class="font-bold">Verified Path:</span> {{ modalValidationResult.fileCount }} active stream file(s) found.
                  <div class="text-[9px] text-emerald-400/80 mt-0.5 truncate">
                    Files: {{ modalValidationResult.sampleFiles?.slice(0, 3).join(', ') }}
                  </div>
                </div>
              </div>
              <div 
                v-else-if="modalValidationResult.exists && modalValidationResult.fileCount === 0"
                class="bg-amber-500/10 border border-amber-500/20 p-2 rounded text-amber-500 flex items-start gap-1.5"
              >
                <AlertTriangle class="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>
                  <span class="font-bold">Directory exists</span>, but no active log files detected yet.
                </div>
              </div>
              <div 
                v-else
                class="bg-red-500/10 border border-red-500/20 p-2 rounded text-red-400 flex items-start gap-1.5"
              >
                <XCircle class="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>
                  <span class="font-bold">Path Error:</span> {{ modalValidationResult.error || 'Directory does not exist.' }}
                </div>
              </div>
            </div>
          </div>

          <!-- Status Page / Health Check URL -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-zinc-500">Upstream Status Page / Health Check URL</label>
              <span class="text-[10px] text-zinc-400">e.g. https://status.claude.com/ or https://status.openai.com/</span>
            </div>
            <input 
              v-model="newAgent.statusUrl" 
              placeholder="e.g. https://status.claude.com or https://status.openai.com or http://localhost:11434" 
              class="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-zinc-900 dark:text-zinc-100 font-mono text-[11px]" 
            />
          </div>

          <!-- Parser & Process Row -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block text-zinc-500">Log Parser Format</label>
                <span v-if="modalValidationResult?.detectedParserLabel" class="text-[9px] text-violet-400 font-semibold bg-violet-500/10 px-1 py-0.5 rounded border border-violet-500/20">
                  Auto: {{ modalValidationResult.detectedParserLabel }}
                </span>
              </div>
              <div class="relative flex items-center">
                <select 
                  v-model="newAgent.parser" 
                  @change="isParserTouched = true"
                  class="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-3 pr-10 py-2.5 text-zinc-900 dark:text-zinc-100 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                >
                  <option value="sqlite-db">SQLite Database (CodeGPT / .db / .sqlite)</option>
                  <option value="claude-stream">Claude Code Stream (Projects & Sessions)</option>
                  <option value="jsonl-stream">JSONL Stream (Line-delimited JSON)</option>
                  <option value="json-cache">JSON Cache (Single stat JSON file)</option>
                  <option value="regex-log">Plain Text Log</option>
                </select>
                <ChevronDown class="w-4 h-4 text-zinc-400 dark:text-zinc-500 absolute right-3 pointer-events-none" />
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block text-zinc-500">OS Process (Kill Switch)</label>
                <span class="text-[9px] text-emerald-400 font-semibold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/20">
                  {{ newAgent.processName || inferredProcessName }}
                </span>
              </div>
              <input 
                v-model="newAgent.processName" 
                list="running-process-list"
                :placeholder="'Auto: ' + inferredProcessName" 
                class="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500" 
              />
              <datalist id="running-process-list">
                <option v-for="p in runningProcesses" :key="p.name" :value="p.name" />
              </datalist>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block text-zinc-500">Color Accent</label>
                <button 
                  type="button" 
                  @click="randomizeColor"
                  class="text-[10px] text-violet-500 hover:text-violet-400 flex items-center gap-1 font-semibold cursor-pointer"
                  title="Generate a random distinct color"
                >
                  <Sparkles class="w-3 h-3" />
                  <span>Randomize</span>
                </button>
              </div>
              <div class="flex items-center gap-2 relative">
                <!-- Color Swatch Button & HsvColorWheel Popover -->
                <div class="relative">
                  <button 
                    type="button"
                    @click="isEditingColor = !isEditingColor"
                    class="w-9 h-9 rounded-lg border border-black/20 dark:border-white/20 shadow-sm shrink-0 hover:scale-105 transition-transform cursor-pointer block"
                    :style="{ backgroundColor: newAgent.color }"
                    title="Click to open Color Wheel"
                  ></button>

                  <!-- Floating HSV Color Wheel Popover -->
                  <div 
                    v-if="isEditingColor" 
                    draggable="false"
                    @dragstart.stop.prevent
                    @mousedown.stop
                    @pointerdown.stop
                    class="absolute left-0 bottom-full mb-2 w-48 p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-2xl backdrop-blur-xl z-50 text-xs font-mono flex flex-col items-center select-none"
                  >
                    <div class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800/80 pb-1.5 mb-2.5 w-full">
                      <span class="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1">
                        <Palette class="w-3.5 h-3.5 text-violet-500" />
                        Color Wheel
                      </span>
                      <button type="button" @click="isEditingColor = false" class="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer">✕</button>
                    </div>

                    <!-- Circular HSL Color Disc with 5px White Selector Dot -->
                    <div class="mb-1">
                      <HsvColorWheel 
                        :model-value="newAgent.color"
                        :size="140"
                        @change="color => newAgent.color = color"
                      />
                    </div>
                  </div>
                </div>

                <!-- Uppercase Hex Text Input -->
                <input 
                  v-model="newAgent.color" 
                  type="text" 
                  placeholder="#000000"
                  class="w-full h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 text-zinc-900 dark:text-zinc-100 font-mono text-xs uppercase" 
                />
              </div>
            </div>
            <div>
              <label class="block text-zinc-500 mb-1">Alert Threshold (tok/min)</label>
              <input v-model.number="newAgent.alertThreshold" type="number" step="1000" class="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-zinc-900 dark:text-zinc-100 h-9" />
            </div>
          </div>
        </div>

        <div class="flex justify-end space-x-2">
          <button @click="showModal = false" class="px-4 py-2 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 rounded-lg font-medium cursor-pointer">Cancel</button>
          <button @click="confirmAddAgent" class="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-lg cursor-pointer">
            {{ editingIndex !== null ? 'Save Changes' : 'Add Agent' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, computed } from 'vue';
import { Plus, Trash2, ChevronUp, ChevronDown, Pencil, CheckCircle2, AlertTriangle, XCircle, RefreshCw, FolderTree, Sparkles, Palette } from 'lucide-vue-next';
import { useTelemetryStore } from '~/stores/telemetryStore';
import { useToast } from '~/composables/useToast';
import type { AgentConfig, ParserType } from '~/server/types/telemetry';
import BreadcrumbNav from '~/components/BreadcrumbNav.vue';
import HsvColorWheel from '~/components/HsvColorWheel.vue';

const store = useTelemetryStore();
const toast = useToast();
const isEditingColor = ref(false);

const VIBRANT_PALETTE = [
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#f97316', // Orange
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#3b82f6', // Blue
  '#eab308', // Amber / Yellow
  '#14b8a6', // Teal
  '#a855f7', // Purple
  '#f43f5e', // Rose
  '#6366f1', // Indigo
  '#84cc16'  // Lime
];

function getRandomColor(): string {
  const used = new Set(agents.value.map(a => (a.color || '').toLowerCase()));
  const available = VIBRANT_PALETTE.filter(c => !used.has(c.toLowerCase()));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  return VIBRANT_PALETTE[Math.floor(Math.random() * VIBRANT_PALETTE.length)];
}

function randomizeColor() {
  newAgent.value.color = getRandomColor();
}

const agents = ref<AgentConfig[]>([]);
const slidingWindowMinutes = ref(15);
const refreshIntervalMs = ref(500);

const showModal = ref(false);
const editingIndex = ref<number | null>(null);

const validatingPaths = reactive<Record<string, boolean>>({});
const pathStatuses = reactive<Record<string, { exists: boolean; fileCount: number; sampleFiles?: string[]; error?: string; warning?: string }>>({});

const isValidatingModal = ref(false);
const modalValidationResult = ref<{ valid: boolean; exists: boolean; fileCount: number; sampleFiles?: string[]; error?: string; warning?: string } | null>(null);

const runningProcesses = ref<{ pid: number; name: string }[]>([]);
const isProcessNameTouched = ref(false);
const isParserTouched = ref(false);

const selectedTemplateId = ref<string | null>(null);
const defaultFallbackTemplates = [
  { id: 'claude', name: 'Claude Code', path: '~/.claude/', parser: 'claude-stream', processName: 'claude', color: '#ec4899', alertThreshold: 10000, statusUrl: 'https://status.claude.com' },
  { id: 'codegpt', name: 'CodeGPT', path: '~/.codegpt/', parser: 'sqlite-db', processName: 'codegpt', color: '#10b981', alertThreshold: 15000, statusUrl: 'https://status.openai.com' },
  { id: 'antigravity', name: 'Antigravity', path: '~/.gemini/antigravity/brain/', parser: 'jsonl-stream', processName: 'antigravity', color: '#06b6d4', alertThreshold: 10000, statusUrl: 'https://status.cloud.google.com' },
  { id: 'ollama', name: 'Ollama', path: '~/.ollama/logs/server.log', parser: 'regex-log', processName: 'ollama', color: '#10b981', alertThreshold: 10000, statusUrl: 'http://localhost:11434' }
];

const agentTemplates = ref<any[]>(defaultFallbackTemplates);

async function fetchTemplates() {
  try {
    if (typeof $fetch !== 'undefined') {
      const res = await $fetch<{ templates: any[] }>('/api/templates');
      if (res?.templates && Array.isArray(res.templates)) {
        agentTemplates.value = res.templates;
      }
    }
  } catch {}
}

function onTemplateDropdownChange() {
  const tmpl = agentTemplates.value.find(t => t.id === selectedTemplateId.value);
  if (!tmpl) return;
  if (!newAgent.value.name || agentTemplates.value.some(t => t.name === newAgent.value.name)) {
    newAgent.value.name = tmpl.name;
  }
  newAgent.value.path = tmpl.path;
  newAgent.value.parser = tmpl.parser;
  newAgent.value.processName = tmpl.processName;
  newAgent.value.color = tmpl.color;
  newAgent.value.statusUrl = tmpl.statusUrl || '';
  isParserTouched.value = true;
  isProcessNameTouched.value = true;
  validateModalPath();
}

const newAgent = ref<{
  name: string;
  path: string;
  parser: ParserType;
  processName: string;
  color: string;
  alertThreshold: number;
  statusUrl: string;
}>({
  name: '',
  path: '',
  parser: 'jsonl-stream',
  processName: '',
  color: '#f97316',
  alertThreshold: 15000,
  statusUrl: ''
});

const inferredProcessName = computed(() => {
  if (!newAgent.value.name) return 'auto';
  return newAgent.value.name.toLowerCase().replace(/[^a-z0-9]/g, '');
});

const suggestedProcesses = computed(() => {
  const query = (newAgent.value.name || '').toLowerCase().trim();
  const list = runningProcesses.value;
  if (!query) {
    return list.slice(0, 5);
  }
  const filtered = list.filter(p => p.name.toLowerCase().includes(query) || query.includes(p.name.toLowerCase()));
  return filtered.length > 0 ? filtered.slice(0, 6) : list.slice(0, 5);
});

async function fetchRunningProcesses() {
  try {
    const res = await $fetch<{ processes: { pid: number; name: string }[] }>('/api/processes');
    if (res?.processes) {
      runningProcesses.value = res.processes;
    }
  } catch {}
}

function onNameChange() {
  if (!isProcessNameTouched.value) {
    newAgent.value.processName = newAgent.value.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
}

function getDiscoveryPattern(agent: AgentConfig): string {
  if (agent.id === 'claude' || agent.parser === 'claude-stream') {
    return 'projects/*/*.jsonl + sessions/*.json + stats-cache.json';
  }
  if (agent.id === 'antigravity') {
    return 'brain/*/.system_generated/logs/transcript.jsonl';
  }
  if (agent.path.endsWith('.log') || agent.path.endsWith('.json')) {
    return 'Direct file tail';
  }
  return '*.jsonl, *.log, *.json';
}

async function validatePathOnServer(targetPath: string, agentId?: string, parser?: string) {
  try {
    const res = await $fetch<{ valid: boolean; exists: boolean; isDirectory?: boolean; fileCount: number; sampleFiles?: string[]; error?: string; warning?: string }>('/api/validate-path', {
      method: 'POST',
      body: { path: targetPath, agentId, parser }
    });
    return res;
  } catch (err: any) {
    return {
      valid: false,
      exists: false,
      fileCount: 0,
      error: err?.message || 'Connection failed'
    };
  }
}

async function validateAgentPath(agent: AgentConfig) {
  validatingPaths[agent.id] = true;
  const res = await validatePathOnServer(agent.path, agent.id, agent.parser);
  pathStatuses[agent.id] = {
    exists: res.exists,
    fileCount: res.fileCount,
    sampleFiles: res.sampleFiles,
    error: res.error,
    warning: res.warning
  };
  validatingPaths[agent.id] = false;
}

async function validateAllAgentPaths() {
  for (const agent of agents.value) {
    validateAgentPath(agent);
  }
}

async function validateModalPath() {
  if (!newAgent.value.path) return;
  isValidatingModal.value = true;
  const res = await validatePathOnServer(newAgent.value.path, undefined, newAgent.value.parser);
  modalValidationResult.value = res;
  if (res && res.detectedParser && !isParserTouched.value) {
    newAgent.value.parser = res.detectedParser as ParserType;
  }
  isValidatingModal.value = false;
}

function onModalPathChange() {
  if (validationDebounceTimer) clearTimeout(validationDebounceTimer);
  validationDebounceTimer = setTimeout(() => {
    validateModalPath();
  }, 400);
}

onMounted(async () => {
  await fetchTemplates();
  await store.fetchConfig();
  if (store.config) {
    agents.value = JSON.parse(JSON.stringify(store.config.agents));
    slidingWindowMinutes.value = store.config.slidingWindowMinutes || 15;
    refreshIntervalMs.value = store.config.refreshIntervalMs || 500;
    validateAllAgentPaths();
  }
});

const moveAgent = (idx: number, delta: number) => {
  const targetIdx = idx + delta;
  if (targetIdx < 0 || targetIdx >= agents.value.length) return;
  const [removed] = agents.value.splice(idx, 1);
  agents.value.splice(targetIdx, 0, removed);
};

const toggleAgent = (idx: number) => {
  agents.value[idx].enabled = !agents.value[idx].enabled;
};

const deleteAgent = (idx: number) => {
  const [removed] = agents.value.splice(idx, 1);
  if (removed) {
    store.cleanRemovedAgentFromOrder(removed.id);
  }
};

const openAddModal = () => {
  editingIndex.value = null;
  selectedTemplateId.value = null;
  modalValidationResult.value = null;
  isProcessNameTouched.value = false;
  isParserTouched.value = false;
  isEditingColor.value = false;
  newAgent.value = {
    name: '',
    path: '',
    parser: 'sqlite-db',
    processName: '',
    color: getRandomColor(),
    alertThreshold: 15000,
    statusUrl: ''
  };
  showModal.value = true;
  fetchRunningProcesses();
};

const openEditModal = (idx: number) => {
  editingIndex.value = idx;
  selectedTemplateId.value = null;
  isEditingColor.value = false;
  const target = agents.value[idx];
  modalValidationResult.value = null;
  isProcessNameTouched.value = true;
  isParserTouched.value = true;
  newAgent.value = {
    name: target.name,
    path: target.path,
    parser: target.parser,
    processName: target.processName,
    color: target.color,
    alertThreshold: target.alertThreshold || 15000,
    statusUrl: target.statusUrl || ''
  };
  showModal.value = true;
  validateModalPath();
  fetchRunningProcesses();
};

const confirmAddAgent = () => {
  if (!newAgent.value.name || !newAgent.value.path) {
    toast.warning('Please provide an Agent Name and Log Path.', 'Missing Information');
    return;
  }

  if (editingIndex.value !== null) {
    // Update existing agent
    const current = agents.value[editingIndex.value];
    current.name = newAgent.value.name;
    current.path = newAgent.value.path;
    current.parser = newAgent.value.parser;
    current.processName = newAgent.value.processName || current.id;
    current.color = newAgent.value.color;
    current.alertThreshold = newAgent.value.alertThreshold;
    current.statusUrl = newAgent.value.statusUrl || undefined;
    validateAgentPath(current);
    toast.success(`Agent "${current.name}" updated successfully!`, 'Agent Saved');
  } else {
    // Add new agent
    const id = newAgent.value.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const added: AgentConfig = {
      id,
      name: newAgent.value.name,
      enabled: true,
      parser: newAgent.value.parser,
      path: newAgent.value.path,
      processName: newAgent.value.processName || id,
      color: newAgent.value.color,
      alertThreshold: newAgent.value.alertThreshold,
      statusUrl: newAgent.value.statusUrl || undefined
    };
    agents.value.push(added);
    validateAgentPath(added);
    toast.success(`Agent "${added.name}" added to configuration!`, 'Agent Created');
  }

  showModal.value = false;
};

const saveAll = async () => {
  await store.saveConfig({
    slidingWindowMinutes: slidingWindowMinutes.value,
    refreshIntervalMs: refreshIntervalMs.value,
    agents: agents.value
  });
  toast.success('Configuration saved and telemetry engine reloaded!', 'Settings Applied');
  validateAllAgentPaths();
};
</script>

