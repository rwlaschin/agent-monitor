# Agent Token Monitor - Architecture & Implementation Plan

## 1. Core Goal & Premise
A lightweight, high-performance real-time telemetry dashboard with a **sliding window grouped by minute** to monitor live token burn across running agents (**Claude Code**, **Antigravity**, **Ollama**, custom agents), with an immediate **emergency kill-switch** to abort any agent that spikes or runs wild.

---

## 2. Key Architecture Specifications
1. **Zero-Polling File Watching:** Kernel-level `FSEvents` via `chokidar` (0% CPU when idle).
2. **Byte-Offset Tailing:** `FileTailer` reads only newly appended bytes on disk changes, recovering gracefully from log rotations or truncations.
3. **15-Minute Ring Buffer:** `SlidingWindowRingBuffer` maintains a 15-minute sliding array with 1-minute bucket resolution, subagent breakdown tracking, and local max calculation.
4. **Safety-Guarded Kill Switch:** `executeKillProcess` verifies PID command names before termination to prevent PID recycling accidents.
5. **High-Cardinality Subagents:** Top 3 highest-burn subagents rendered as stacked color bands; remaining subagents grouped into an "Others" aggregate band.
6. **1/2/3/4 Column Grid:** Layout switcher in `AppHeader` persisted in `localStorage`.
7. **Dynamic Configuration:** Agents managed dynamically via `config.json` and `/settings` (Add, Edit, Toggle Enable/Disable, Delete).

---

## 3. Test Suites & Verification
- `npm run test:unit`: Vitest suite (21/21 passing tests).
- `npm run test:watch`: Vitest watch runner.
- `npm run test:e2e`: Playwright suite against live Nuxt server.
- `npm run build`: Production build verification.
