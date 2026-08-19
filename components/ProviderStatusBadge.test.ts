import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ProviderStatusBadge from './ProviderStatusBadge.vue';

describe('ProviderStatusBadge.vue', () => {
  it('renders LLM status button cleanly', () => {
    const wrapper = mount(ProviderStatusBadge);
    expect(wrapper.text()).toContain('LLM');
  });

  it('opens and closes breakdown popover on click', async () => {
    const wrapper = mount(ProviderStatusBadge);
    expect(wrapper.text()).not.toContain('Upstream LLM Health');

    const button = wrapper.find('button');
    await button.trigger('click');

    expect(wrapper.text()).toContain('Upstream LLM Health');
    expect(wrapper.text()).toContain('Anthropic Claude');
    expect(wrapper.text()).toContain('OpenAI');
  });
});
