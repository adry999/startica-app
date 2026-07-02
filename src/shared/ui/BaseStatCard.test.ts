// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseStatCard from './BaseStatCard.vue'

const globalStubs = { stubs: { UIcon: true } }

describe('BaseStatCard', () => {
  it('renders label and value', () => {
    const wrapper = mount(BaseStatCard, { props: { label: 'Total copii', value: 42 }, global: globalStubs })
    expect(wrapper.text()).toContain('Total copii')
    expect(wrapper.text()).toContain('42')
  })

  it('shows a pulse placeholder instead of the value while loading', () => {
    const wrapper = mount(BaseStatCard, { props: { label: 'Total copii', value: 42, loading: true }, global: globalStubs })
    expect(wrapper.find('.animate-pulse').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('42')
  })

  it('renders default slot as value override and meta slot', () => {
    const wrapper = mount(BaseStatCard, {
      props: { label: 'Prezență' },
      slots: { default: '<em>în curând</em>', meta: '+2 luna aceasta' },
      global: globalStubs,
    })
    expect(wrapper.find('em').text()).toBe('în curând')
    expect(wrapper.text()).toContain('+2 luna aceasta')
  })
})
