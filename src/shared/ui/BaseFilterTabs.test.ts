// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseFilterTabs from './BaseFilterTabs.vue'

const items = [
  { label: 'Toți', value: 'all' },
  { label: 'Activi', value: 'active' },
]

describe('BaseFilterTabs', () => {
  it('renders one button per item and highlights the active one', () => {
    const wrapper = mount(BaseFilterTabs, { props: { items, modelValue: 'active' } })
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[1]!.classes()).toContain('bg-white')
    expect(buttons[0]!.classes()).not.toContain('bg-white')
  })

  it('emits update:modelValue with the clicked value', async () => {
    const wrapper = mount(BaseFilterTabs, { props: { items, modelValue: 'all' } })
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['active']])
  })
})
