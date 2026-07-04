// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BasePageHeader from './BasePageHeader.vue'

describe('BasePageHeader', () => {
  it('renders title and subtitle', () => {
    const wrapper = mount(BasePageHeader, {
      props: { title: 'Copii', subtitle: 'Gestionează profilurile copiilor' },
    })
    expect(wrapper.find('h1').text()).toBe('Copii')
    expect(wrapper.text()).toContain('Gestionează profilurile copiilor')
  })

  it('omits subtitle when not provided and renders the actions slot', () => {
    const wrapper = mount(BasePageHeader, {
      props: { title: 'Copii' },
      slots: { actions: '<button id="cta">Add</button>' },
    })
    expect(wrapper.find('p').exists()).toBe(false)
    expect(wrapper.find('#cta').exists()).toBe(true)
  })
})
