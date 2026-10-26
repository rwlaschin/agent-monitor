import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { LogAdapter } from './types';
import type { AgentConfig, CanonicalTelemetryFrame } from '../../types/telemetry';

const execAsync = promisify(exec);
const MAX_TRACKED_ROLLOUTS = 10_000;
const MAX_THREAD_METADATA = 10_000;

type ExecResult = { stdout: string; stderr: string };
type TokenState = { freshInput: number; output: number };

export class CodexAdapter implements LogAdapter {
  private readonly tokenStateByRollout = new Map<string, TokenState>();
  private readonly existingRollouts = new Set<string>();
  private readonly threadNames = new Map<string, string>();
  private readonly threadByRollout = new Map<string, string>();
  private hasLoadedMetadata = false;

  constructor(
    private readonly execFn: (command: string, options?: unknown) => Promise<ExecResult> = execAsync
  ) {}

  public reset(): void {
    this.tokenStateByRollout.clear();
    this.existingRollouts.clear();
    this.threadNames.clear();
    this.threadByRollout.clear();
    this.hasLoadedMetadata = false;
  }

  public markExistingRollout(filePath: string): void {
    this.existingRollouts.add(path.resolve(filePath));
  }

  public async parseDatabase(dbPath: string, _config: AgentConfig): Promise<CanonicalTelemetryFrame[]> {
    try {
      const { stdout: tablesOutput } = await this.execFn(
        `sqlite3 "${dbPath}" ".tables"`,
        { timeout: 2000 }
      );
      const tables = tablesOutput.trim().split(/\s+/);
      if (!tables.includes('threads')) return [];

      const query = "SELECT id, COALESCE(NULLIF(name, ''), NULLIF(title, ''), id), COALESCE(rollout_path, '') FROM threads;";
      const { stdout } = await this.execFn(
        `sqlite3 -separator '|' "${dbPath}" "${query}"`,
        { timeout: 2000 }
      );
      const isStartupCatalog = !this.hasLoadedMetadata;

      for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        const [threadId, rawName, rolloutPath] = line.split('|');
        const id = threadId?.trim();
        if (!id) continue;

        const name = rawName?.trim().replace(/[\r\n]+/g, ' ') || `thread-${id.slice(0, 8)}`;
        this.setBounded(this.threadNames, id, name, MAX_THREAD_METADATA);
        if (rolloutPath?.trim()) {
          const resolvedRolloutPath = path.resolve(rolloutPath.trim());
          this.setBounded(this.threadByRollout, resolvedRolloutPath, id, MAX_THREAD_METADATA);
          if (isStartupCatalog) this.existingRollouts.add(resolvedRolloutPath);
        }
      }
      this.hasLoadedMetadata = true;
    } catch {
      // Metadata refresh failures must not interrupt token telemetry.
    }

    return [];
  }

  public parseChunk(content: string, config: AgentConfig, filePath?: string): CanonicalTelemetryFrame[] {
    if (!filePath) return [];
    const rolloutKey = path.resolve(filePath);
    const baselineOnly = this.existingRollouts.has(rolloutKey) && !this.tokenStateByRollout.has(rolloutKey);
    const frames: CanonicalTelemetryFrame[] = [];
    let foundUsage = false;

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;

      try {
        const record = JSON.parse(line);
        if (record.type !== 'event_msg' || record.payload?.type !== 'token_count') continue;
        const usage = record.payload?.info?.total_token_usage;
        if (!usage) continue;

        const input = this.nonnegativeNumber(usage.input_tokens);
        const cachedInput = this.nonnegativeNumber(usage.cached_input_tokens);
        const output = this.nonnegativeNumber(usage.output_tokens);
        if (input === null || cachedInput === null || output === null) continue;

        foundUsage = true;
        const current = { freshInput: Math.max(0, input - cachedInput), output };
        const previous = this.tokenStateByRollout.get(rolloutKey);
        this.setBounded(this.tokenStateByRollout, rolloutKey, current, MAX_TRACKED_ROLLOUTS);

        if (baselineOnly) continue;
        if (previous && (current.freshInput < previous.freshInput || current.output < previous.output)) continue;

        const inputTokens = previous ? current.freshInput - previous.freshInput : current.freshInput;
        const outputTokens = previous ? current.output - previous.output : current.output;
        const totalTokens = inputTokens + outputTokens;
        if (totalTokens <= 0) continue;

        const threadId = this.resolveThreadId(rolloutKey);
        const subagentId = `thread-${threadId.slice(0, 8)}`;
        const parsedTimestamp = typeof record.timestamp === 'number'
          ? record.timestamp
          : new Date(record.timestamp).getTime();

        frames.push({
          agentId: config.id,
          agentName: config.name,
          subagentId,
          subagentName: this.threadNames.get(threadId) || subagentId,
          timestamp: Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now(),
          inputTokens,
          outputTokens,
          totalTokens,
          status: 'active'
        });
      } catch {
        // Ignore malformed rollout records and continue with later JSONL lines.
      }
    }

    if (foundUsage) this.existingRollouts.delete(rolloutKey);
    return frames;
  }

  private resolveThreadId(rolloutPath: string): string {
    const metadataId = this.threadByRollout.get(rolloutPath);
    if (metadataId) return metadataId;

    const filename = path.basename(rolloutPath);
    const match = filename.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    return match?.[1] || filename.replace(/^rollout-/, '').replace(/\.jsonl$/, '');
  }

  private nonnegativeNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  }

  private setBounded<K, V>(map: Map<K, V>, key: K, value: V, limit: number): void {
    map.delete(key);
    map.set(key, value);
    if (map.size > limit) {
      const oldestKey = map.keys().next().value;
      if (oldestKey !== undefined) map.delete(oldestKey);
    }
  }
}
