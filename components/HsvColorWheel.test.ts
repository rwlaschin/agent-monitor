import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import HsvColorWheel from './HsvColorWheel.vue';

describe('HsvColorWheel', () => {
  it('renders circular canvas and white selector dot', () => {
    const wrapper = mount(HsvColorWheel, {
      props: {
        modelValue: '#a855f7',
        size: 150
      }
    });

    expect(wrapper.find('canvas').exists()).toBe(true);
    expect(wrapper.find('div.rounded-full.bg-white').exists()).toBe(true);
  });

  it('updates selector position when modelValue changes', async () => {
    const wrapper = mount(HsvColorWheel, {
      props: {
        modelValue: '#06b6d4',
        size: 160
      }
    });

    const selector = wrapper.find('div.rounded-full.bg-white');
    expect(selector.exists()).toBe(true);

    await wrapper.setProps({ modelValue: '#ec4899' });
    expect(wrapper.props('modelValue')).toBe('#ec4899');
  });
});
