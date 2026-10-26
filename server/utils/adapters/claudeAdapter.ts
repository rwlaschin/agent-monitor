import type { LogAdapter } from './types';
import type { CanonicalTelemetryFrame, AgentConfig } from '../../types/telemetry';

export class ClaudeAdapter implements LogAdapter {
  private static readonly MAX_TRACKED_JSONL_RECORDS = 10_000;

  private lastInputTokens: number = 0;
  private lastOutputTokens: number = 0;
  private isInitialized: boolean = false;
  private readonly jsonlUsageByRecord = new Map<string, {
    input: number;
    cacheCreationInput: number;
    cacheReadInput: number;
    output: number;
  }>();

  public reset(): void {
    this.lastInputTokens = 0;
    this.lastOutputTokens = 0;
    this.isInitialized = false;
    this.jsonlUsageByRecord.clear();
  }

  public parseChunk(content: string, config: AgentConfig, filePath?: string): CanonicalTelemetryFrame[] {
    const trimmed = content.trim();
    if (!trimmed) return [];

    // Check if chunk is JSON Lines (.jsonl format)
    if (trimmed.includes('\n') || (trimmed.startsWith('{') && !trimmed.includes('"modelUsage"'))) {
      const lines = trimmed.split('\n').filter(l => l.trim().length > 0);
      const frames: CanonicalTelemetryFrame[] = [];
      let foundUsageRecord = false;

      for (const line of lines) {
        try {
          const data = JSON.parse(line);

          // Extract token usage from Claude CLI JSONL formats
          // e.g. data.message?.usage or data.usage or data.response?.usage
          const usage = data.message?.usage || data.usage || data.response?.usage;
          if (!usage) continue;
          foundUsageRecord = true;

          const currentUsage = {
            input: usage.input_tokens || usage.inputTokens || 0,
            cacheCreationInput: usage.cache_creation_input_tokens || usage.cacheCreationInputTokens || 0,
            cacheReadInput: usage.cache_read_input_tokens || usage.cacheReadInputTokens || 0,
            output: usage.output_tokens || usage.outputTokens || 0
          };
          const logicalId = data.requestId || data.message?.id;
          let inputTokens = currentUsage.input + currentUsage.cacheCreationInput;
          let outputTokens = currentUsage.output;

          if (typeof logicalId === 'string' && logicalId.length > 0) {
            const recordKey = `${filePath || ''}\u0000${logicalId}`;
            const previousUsage = this.jsonlUsageByRecord.get(recordKey);

            if (previousUsage) {
              inputTokens = Math.max(0, currentUsage.input - previousUsage.input)
                + Math.max(0, currentUsage.cacheCreationInput - previousUsage.cacheCreationInput);
              outputTokens = Math.max(0, currentUsage.output - previousUsage.output);
              this.jsonlUsageByRecord.delete(recordKey);

              currentUsage.input = Math.max(currentUsage.input, previousUsage.input);
              currentUsage.cacheCreationInput = Math.max(
                currentUsage.cacheCreationInput,
                previousUsage.cacheCreationInput
              );
              currentUsage.cacheReadInput = Math.max(
                currentUsage.cacheReadInput,
                previousUsage.cacheReadInput
              );
              currentUsage.output = Math.max(currentUsage.output, previousUsage.output);
            }

            this.jsonlUsageByRecord.set(recordKey, currentUsage);
            if (this.jsonlUsageByRecord.size > ClaudeAdapter.MAX_TRACKED_JSONL_RECORDS) {
              const oldestKey = this.jsonlUsageByRecord.keys().next().value;
              if (oldestKey !== undefined) this.jsonlUsageByRecord.delete(oldestKey);
            }
          }

          const totalTokens = inputTokens + outputTokens;

          if (totalTokens <= 0) continue;

          let timestamp = data.timestamp ? (typeof data.timestamp === 'string' ? new Date(data.timestamp).getTime() : data.timestamp) : Date.now();
          if (isNaN(timestamp)) timestamp = Date.now();

          // Extract project/session tag from filepath if present
          let subagentId: string | undefined;
          let subagentName: string | undefined;

          if (filePath) {
            const projectMatch = filePath.match(/projects\/([^/]+)/);
            if (projectMatch && projectMatch[1]) {
              const raw = decodeURIComponent(projectMatch[1]);
              let clean = raw;
              if (raw.startsWith('-')) {
                const parts = raw.split('-').filter(Boolean);
                clean = parts.length > 0 ? parts[parts.length - 1] : raw;
              }
              const cleanProjectKey = raw.replace(/^-+/, '');
              subagentId = `project--${cleanProjectKey}`;
              subagentName = clean;
            }
          }

          frames.push({
            agentId: config.id,
            agentName: config.name,
            timestamp,
            inputTokens,
            outputTokens,
            totalTokens,
            status: 'active',
            subagentId,
            subagentName
          });
        } catch {
          // Skip invalid JSONL line
        }
      }

      if (foundUsageRecord) return frames;
    }

    // Fallback: Parse single JSON snapshot (e.g. stats-cache.json)
    try {
      const data = JSON.parse(content);
      const modelUsage = data.modelUsage || {};

      let currentTotalInput = 0;
      let currentTotalOutput = 0;

      for (const modelKey of Object.keys(modelUsage)) {
        const usage = modelUsage[modelKey] || {};
        currentTotalInput += (usage.inputTokens || 0)
          + (usage.cacheCreationInputTokens || 0);
        currentTotalOutput += (usage.outputTokens || 0);
      }

      const currentTotal = currentTotalInput + currentTotalOutput;

      if (!this.isInitialized) {
        this.lastInputTokens = currentTotalInput;
        this.lastOutputTokens = currentTotalOutput;
        this.isInitialized = true;

        return [{
          agentId: config.id,
          agentName: config.name,
          timestamp: Date.now(),
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          status: 'active'
        }];
      }

      // Check if file was truncated/reset
      if (currentTotal < (this.lastInputTokens + this.lastOutputTokens)) {
        this.lastInputTokens = currentTotalInput;
        this.lastOutputTokens = currentTotalOutput;

        return [{
          agentId: config.id,
          agentName: config.name,
          timestamp: Date.now(),
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          status: 'active'
        }];
      }

      const deltaInput = Math.max(0, currentTotalInput - this.lastInputTokens);
      const deltaOutput = Math.max(0, currentTotalOutput - this.lastOutputTokens);
      const deltaTotal = deltaInput + deltaOutput;

      this.lastInputTokens = currentTotalInput;
      this.lastOutputTokens = currentTotalOutput;

      return [{
        agentId: config.id,
        agentName: config.name,
        timestamp: Date.now(),
        inputTokens: deltaInput,
        outputTokens: deltaOutput,
        totalTokens: deltaTotal,
        status: deltaTotal > 0 ? 'active' : 'idle'
      }];
    } catch {
      return [];
    }
  }
}
