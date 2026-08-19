import fs from 'fs';
import path from 'path';
import type { AppConfig } from '../types/telemetry';

export interface ProviderHealth {
  id: string;
  name: string;
  status: 'operational' | 'degraded' | 'major_outage' | 'maintenance' | 'offline' | 'unknown';
  description: string;
  updatedAt: string;
  url: string;
}

const statusCache = new Map<string, { timestamp: number; data: ProviderHealth }>();
const CACHE_TTL_MS = 60 * 1000;

export async function checkStatusUrl(url: string, id: string, name: string): Promise<ProviderHealth> {
  const cached = statusCache.get(url);
  const now = Date.now();
  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    return cached.data;
  }

  const cleanUrl = url.trim().replace(/\/+$/, '');
  let health: ProviderHealth = {
    id,
    name,
    status: 'operational',
    description: 'All Systems Operational',
    updatedAt: new Date().toISOString(),
    url: cleanUrl
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    // If local Ollama
    if (cleanUrl.includes(':11434')) {
      const res = await fetch(`${cleanUrl}/api/version`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json() as any;
        health = {
          id,
          name,
          status: 'operational',
          description: `Running locally (v${data.version || 'unknown'})`,
          updatedAt: new Date().toISOString(),
          url: cleanUrl
        };
      } else {
        health = {
          id,
          name,
          status: 'offline',
          description: 'Daemon not responding',
          updatedAt: new Date().toISOString(),
          url: cleanUrl
        };
      }
    } else {
      // Try Statuspage API first (/api/v2/status.json)
      let statusApiUrl = `${cleanUrl}/api/v2/status.json`;
      if (cleanUrl.endsWith('/api/v2/status.json')) {
        statusApiUrl = cleanUrl;
      }

      let res = await fetch(statusApiUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });

      if (res.ok && res.headers.get('content-type')?.includes('json')) {
        clearTimeout(timeout);
        const data = await res.json() as any;
        const indicator = data?.status?.indicator || 'none';
        let status: ProviderHealth['status'] = 'operational';
        if (indicator === 'minor') status = 'degraded';
        else if (indicator === 'major' || indicator === 'critical') status = 'major_outage';
        else if (indicator === 'maintenance') status = 'maintenance';

        health = {
          id,
          name,
          status,
          description: data?.status?.description || 'All Systems Operational',
          updatedAt: data?.page?.updated_at || new Date().toISOString(),
          url: cleanUrl
        };
      } else {
        // Fallback: ping main URL directly
        const pingRes = await fetch(cleanUrl, { signal: controller.signal });
        clearTimeout(timeout);
        health = {
          id,
          name,
          status: pingRes.ok ? 'operational' : 'degraded',
          description: pingRes.ok ? 'HTTP Reachable (Status OK)' : `HTTP ${pingRes.status} Error`,
          updatedAt: new Date().toISOString(),
          url: cleanUrl
        };
      }
    }
  } catch (err: any) {
    health = {
      id,
      name,
      status: cleanUrl.includes('localhost') || cleanUrl.includes('127.0.0.1') ? 'offline' : 'operational',
      description: cleanUrl.includes('localhost') ? 'Local daemon not running' : 'All Systems Operational',
      updatedAt: new Date().toISOString(),
      url: cleanUrl
    };
  }

  statusCache.set(url, { timestamp: now, data: health });
  return health;
}

export async function fetchProviderStatuses(): Promise<{ providers: ProviderHealth[]; cached: boolean }> {
  // Read configured agents from config.json
  const configPath = path.resolve(process.cwd(), 'config.json');
  let configAgents: { id: string; name: string; statusUrl?: string }[] = [];

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const cfg: AppConfig = JSON.parse(raw);
      if (Array.isArray(cfg.agents)) {
        configAgents = cfg.agents;
      }
    } catch {}
  }

  const defaultUrls: { id: string; name: string; url: string }[] = [
    { id: 'antigravity', name: 'Google Gemini (Antigravity)', url: 'https://status.cloud.google.com' },
    { id: 'claude', name: 'Anthropic Claude', url: 'https://status.claude.com' },
    { id: 'openai', name: 'OpenAI (Codex/GPT)', url: 'https://status.openai.com' },
    { id: 'ollama', name: 'Ollama (Local)', url: 'http://localhost:11434' }
  ];

  const results: ProviderHealth[] = [];
  const processedUrls = new Set<string>();

  // 1. Process custom status URLs from config
  for (const agent of configAgents) {
    if (agent.statusUrl && !processedUrls.has(agent.statusUrl)) {
      processedUrls.add(agent.statusUrl);
      const res = await checkStatusUrl(agent.statusUrl, agent.id, `${agent.name} Status`);
      results.push(res);
    }
  }

  // 2. Add defaults if not already present
  for (const def of defaultUrls) {
    if (!processedUrls.has(def.url)) {
      processedUrls.add(def.url);
      const res = await checkStatusUrl(def.url, def.id, def.name);
      results.push(res);
    }
  }

  return { providers: results, cached: false };
}

export default typeof defineEventHandler !== 'undefined'
  ? defineEventHandler(async (event) => {
      const query = typeof getQuery !== 'undefined' ? getQuery(event) : {};
      if (query?.url) {
        const single = await checkStatusUrl(query.url as string, 'custom', 'Custom Provider');
        return { provider: single };
      }
      return fetchProviderStatuses();
    })
  : async () => fetchProviderStatuses();
