import { ref } from 'vue';

export interface ProviderHealth {
  id: string;
  name: string;
  status: 'operational' | 'degraded' | 'major_outage' | 'maintenance' | 'offline' | 'unknown';
  description: string;
  updatedAt: string;
  url: string;
}

const providers = ref<ProviderHealth[]>([
  { id: 'antigravity', name: 'Google Gemini (Antigravity)', status: 'operational', description: 'All Systems Operational', updatedAt: '', url: 'https://status.cloud.google.com' },
  { id: 'claude', name: 'Anthropic Claude', status: 'operational', description: 'All Systems Operational', updatedAt: '', url: 'https://status.claude.com' },
  { id: 'openai', name: 'OpenAI (Codex/GPT)', status: 'operational', description: 'All Systems Operational', updatedAt: '', url: 'https://status.openai.com' },
  { id: 'ollama', name: 'Ollama (Local)', status: 'operational', description: 'Local Daemon Active', updatedAt: '', url: 'http://localhost:11434' }
]);

let isFetching = false;

export function useProviderHealth() {
  async function fetchStatuses() {
    if (isFetching) return;
    isFetching = true;
    try {
      const res = await $fetch<{ providers: ProviderHealth[] }>('/api/provider-status');
      if (res?.providers) {
        providers.value = res.providers;
      }
    } catch {}
    finally {
      isFetching = false;
    }
  }

  function getProviderForAgent(agentId: string, agentName: string, statusUrl?: string): ProviderHealth | null {
    if (statusUrl) {
      const clean = statusUrl.trim().replace(/\/+$/, '').toLowerCase();
      const match = providers.value.find(p => p.url.toLowerCase() === clean || clean.includes(p.url.toLowerCase()) || p.url.toLowerCase().includes(clean));
      if (match) return match;
    }

    const id = (agentId || '').toLowerCase();
    const name = (agentName || '').toLowerCase();

    if (id.includes('antigravity') || name.includes('antigravity') || id.includes('gemini') || name.includes('gemini') || id.includes('google')) {
      return providers.value.find(p => p.id === 'antigravity') || null;
    }
    if (id.includes('claude') || name.includes('claude') || id.includes('anthropic')) {
      return providers.value.find(p => p.id === 'claude') || null;
    }
    if (id.includes('codegpt') || name.includes('codegpt') || id.includes('openai') || name.includes('codex') || name.includes('openai') || id.includes('gpt')) {
      return providers.value.find(p => p.id === 'openai') || null;
    }
    if (id.includes('ollama') || name.includes('ollama')) {
      return providers.value.find(p => p.id === 'ollama') || null;
    }
    return null;
  }

  return {
    providers,
    fetchStatuses,
    getProviderForAgent
  };
}
