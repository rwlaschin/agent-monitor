import type { LogAdapter } from './types';
import type { CanonicalTelemetryFrame, AgentConfig } from '../../types/telemetry';

export class ClaudeAdapter implements LogAdapter {
  private lastInputTokens: number = 0;
  private lastOutputTokens: number = 0;
  private isInitialized: boolean = false;

  public reset(): void {
    this.lastInputTokens = 0;
    this.lastOutputTokens = 0;
    this.isInitialized = false;
  }

  public parseChunk(content: string, config: AgentConfig, filePath?: string): CanonicalTelemetryFrame[] {
    const trimmed = content.trim();
    if (!trimmed) return [];

    // Check if chunk is JSON Lines (.jsonl format)
    if (trimmed.includes('\n') || (trimmed.startsWith('{') && !trimmed.includes('"modelUsage"'))) {
      const lines = trimmed.split('\n').filter(l => l.trim().length > 0);
      const frames: CanonicalTelemetryFrame[] = [];

      for (const line of lines) {
        try {
          const data = JSON.parse(line);

          // Extract token usage from Claude CLI JSONL formats
          // e.g. data.message?.usage or data.usage or data.response?.usage
          const usage = data.message?.usage || data.usage || data.response?.usage;
          if (!usage) continue;

          const inputTokens = usage.input_tokens || usage.inputTokens || 0;
          const outputTokens = usage.output_tokens || usage.outputTokens || 0;
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

      if (frames.length > 0) return frames;
    }

    // Fallback: Parse single JSON snapshot (e.g. stats-cache.json)
    try {
      const data = JSON.parse(content);
      const modelUsage = data.modelUsage || {};

      let currentTotalInput = 0;
      let currentTotalOutput = 0;

      for (const modelKey of Object.keys(modelUsage)) {
        const usage = modelUsage[modelKey] || {};
        currentTotalInput += (usage.inputTokens || 0);
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
