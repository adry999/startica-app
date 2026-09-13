// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ErrorPage from './error.vue'

const UAppStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const UButtonStub = defineComponent({
  emits: ['click'],
  setup(_props, { emit, slots }) {
    return () => h('button', { onClick: () => emit('click') }, slots.default?.())
  },
})

type ErrorPageProps = InstanceType<typeof ErrorPage>['$props']

function mountErrorPage(error: Record<string, unknown>) {
  return mount(ErrorPage, {
    props: { error } as unknown as ErrorPageProps,
    global: { stubs: { UApp: UAppStub, UButton: UButtonStub } },
  })
}

describe('error page', () => {
  const clearError = vi.fn()

  beforeEach(() => {
    clearError.mockReset()
    vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
    vi.stubGlobal('clearError', clearError)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('explains a missing page for a 404', () => {
    const wrapper = mountErrorPage({ status: 404, message: 'Page not found: /nope' })

    expect(wrapper.text()).toContain('errors.page.notFoundTitle')
    expect(wrapper.text()).not.toContain('errors.page.unexpectedTitle')
  })

  it('treats a legacy statusCode-only 404 as a missing page', () => {
    const wrapper = mountErrorPage({ statusCode: 404 })

    expect(wrapper.text()).toContain('errors.page.notFoundTitle')
  })

  it('shows a generic failure without the raw error message for any other status', () => {
    const wrapper = mountErrorPage({ status: 500, message: 'relation "children" does not exist' })

    expect(wrapper.text()).toContain('errors.page.unexpectedTitle')
    expect(wrapper.text()).not.toContain('relation "children" does not exist')
  })

  it('clears the error and returns to the home page', async () => {
    const wrapper = mountErrorPage({ status: 500 })

    await wrapper.find('button').trigger('click')

    expect(clearError).toHaveBeenCalledWith({ redirect: '/' })
  })
})
