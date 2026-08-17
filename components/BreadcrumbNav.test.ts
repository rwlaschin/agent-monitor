import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BreadcrumbNav from './BreadcrumbNav.vue';

describe('BreadcrumbNav', () => {
  it('renders standard hierarchical breadcrumb links', () => {
    const wrapper = mount(BreadcrumbNav, {
      props: {
        items: [
          { label: 'Agents', to: '/' },
          { label: 'Claude Code' }
        ]
      },
      global: {
        stubs: {
          NuxtLink: {
            template: '<a><slot /></a>'
          }
        }
      }
    });

    expect(wrapper.text()).toContain('Dashboard');
    expect(wrapper.text()).toContain('Agents');
    expect(wrapper.text()).toContain('Claude Code');
  });
});
