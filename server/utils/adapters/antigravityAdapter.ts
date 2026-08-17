import type { LogAdapter } from './types';
import type { CanonicalTelemetryFrame, AgentConfig } from '../../types/telemetry';

export class AntigravityAdapter implements LogAdapter {
  private lineBuffers: Map<string, string> = new Map();

  public reset(): void {
    this.lineBuffers.clear();
  }

  public parseChunk(chunk: string, config: AgentConfig, filePath: string = 'default'): CanonicalTelemetryFrame[] {
    const frames: CanonicalTelemetryFrame[] = [];
    const prev = this.lineBuffers.get(filePath) || '';
    const combined = prev + chunk;
    const lines = combined.split('\n');

    // Save trailing incomplete line specifically for this file
    this.lineBuffers.set(filePath, lines.pop() || '');

    // Extract conversation / project short ID from file path
    let projectTag: string | undefined;
    if (filePath && filePath !== 'default') {
      const match = filePath.match(/brain\/([^/]+)/);
      if (match && match[1]) {
        projectTag = match[1].slice(0, 8);
      }
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const entry = JSON.parse(trimmed);
        
        // 1. Determine Timestamp
        let timestamp = Date.now();
        if (entry.created_at) {
          const parsed = new Date(entry.created_at).getTime();
          if (!isNaN(parsed)) timestamp = parsed;
        } else if (typeof entry.timestamp === 'number') {
          timestamp = entry.timestamp;
        }

        // 2. Extract or Estimate Token Counts
        const usage = entry.usage_metadata || entry.usage || {};
        let inputTokens = usage.prompt_token_count || usage.input_tokens || usage.input || 0;
        let outputTokens = usage.candidates_token_count || usage.output_tokens || usage.output || 0;

        if (inputTokens === 0 && outputTokens === 0) {
          // Estimate from payload size (approx 4 chars per token)
          const contentLen = entry.content ? String(entry.content).length : 0;
          const toolsLen = entry.tool_calls ? JSON.stringify(entry.tool_calls).length : 0;
          const totalChars = contentLen + toolsLen || trimmed.length;
          const estimatedTokens = Math.max(1, Math.ceil(totalChars / 4));

          if (entry.source === 'MODEL') {
            outputTokens = estimatedTokens;
          } else {
            inputTokens = estimatedTokens;
          }
        }

        const totalTokens = inputTokens + outputTokens;

        if (totalTokens > 0) {
          // 3. Extract Subagent or Project Metadata
          let subagentId: string | undefined = entry.subagent_id || entry.subagentId;
          let subagentName: string | undefined = entry.subagent_name || entry.subagentName;

          // Check if this step is a subagent invocation
          if (entry.tool_calls && Array.isArray(entry.tool_calls)) {
            for (const call of entry.tool_calls) {
              if (call.name === 'invoke_subagent' && call.args?.Subagents) {
                const sub = Array.isArray(call.args.Subagents) ? call.args.Subagents[0] : null;
                if (sub) {
                  subagentName = sub.Role || sub.TypeName;
                  subagentId = `subagent-${sub.TypeName || 'worker'}`;
                }
              }
            }
          }

          // If no specific subagent role, group by active project conversation
          if (!subagentId && projectTag) {
            subagentId = `project-${projectTag}`;
            subagentName = projectTag;
          }

          frames.push({
            agentId: config.id,
            agentName: config.name,
            subagentId,
            subagentName,
            timestamp,
            inputTokens,
            outputTokens,
            totalTokens,
            status: 'active'
          });
        }
      } catch {
        // Skip malformed individual lines
      }
    }

    return frames;
  }
}
