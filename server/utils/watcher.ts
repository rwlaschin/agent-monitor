import chokidar from 'chokidar';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { AppConfig, AgentConfig, AgentTelemetrySnapshot } from '../types/telemetry';
import { SlidingWindowRingBuffer } from './ringBuffer';
import { FileTailer } from './tailer';
import { ClaudeAdapter } from './adapters/claudeAdapter';
import { AntigravityAdapter } from './adapters/antigravityAdapter';
import type { LogAdapter } from './adapters/types';
import { defaultProcessLookup } from '../api/kill';

function resolveHome(filepath: string): string {
  if (filepath.startsWith('~')) {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

export class TelemetryEngine {
  private config: AppConfig;
  private buffers: Map<string, SlidingWindowRingBuffer> = new Map();
  private tailers: Map<string, FileTailer> = new Map();
  private adapters: Map<string, LogAdapter> = new Map();
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private pids: Map<string, number | null> = new Map();
  private lastPidCheck: Map<string, number> = new Map();
  private knownProcesses: Map<string, Map<string, { id: string; name: string; pid: number | null }>> = new Map();
  private configPath: string;

  constructor(configPath: string) {
    this.configPath = configPath;
    this.config = this.loadConfig();
    this.initAgents();

    // Watch config.json for external disk updates
    if (fs.existsSync(this.configPath)) {
      try {
        fs.watch(this.configPath, async (eventType) => {
          if (eventType === 'change') {
            const reloaded = this.loadConfig();
            if (JSON.stringify(reloaded) !== JSON.stringify(this.config)) {
              this.config = reloaded;
              await this.initAgents();
            }
          }
        });
      } catch {}
    }
  }

  private registerKnownProcess(agentId: string, processId: string, name: string, pid: number | null = null): void {
    let agentMap = this.knownProcesses.get(agentId);
    if (!agentMap) {
      agentMap = new Map();
      this.knownProcesses.set(agentId, agentMap);
    }
    const existing = agentMap.get(processId);
    const isGenericFallback = !name || name === processId || name === 'Work' || name.startsWith('project-') || name.startsWith('session-');
    if (existing && existing.name && isGenericFallback) {
      agentMap.set(processId, { id: processId, name: existing.name, pid: pid || existing.pid });
    } else {
      agentMap.set(processId, { id: processId, name: name || processId, pid: pid || existing?.pid || null });
    }
  }

  private loadConfig(): AppConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch {}
    return { slidingWindowMinutes: 15, refreshIntervalMs: 500, agents: [] };
  }

  public async saveConfig(newConfig: AppConfig): Promise<void> {
    this.config = newConfig;
    fs.writeFileSync(this.configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
    await this.initAgents(); // Hot reload with clean FD teardown
  }

  public getConfig(): AppConfig {
    return this.config;
  }

  public async closeWatchers(): Promise<void> {
    const closePromises: Promise<any>[] = [];
    for (const [_, watcher] of this.watchers) {
      closePromises.push(watcher.close());
    }
    this.watchers.clear();
    await Promise.allSettled(closePromises);
  }

  public async initAgents(): Promise<void> {
    // Await closure of existing watchers to prevent EMFILE descriptor accumulation
    await this.closeWatchers();

    for (const agent of this.config.agents) {
      if (!agent.enabled) continue;

      if (!this.buffers.has(agent.id)) {
        this.buffers.set(agent.id, new SlidingWindowRingBuffer(this.config.slidingWindowMinutes || 15));
      }

      if (agent.parser === 'json-cache' || agent.parser === 'claude-stream' || agent.id === 'claude') {
        this.adapters.set(agent.id, new ClaudeAdapter());
      } else if (agent.parser === 'jsonl-stream' && agent.id === 'antigravity') {
        this.adapters.set(agent.id, new AntigravityAdapter());
      } else {
        this.adapters.set(agent.id, new JsonlAdapter());
      }

      this.bootstrapExistingFiles(agent);
      this.watchAgent(agent);
    }
  }

  private discoverAntigravityFiles(brainDir: string): string[] {
    if (!fs.existsSync(brainDir)) return [];
    const files: string[] = [];
    try {
      const conversations = fs.readdirSync(brainDir, { withFileTypes: true });
      for (const conv of conversations) {
        if (!conv.isDirectory() || conv.name.startsWith('.')) continue;
        const convDir = path.join(brainDir, conv.name);
        const tag = conv.name.slice(0, 8);
        this.registerKnownProcess('antigravity', `project-${tag}`, tag);

        const transcript1 = path.join(convDir, '.system_generated', 'logs', 'transcript.jsonl');
        const transcript2 = path.join(convDir, 'transcript.jsonl');
        if (fs.existsSync(transcript1)) {
          files.push(transcript1);
        } else if (fs.existsSync(transcript2)) {
          files.push(transcript2);
        }
      }
    } catch {}
    return files;
  }

  private discoverClaudeFiles(claudeRoot: string): string[] {
    if (!fs.existsSync(claudeRoot)) return [];
    const files: string[] = [];
    try {
      const stats = fs.statSync(claudeRoot);
      if (stats.isFile()) return [claudeRoot];

      // Check stats-cache.json
      const directStatsCache = path.join(claudeRoot, 'stats-cache.json');
      if (fs.existsSync(directStatsCache)) files.push(directStatsCache);
      const parentStatsCache = path.join(path.dirname(claudeRoot), 'stats-cache.json');
      if (fs.existsSync(parentStatsCache) && !files.includes(parentStatsCache)) files.push(parentStatsCache);

      // Check active session metadata in ~/.claude/sessions/ (as metadata lookup, NOT transcript stream)
      const sessionsDir = path.basename(claudeRoot) === 'sessions' ? claudeRoot : path.join(claudeRoot, 'sessions');
      const sessionNameToProject: Map<string, { name: string; pid: number }> = new Map();
      if (fs.existsSync(sessionsDir)) {
        try {
          const sessionEntries = fs.readdirSync(sessionsDir, { withFileTypes: true });
          for (const se of sessionEntries) {
            if (se.isFile() && se.name.endsWith('.json')) {
              const fullSessionPath = path.join(sessionsDir, se.name);
              try {
                const sData = JSON.parse(fs.readFileSync(fullSessionPath, 'utf-8'));
                const sessionTitle = sData.name || sData.title || sData.summary || sData.sessionName;
                if (sessionTitle && sData.cwd) {
                  const normalizedCwd = sData.cwd.replace(/\/+$/, '');
                  const encodedCwd = normalizedCwd.replace(/\//g, '-');
                  const cleanKey = encodedCwd.replace(/^-+/, '');
                  sessionNameToProject.set(cleanKey, { name: sessionTitle, pid: sData.pid });
                  sessionNameToProject.set(`project--${cleanKey}`, { name: sessionTitle, pid: sData.pid });
                  sessionNameToProject.set(`project-${cleanKey}`, { name: sessionTitle, pid: sData.pid });
                  const leaf = path.basename(normalizedCwd);
                  if (leaf) {
                    sessionNameToProject.set(leaf, { name: sessionTitle, pid: sData.pid });
                    sessionNameToProject.set(`project-${leaf}`, { name: sessionTitle, pid: sData.pid });
                    sessionNameToProject.set(`project--${leaf}`, { name: sessionTitle, pid: sData.pid });
                  }
                }
              } catch {}
            }
          }
        } catch {}
      }

      // Check projects/ subfolder (Single source of truth for telemetry streams)
      const projectsDir = path.basename(claudeRoot) === 'projects' ? claudeRoot : path.join(claudeRoot, 'projects');
      if (fs.existsSync(projectsDir)) {
        try {
          const projectFolders = fs.readdirSync(projectsDir, { withFileTypes: true });
          for (const pf of projectFolders) {
            const fullProj = path.join(projectsDir, pf.name);
            const raw = decodeURIComponent(pf.name);
            let clean = raw;
            if (raw.startsWith('-')) {
              const parts = raw.split('-').filter(Boolean);
              clean = parts.length > 0 ? parts[parts.length - 1] : raw;
            }
            const cleanProjectKey = raw.replace(/^-+/, '');
            const subId = `project--${cleanProjectKey}`;
            const sessionInfo = sessionNameToProject.get(cleanProjectKey) || 
                                sessionNameToProject.get(subId) || 
                                sessionNameToProject.get(clean) ||
                                sessionNameToProject.get(`project-${clean}`) ||
                                sessionNameToProject.get(`project--${clean}`);
            const finalName = sessionInfo?.name || clean;
            const finalPid = sessionInfo?.pid || null;
            this.registerKnownProcess('claude', subId, finalName, finalPid);

            if (pf.isDirectory()) {
              try {
                const subFiles = fs.readdirSync(fullProj, { withFileTypes: true });
                for (const sf of subFiles) {
                  if (sf.isFile() && (sf.name.endsWith('.jsonl') || sf.name.endsWith('.json'))) {
                    files.push(path.join(fullProj, sf.name));
                  }
                }
              } catch {}
            } else if (pf.isFile() && (pf.name.endsWith('.jsonl') || pf.name.endsWith('.json'))) {
              files.push(fullProj);
            }
          }
        } catch {}
      }

      // Check direct files in claudeRoot
      const rootEntries = fs.readdirSync(claudeRoot, { withFileTypes: true });
      for (const entry of rootEntries) {
        if (entry.isFile() && (entry.name.endsWith('.jsonl') || entry.name.endsWith('.json'))) {
          const full = path.join(claudeRoot, entry.name);
          if (!files.includes(full)) files.push(full);
        }
      }
    } catch {}
    return files;
  }

  private discoverTargetFiles(agent: AgentConfig): string[] {
    const resolvedPath = resolveHome(agent.path);
    if (!fs.existsSync(resolvedPath)) return [];

    if (agent.id === 'antigravity') {
      return this.discoverAntigravityFiles(resolvedPath);
    }
    if (agent.id === 'claude') {
      return this.discoverClaudeFiles(resolvedPath);
    }

    try {
      const stats = fs.statSync(resolvedPath);
      if (stats.isFile()) return [resolvedPath];
    } catch {}

    return [];
  }

  private bootstrapExistingFiles(agent: AgentConfig): void {
    try {
      const files = this.discoverTargetFiles(agent);
      for (const file of files) {
        this.handleFileChange(agent, file);
      }
    } catch {}
  }

  private watchAgent(agent: AgentConfig): void {
    const resolvedPath = resolveHome(agent.path);
    if (!fs.existsSync(resolvedPath)) return;

    const watcher = chokidar.watch(resolvedPath, {
      ignoreInitial: true,
      persistent: true,
      depth: 4,
      useFsEvents: true,
      disableGlobbing: true,
      ignored: (testPath: string, stats?: fs.Stats) => {
        if (!testPath) return false;
        const base = path.basename(testPath);
        if (base.startsWith('.') && base !== '.claude' && base !== '.gemini' && base !== '.system_generated') {
          return true;
        }
        if (base === 'node_modules' || base === '.git' || base === 'cache' || base === 'tmp' || base === 'dist' || base === '.nuxt' || base === '.output') {
          return true;
        }
        if (stats && stats.isFile()) {
          return !testPath.endsWith('.jsonl') && !testPath.endsWith('.json') && !testPath.endsWith('.log');
        }
        return false;
      }
    });

    watcher.on('add', (filePath) => this.handleFileChange(agent, filePath));
    watcher.on('change', (filePath) => this.handleFileChange(agent, filePath));
    watcher.on('error', () => {
      // Catch and suppress watch errors
    });

    this.watchers.set(agent.id, watcher);
  }

  private async handleFileChange(agent: AgentConfig, targetFile: string): Promise<void> {
    try {
      const stats = fs.statSync(targetFile, { throwIfNoEntry: false });
      if (!stats || stats.isDirectory()) return;

      // File type filtering
      if (agent.id === 'antigravity' && !targetFile.endsWith('transcript.jsonl')) {
        return;
      }
      if (agent.id === 'claude' && !targetFile.endsWith('.jsonl') && !targetFile.endsWith('.json')) {
        return;
      }

      // Handle dynamic session metadata updates in Claude (metadata only, no transcript tailing)
      if (agent.id === 'claude' && targetFile.includes('/sessions/') && targetFile.endsWith('.json')) {
        try {
          const sData = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
          const sessionTitle = sData.name || sData.title || sData.summary || sData.sessionName;
          if (sData.cwd) {
            const normalizedCwd = sData.cwd.replace(/\/+$/, '');
            const encodedCwd = normalizedCwd.replace(/\//g, '-');
            const cleanKey = encodedCwd.replace(/^-+/, '');
            this.registerKnownProcess('claude', `project--${cleanKey}`, sessionTitle || cleanKey, sData.pid || null);
          }
        } catch {}
        return;
      }

      let tailer = this.tailers.get(targetFile);
      if (!tailer) {
        tailer = new FileTailer(targetFile);
        this.tailers.set(targetFile, tailer);
      }

      const newChunk = await tailer.readNewBytes();
      if (!newChunk) return;

      const adapter = this.adapters.get(agent.id);
      const buffer = this.buffers.get(agent.id);

      if (adapter && buffer) {
        const frames = adapter.parseChunk(newChunk, agent, targetFile);
        for (const frame of frames) {
          if (frame.subagentId) {
            this.registerKnownProcess(agent.id, frame.subagentId, frame.subagentName || frame.subagentId);
          }
          buffer.ingest(frame);
        }
      }
    } catch {}
  }

  public async getSnapshot(): Promise<AgentTelemetrySnapshot[]> {
    const snapshots: AgentTelemetrySnapshot[] = [];
    const now = Date.now();

    for (const agent of this.config.agents) {
      if (!agent.enabled) continue;

      const buffer = this.buffers.get(agent.id);
      const history = buffer ? buffer.getHistory(now) : [];
      const currentRate = buffer ? buffer.getCurrentRate(now) : 0;
      const localMax = buffer ? buffer.getLocalMax(now) : 0;

      // Check PID asynchronously in background without stalling SSE stream (throttled to 5s)
      let pid = this.pids.get(agent.id) ?? null;
      const lastCheck = this.lastPidCheck.get(agent.id) || 0;
      if (now - lastCheck > 5000 || (currentRate > 0 && pid === null)) {
        this.lastPidCheck.set(agent.id, now);
        defaultProcessLookup(agent.processName).then(lookup => {
          if (lookup) this.pids.set(agent.id, lookup.pid);
        }).catch(() => {});
      }

      const alertThreshold = agent.alertThreshold || 15000;
      const isAlertBreached = currentRate >= alertThreshold;

      // Seed subagent volume with all known discovered processes
      const subagentVolume: Record<string, { id: string; name: string; totalTokens: number; currentRate: number; pid: number | null }> = {};
      const agentKnown = this.knownProcesses.get(agent.id);
      if (agentKnown) {
        for (const [subId, data] of agentKnown) {
          subagentVolume[subId] = {
            id: subId,
            name: data.name,
            totalTokens: 0,
            currentRate: 0,
            pid: data.pid
          };
        }
      }

      const latestBucket = history[history.length - 1];

      for (const bucket of history) {
        for (const [subId, data] of Object.entries(bucket.subagentTokens)) {
          if (!subagentVolume[subId]) {
            subagentVolume[subId] = {
              id: subId,
              name: data.name,
              totalTokens: 0,
              currentRate: 0,
              pid: null
            };
          }
          subagentVolume[subId].totalTokens += data.tokens;
        }
      }

      if (latestBucket) {
        for (const [subId, data] of Object.entries(latestBucket.subagentTokens)) {
          if (subagentVolume[subId]) {
            subagentVolume[subId].currentRate = data.tokens;
          }
        }
      }

      // Ensure human session names and PIDs from agentKnown are preserved over historical raw tokens
      if (agentKnown) {
        for (const [subId, data] of Object.entries(subagentVolume)) {
          const raw = subId.replace(/^project-+/, '');
          const leaf = raw.split('-').filter(Boolean).pop();

          const known = agentKnown.get(subId) || 
                        agentKnown.get(`project--${raw}`) || 
                        agentKnown.get(`project-${raw}`) || 
                        (leaf ? (agentKnown.get(leaf) || agentKnown.get(`project-${leaf}`) || agentKnown.get(`project--${leaf}`)) : undefined);

          if (known && known.name && known.name !== subId && known.name !== 'Work') {
            data.name = known.name;
          }
          if (known && known.pid) {
            data.pid = known.pid;
          }
        }
      }

      // Normalize and deduplicate subagents: exactly 1 entry per running process / PID
      const canonicalMap = new Map<string, { id: string; name: string; totalTokens: number; currentRate: number; pid: number | null }>();

      for (const [subId, data] of Object.entries(subagentVolume)) {
        // Exclude internal session UUID files
        if (subId.startsWith('session-')) {
          continue;
        }

        // Canonical ID normalization e.g. project--Users-mac-Documents-Work
        let canonicalKey = subId;
        if (subId.startsWith('project-')) {
          const raw = subId.replace(/^project-+/, '');
          canonicalKey = `project--${raw}`;
        }

        // Find existing record either by identical non-null PID or matching canonical key
        let existing: { id: string; name: string; totalTokens: number; currentRate: number; pid: number | null } | undefined;
        if (data.pid) {
          for (const item of canonicalMap.values()) {
            if (item.pid === data.pid) {
              existing = item;
              break;
            }
          }
        }
        if (!existing) {
          existing = canonicalMap.get(canonicalKey);
        }

        if (!existing) {
          canonicalMap.set(canonicalKey, {
            id: canonicalKey,
            name: data.name,
            totalTokens: data.totalTokens,
            currentRate: data.currentRate,
            pid: data.pid
          });
        } else {
          existing.totalTokens += data.totalTokens;
          existing.currentRate += data.currentRate;

          // Pick the more descriptive and specific title
          const isExistingGeneric = !existing.name || existing.name === existing.id || existing.name === 'Work' || existing.name === 'mac' || existing.name.startsWith('project-');
          const isDataBetter = data.name && data.name !== data.id && (isExistingGeneric || data.name.length > existing.name.length);
          if (isDataBetter) {
            existing.name = data.name;
          }

          // Prefer the deeper/more specific workspace path ID
          if (canonicalKey.length > existing.id.length) {
            canonicalMap.delete(existing.id);
            existing.id = canonicalKey;
            canonicalMap.set(canonicalKey, existing);
          }

          if (data.pid && !existing.pid) {
            existing.pid = data.pid;
          }
        }
      }

      const PROCESS_PALETTE = ['#ec4899', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4', '#3b82f6', '#f97316', '#14b8a6', '#e11d48'];
      const sortedSubs = Array.from(canonicalMap.values())
        .filter(sub => sub.pid !== null || sub.currentRate > 0)
        .sort((a, b) => b.totalTokens - a.totalTokens)
        .map((sub, idx) => ({
          id: sub.id,
          name: sub.name,
          color: PROCESS_PALETTE[idx % PROCESS_PALETTE.length],
          currentRate: sub.currentRate,
          totalTokens: sub.totalTokens,
          pid: sub.pid
        }));

      // Calculate total 24h tokens (sum of historical buckets)
      const totalTokens24h = history.reduce((sum, b) => sum + b.totalTokens, 0);

      // Determine status
      let status: 'active' | 'idle' | 'stopped' = 'stopped';
      if (pid !== null) {
        status = currentRate > 0 ? 'active' : 'idle';
      }

      snapshots.push({
        agentId: agent.id,
        agentName: agent.name,
        color: agent.color,
        status,
        activePid: pid,
        currentRate,
        localMax,
        totalTokens24h,
        alertThreshold,
        isAlertBreached,
        history,
        subagents: sortedSubs
      });
    }

    return snapshots;
  }
}

// Global Singleton for Nitro
let globalEngine: TelemetryEngine | null = null;

export function getTelemetryEngine(): TelemetryEngine {
  if (!globalEngine) {
    const configPath = path.resolve(process.cwd(), 'config.json');
    globalEngine = new TelemetryEngine(configPath);
  }
  return globalEngine;
}
