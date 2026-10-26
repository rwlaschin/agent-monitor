import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import AgentDetailPage from './[id].vue';

const { snapshot, telemetryStore } = vi.hoisted(() => {
  const snapshot = {
    agentId: 'claude',
    agentName: 'Claude Code',
    color: '#a855f7',
    status: 'active',
    activePid: 4892,
    currentRate: 350,
    localMax: 350,
    totalTokens24h: 350,
    alertThreshold: 8000,
    isAlertBreached: false,
    history: [{
      timestamp: 1700000000000,
      totalTokens: 350,
      mainTokens: 0,
      subagentTokens: {
        'process-alpha': { name: 'Shared Worker', tokens: 100, color: '#dc2626' },
        'process-beta': { name: 'Shared Worker', tokens: 250, color: '#2563eb' }
      }
    }],
    subagents: [
      { id: 'process-alpha', name: 'Shared Worker', color: '#dc2626', currentRate: 100, pid: 101 },
      { id: 'process-beta', name: 'Shared Worker', color: '#2563eb', currentRate: 250, pid: 202 }
    ]
  };

  return {
    snapshot,
    telemetryStore: {
      snapshots: [snapshot],
      killInProgress: {},
      processOrders: {},
      getAgentById: () => snapshot,
      setProcessOrder: vi.fn(),
      triggerEmergencyStop: vi.fn()
    }
  };
});

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'claude' } })
}));

vi.mock('~/stores/telemetryStore', () => ({
  useTelemetryStore: () => telemetryStore
}));

vi.mock('~/composables/useProviderHealth', () => ({
  useProviderHealth: () => ({ getProviderForAgent: () => null })
}));

describe('agent detail page', () => {
  // Integration contract: the master chart receives the same ID/color mapping used by the
  // individual process cards, so both views render processes consistently.
  it('passes snapshot subagents to the master AgentChart', () => {
    const wrapper = mount(AgentDetailPage, {
      global: {
        stubs: {
          AgentChart: {
            name: 'AgentChart',
            props: ['history', 'color', 'alertThreshold', 'localMax', 'subagents'],
            template: '<div class="agent-chart-stub"></div>'
          },
          BreadcrumbNav: true,
          ProcessStreamCard: true,
          NuxtLink: true,
          Square: true,
          Activity: true,
          GripVertical: true,
          ExternalLink: true
        }
      }
    });

    expect(wrapper.findComponent({ name: 'AgentChart' }).props('subagents')).toEqual(snapshot.subagents);
  });
});
