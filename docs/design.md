# Agent Token Monitor - Design Document

## 1. System Overview
Agent Token Monitor is a local, high-performance, real-time telemetry dashboard built with Nuxt 3 and Nitro. It monitors active token burn rates across multi-agent systems (Claude Code, Antigravity, Ollama, custom agents) using a 15-minute sliding window grouped by minute, and provides an immediate kill-switch to terminate runaway processes.

---

## 2. Telemetry Ingestion Architecture

### Canonical Data Contract
All agent log sources are parsed and normalized into a unified frame format:

```typescript
export interface CanonicalTelemetryFrame {
  agentId: string;
  agentName: string;
  subagentId?: string;
  subagentName?: string;
  timestamp: number; // Epoch ms
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  activePid?: number | null;
  status: 'active' | 'idle' | 'warning' | 'stopped';
}
```

### Ingestion Components
1. **Kernel File Watcher (`FSEvents` via `chokidar`):** Wakes only when physical disk writes occur.
2. **Byte-Offset Tailer:** Maintains file byte pointer; reads only appended chunks via `fs.createReadStream({ start: offset })`.
3. **Line Accumulator:** Handles split chunks across TCP/I/O buffers; buffers trailing incomplete lines until `\n`.
4. **Minute-Bucket Ring Buffer:** In-memory fixed array of 15 one-minute buckets per agent. Monotonically slides every 60s.
5. **SSE Broadcast Pipeline:** Batches frame deltas into throttled 500ms server-sent events for connected Vue clients.

---

## 3. High-Cardinality & Subagent Model

- **Hue-Family Colors:** Root agent defines base color (e.g. Purple for Claude, Cyan for Antigravity), subagents inherit progressively lighter harmonious shades.
- **Top 3 + Others Aggregation:** For swarms with 50+ subagents, the primary chart renders the Top 3 highest-burn subagents as dedicated stacked bands; remaining low-burn subagents are aggregated into an "Others" band.
- **Process Hierarchy & Granular Abort:** Tree structure mapping Parent PID $\to$ Child PIDs, allowing termination of single subagents or full session aborts.

---

## 4. UI / UX Design Specifications

- **Flex Layout:** 1, 2, 3, or 4 column grid selectable via toolbar and saved to `localStorage`.
- **Chart Visuals:** High-performance HTML5 Canvas rendering displaying minute-grouped token burn, local max peak, and a configurable horizontal alert threshold line.
- **Picture-in-Picture (PiP):** Dedicated single-agent zoom view (`/agents/:id`) with bottom-right mini sparkline overview of sibling agents.
- **Theme:** Default dark slate theme (`#09090b`) with light mode fallback.

---

## 5. Security & Kill Safety
- **PID Verification:** Before executing `kill -9 <PID>`, verifies `ps -p <PID> -o comm=` matches the configured agent `processName` to prevent PID recycling accidents.
- **Tree Termination:** Recursively terminates child PIDs via `pgrep -P <PID>` to prevent zombie swarms.
