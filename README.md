# Agent Token Monitor

> **Real-Time Telemetry Dashboard & Emergency Kill Switch for Multi-Agent LLM Swarms**  
> Built for **Claude Code**, **Google Antigravity**, **Ollama**, and custom autonomous AI coding agent workflows.

[![Nuxt 3](https://img.shields.io/badge/Nuxt-3-00DC82?style=flat-square&logo=nuxt.js&logoColor=white)](https://nuxt.com/)
[![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?style=flat-square&logo=vue.js&logoColor=white)](https://vuejs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Vitest](https://img.shields.io/badge/Vitest-Tested-6E9F18?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

---

## ⚡ Overview

**Agent Token Monitor** provides low-latency observability, live token burn velocity tracking, and an emergency kill switch for local and remote LLM agents running on your machine.

- **Zero Polling:** 100% kernel event-driven file monitoring via native `node:fs` `fs.watch` (`FSEvents` / `ReadDirectoryChangesW`).
- **Byte-Offset Tailing:** High-throughput `FileTailer` seeks to previous byte offsets and only parses newly appended lines.
- **Sliding Window Ring Buffer:** 15-minute sliding array with $O(1)$ memory allocation and zero memory leaks.
- **Safe Process Termination:** `executeKillProcess` verifies PID command names before termination to eliminate PID recycling risks.
- **Subagent & Process Drilldown:** Real-time sparklines, local peak tracking, and individual kill triggers for subagent swarms.
- **Interactive Radial HSL Color Engine:** Full per-pixel radial color disc for customized agent cards and streaming sparklines.

---

## 🤖 Supported Agents & Parsers

| Agent | Parser Type | Log / Telemetry Location | Description |
| :--- | :--- | :--- | :--- |
| **Claude Code** | `claude-stream` | `~/.claude/` | Watches session transcripts and project JSONL telemetry. |
| **Google Antigravity** | `jsonl-stream` | `~/.gemini/antigravity/brain/` | Tracks conversation transcripts and autonomous subagent swarms. |
| **Ollama** | `regex-log` | `~/.ollama/logs/server.log` | Monitors local inference requests and token output rates. |
| **Custom Agents** | `jsonl-stream` / `regex-log` | Configurable | Any stream emitting token counts or JSONL events. |

---

## 🚀 Getting Started

### Prerequisites
- Node.js `20.x` or later
- npm or pnpm

### Installation
```bash
git clone https://github.com/rwlaschin/agent-monitor.git
cd agent-monitor
npm install
```

### Run Development Server
```bash
npm run dev
```
Open [http://localhost:5500](http://localhost:5500) to view your live telemetry dashboard.

---

## 🧪 Testing & Verification

Comprehensive test suite covering adapters, ring buffers, watchers, and UI components:

```bash
# Run unit and component test suite
npm run test:unit

# Run tests in watch mode
npm run test:watch

# Run Playwright end-to-end tests
npm run test:e2e
```

---

## 🛠️ Architecture

```
agent-monitor/
├── components/           # Vue 3 components (Canvas sparklines, color wheel, cards)
├── pages/                # Nuxt 3 routes (Dashboard grid & agent drilldown)
├── server/
│   ├── api/              # SSE telemetry stream, kill switch, config endpoints
│   ├── types/            # Canonical telemetry frame specifications
│   └── utils/
│       ├── adapters/     # Stream parsers (Claude, Antigravity, JSONL)
│       ├── ringBuffer.ts # O(1) SlidingWindowRingBuffer
│       ├── tailer.ts     # Byte-offset file tailer
│       └── watcher.ts    # Kernel event-driven telemetry engine
├── stores/               # Pinia reactive state & SSE stream sync
└── config.json           # Agent paths, thresholds, and color configuration
```

---

## 📄 License

MIT © Robert Wlaschin
