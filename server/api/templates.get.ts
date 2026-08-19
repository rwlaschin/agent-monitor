import fs from 'fs';
import path from 'path';
import type { ParserType } from '../types/telemetry';

export interface AgentTemplate {
  id: string;
  name: string;
  path: string;
  parser: ParserType;
  processName: string;
  color: string;
  alertThreshold?: number;
  statusUrl?: string;
}

export const DEFAULT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    path: '~/.claude/',
    parser: 'claude-stream',
    processName: 'claude',
    color: '#ec4899',
    alertThreshold: 10000,
    statusUrl: 'https://status.claude.com'
  },
  {
    id: 'codegpt',
    name: 'CodeGPT',
    path: '~/.codegpt/',
    parser: 'sqlite-db',
    processName: 'codegpt',
    color: '#10b981',
    alertThreshold: 15000,
    statusUrl: 'https://status.openai.com'
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    path: '~/.gemini/antigravity/brain/',
    parser: 'jsonl-stream',
    processName: 'antigravity',
    color: '#06b6d4',
    alertThreshold: 10000,
    statusUrl: 'https://status.cloud.google.com'
  },
  {
    id: 'ollama',
    name: 'Ollama',
    path: '~/.ollama/logs/server.log',
    parser: 'regex-log',
    processName: 'ollama',
    color: '#10b981',
    alertThreshold: 10000,
    statusUrl: 'http://localhost:11434'
  }
];

export function getAgentTemplates(): AgentTemplate[] {
  const templatesFile = path.resolve(process.cwd(), 'templates.json');
  if (fs.existsSync(templatesFile)) {
    try {
      const raw = fs.readFileSync(templatesFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {}
  }
  return DEFAULT_TEMPLATES;
}

export default typeof defineEventHandler !== 'undefined'
  ? defineEventHandler(() => ({ templates: getAgentTemplates() }))
  : async () => ({ templates: getAgentTemplates() });
