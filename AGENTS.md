# Agent Token Monitor - Project Context & Guidelines

## Overview
A real-time telemetry monitoring dashboard and emergency kill switch for multi-agent LLM swarms (Claude Code, Antigravity, Ollama, custom agents), built with Nuxt 3, Tailwind CSS, Pinia, and strict TDD (Vitest + Playwright).

---

## Architecture & Conventions

### 1. Telemetry Engine (Backend)
- **Zero Polling:** File watching is 100% kernel event-driven via `chokidar` (`FSEvents` on macOS).
- **Byte-Offset Tailing:** `FileTailer` seeks to previous byte offsets and only reads newly appended lines.
- **Minute Bucketing:** `SlidingWindowRingBuffer` maintains a 15-minute sliding array with $O(1)$ updates and zero memory leaks.
- **Kill Switch Safety:** `executeKillProcess` verifies PID command names before termination to prevent PID recycling accidents.

### 2. UI / UX Conventions
- **1/2/3/4 Column Grid:** Layout switcher in `AppHeader` persisted in `localStorage`.
- **Canvas Streaming Chart:** High-performance Canvas renderer with local max peak indicators and horizontal dashed alert threshold lines.
- **High-Cardinality Subagents:** Top 3 highest-burn subagents rendered as stacked color bands; remaining subagents grouped into an "Others" aggregate band.
- **Dynamic Configuration:** Agents managed dynamically via `config.json` and `/settings` (Add, Edit, Toggle Enable/Disable, Delete).

---

## Testing Commands
- **Unit & Component Tests:** `npm run test:unit`
- **Watch Mode:** `npm run test:watch`
- **E2E Tests:** `npm run test:e2e`
- **Production Build:** `npm run build`
