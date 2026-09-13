// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import BasePageBoundary from './BasePageBoundary.vue'

// Stand-in for Nuxt's NuxtErrorBoundary: same slots and exposed clearError, with the
// captured error driven by the test instead of a real render failure.
const pageFailed = ref(false)
const NuxtErrorBoundaryStub = defineComponent({
  setup(_props, { slots, expose }) {
    const clearError = () => { pageFailed.value = false }
    expose({ clearError })
    return () => (pageFailed.value
      ? slots.error?.({ error: new Error('page crashed'), clearError })
      : slots.default?.())
  },
})

const UAlertStub = defineComponent({
  props: { title: { type: String, default: '' } },
  setup(props, { slots }) {
    return () => h('div', { class: 'page-error' }, [h('h3', props.title), slots.actions?.()])
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
    en: { common: { retry: 'Retry' }, errors: { page: { title: 'This page could not be displayed.', description: '' } } },
    ro: { common: { retry: 'Reîncearcă' }, errors: { page: { title: 'Pagina nu a putut fi afișată.', description: '' } } },
  },
})

const route = reactive({ path: '/children' })

function mountBoundary() {
  return mount(BasePageBoundary, {
    slots: { default: () => h('p', { class: 'page' }, 'Children page') },
    global: {
      plugins: [i18n],
      stubs: { NuxtErrorBoundary: NuxtErrorBoundaryStub, UAlert: UAlertStub, UButton: UButtonStub },
    },
  })
}

describe('BasePageBoundary', () => {
  beforeEach(() => {
    pageFailed.value = false
    route.path = '/children'
    vi.stubGlobal('useRoute', () => route)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the page while it is healthy', () => {
    const wrapper = mountBoundary()

    expect(wrapper.find('.page').exists()).toBe(true)
    expect(wrapper.find('.page-error').exists()).toBe(false)
  })

  it('replaces a crashed page with the error panel and restores it on retry', async () => {
    const wrapper = mountBoundary()
    pageFailed.value = true
    await nextTick()
    expect(wrapper.find('.page-error').exists()).toBe(true)

    await wrapper.find('button').trigger('click')

    expect(wrapper.find('.page').exists()).toBe(true)
  })

  it('clears the error panel when the user navigates to another page', async () => {
    const wrapper = mountBoundary()
    pageFailed.value = true
    await nextTick()

    route.path = '/groups'
    await nextTick()
    await nextTick()

    expect(wrapper.find('.page-error').exists()).toBe(false)
    expect(wrapper.find('.page').exists()).toBe(true)
  })
})
