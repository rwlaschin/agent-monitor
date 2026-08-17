import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import App from './app.vue';
import IndexPage from './pages/index.vue';
import SettingsPage from './pages/settings.vue';

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'antigravity' } })
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

  it('compiles and mounts pages/index.vue cleanly', () => {
    const wrapper = mount(IndexPage, {
      global: {
        stubs: {
          BreadcrumbNav: true,
          AgentCard: true,
          NuxtLink: true
        }
      }
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('compiles and mounts pages/settings.vue cleanly', () => {
    const wrapper = mount(SettingsPage, {
      global: {
        stubs: {
          BreadcrumbNav: true
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
