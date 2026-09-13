// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'
import BasePageError from './BasePageError.vue'

// Stand-ins for Nuxt UI: only the props, slot and click contract BasePageError relies on.
const UAlertStub = defineComponent({
  props: { title: { type: String, default: '' }, description: { type: String, default: '' } },
  setup(props, { slots }) {
    return () => h('div', [h('h3', props.title), h('p', props.description), slots.actions?.()])
  },
})

const UButtonStub = defineComponent({
  emits: ['click'],
  setup(_props, { emit, slots }) {
    return () => h('button', { onClick: () => emit('click') }, slots.default?.())
  },
})

const i18n = createI18n<false>({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      common: { retry: 'Retry' },
      errors: { page: { title: 'This page could not be displayed.', description: 'Something went wrong.' } },
    },
    ro: {
      common: { retry: 'Reîncearcă' },
      errors: { page: { title: 'Pagina nu a putut fi afișată.', description: 'A apărut o eroare.' } },
    },
  },
})

function mountPageError() {
  return mount(BasePageError, { global: { plugins: [i18n], stubs: { UAlert: UAlertStub, UButton: UButtonStub } } })
}

describe('BasePageError', () => {
  it('explains that the page failed without exposing the error itself', () => {
    const wrapper = mountPageError()

    expect(wrapper.find('h3').text()).toBe('This page could not be displayed.')
    expect(wrapper.find('p').text()).toBe('Something went wrong.')
  })

  it('asks the boundary to retry when the retry button is pressed', async () => {
    const wrapper = mountPageError()

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
