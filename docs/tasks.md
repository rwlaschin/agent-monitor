# Agent Token Monitor - Detailed Task Checklist

## Phase 1: Project Scaffolding & Design Docs
- [x] Create `/Users/mac/Documents/Projects/agent-monitor` and initialize `git init`
- [x] Write `docs/design.md` with complete technical contracts, adapter schemas, and state specifications
- [x] Write `docs/tasks.md` with granular atomic tasks
- [x] Scaffold Nuxt 3 application with Tailwind CSS, Lucide icons, Vitest, and Playwright

## Phase 2: Backend Telemetry Engine (TDD with Vitest)
- [x] `server/types/telemetry.ts`: Define TypeScript interfaces for CanonicalTelemetryFrame, AgentConfig, and MinuteBucket
- [x] `server/utils/ringBuffer.test.ts`: Write unit tests for 15-minute sliding window ring buffer
- [x] `server/utils/ringBuffer.ts`: Implement circular ring buffer with $O(1)$ updates and monotonic minute bucketing
- [x] `server/utils/adapters/claudeAdapter.test.ts` & `antigravityAdapter.test.ts`: Write tests for log parsers
- [x] `server/utils/adapters/`: Implement Claude, Antigravity, and Generic JSONL log adapters
- [x] `server/utils/tailer.test.ts`: Write tests for byte-offset tailing, line accumulator, and rotation recovery
- [x] `server/utils/tailer.ts`: Implement byte-offset file tailer
- [x] `server/utils/watcher.ts`: Implement unified `chokidar` watcher service with dynamic agent registration
- [x] `server/api/kill.test.ts`: Write tests for PID verification and process termination endpoint
- [x] `server/api/kill.post.ts`: Implement `/api/kill` with safety verification
- [x] `server/api/telemetry.get.ts`: Implement SSE streaming endpoint for 500ms batched updates

## Phase 3: Frontend Mission-Control UI (TDD with Vue Test Utils)
- [x] `stores/telemetryStore.ts`: Implement Pinia store for live streams, 1/2/3/4 column preferences, and alerts
- [x] `components/AppHeader.vue` & `components/BreadcrumbNav.vue`: Build top navigation with layout switcher
- [x] `components/AgentChart.vue`: Build high-performance Canvas sliding-window chart with Top-3 stacked bands and alert line
- [x] `components/SubagentTree.vue`: Build ranked subagent burn table with individual `[ Kill ]` buttons
- [x] `components/AgentCard.vue`: Build host card with local max, current rate, emergency kill button
- [x] `pages/index.vue`: Build Overview dashboard with flexible 1/2/3/4 column flex grid
- [x] `pages/agents/[id].vue`: Build Single Agent Zoom view with Picture-in-Picture mini overview
- [x] `pages/settings.vue`: Build dynamic agent management (Add / Edit / Disable / Delete)

## Phase 4: E2E Verification & Hardening
- [x] `e2e/01-dashboard.spec.ts`: Test multi-column layout, independent charts, and settings persistence
- [x] `e2e/02-streaming.spec.ts`: Test real-time file append ingestion and 60fps chart animation
- [x] `e2e/03-kill-switch.spec.ts`: Test live dummy process spawning and UI kill execution
- [x] Run full test suite and verify 100% pass rate

