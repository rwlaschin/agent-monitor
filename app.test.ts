import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import App from './app.vue';
import IndexPage from './pages/index.vue';
import SettingsPage from './pages/settings.vue';
import AppHeader from './components/AppHeader.vue';
import { useTelemetryStore } from './stores/telemetryStore';

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'antigravity' }, path: '/' })
}));

describe('Application Root & Pages SFC Integrity', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('compiles and mounts app.vue cleanly without syntax/tag errors', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          AppHeader: { template: '<header></header>' },
          NuxtPage: { template: '<main></main>' }
        }
      }
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('compiles and mounts components/AppHeader.vue cleanly', () => {
    const wrapper = mount(AppHeader, {
      global: {
        stubs: {
          NuxtLink: { template: '<a><slot /></a>' },
          ProviderStatusBadge: { template: '<div class="provider-status-badge-stub"></div>' }
        }
      }
    });
    expect(wrapper.exists()).toBe(true);
    expect(wrapper.text()).toContain('AGENT MONITOR');
  });

  it('compiles and mounts pages/index.vue and renders active agent cards', () => {
    const store = useTelemetryStore();
    store.snapshots = [
      {
        agentId: 'claude',
        agentName: 'Claude Code',
        color: '#ec4899',
        status: 'active',
        activePid: 1234,
        currentRate: 4500,
        localMax: 9000,
        totalTokens24h: 25000,
        alertThreshold: 10000,
        isAlertBreached: false,
        history: [],
        subagents: []
      }
    ];

    const wrapper = mount(IndexPage, {
      global: {
        stubs: {
          BreadcrumbNav: true,
          AgentCard: { template: '<div class="agent-card-stub">Claude Card Stub</div>' },
          NuxtLink: true
        }
      }
    });
    expect(wrapper.exists()).toBe(true);
    expect(wrapper.text()).toContain('4,500');
    expect(wrapper.text()).toContain('Claude Card Stub');
  });

  it('compiles and mounts pages/settings.vue cleanly', () => {
    const wrapper = mount(SettingsPage, {
      global: {
        stubs: {
          BreadcrumbNav: true,
          HsvColorWheel: true
        }
      }
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('compiles and mounts pages/agents/[id].vue cleanly', async () => {
    const AgentDrilldownPage = (await import('./pages/agents/[id].vue')).default;
    const wrapper = mount(AgentDrilldownPage, {
      global: {
        stubs: {
          BreadcrumbNav: true,
          AgentChart: true,
          ProcessStreamCard: true,
          SubagentTree: true,
          NuxtLink: true
        },
        provide: {
          [Symbol.for('route location')]: { params: { id: 'antigravity' } }
        }
      }
    });
    expect(wrapper.exists()).toBe(true);
  });
});
