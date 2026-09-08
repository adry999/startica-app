// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'
import BasePagination from './BasePagination.vue'

// Stand-in for Nuxt UI's UPagination — mirrors only the public contract
// (`page`, `items-per-page`, `total` props; `update:page` emit) BasePagination
// relies on, so the test doesn't depend on Nuxt UI's internal rendering.
const UPaginationStub = defineComponent({
  props: {
    page: { type: Number, required: true },
    itemsPerPage: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  emits: ['update:page'],
  setup(props, { emit }) {
    return () => h('button', { class: 'pager-next', onClick: () => emit('update:page', props.page + 1) }, 'next')
  },
})

const i18n = createI18n<false>({
  legacy: false,
  locale: 'en',
  messages: {
    en: { common: { pagination: { perPage: 'per page', all: 'All' } } },
    ro: { common: { pagination: { perPage: 'pe pagină', all: 'Toate' } } },
  },
})

const mountOptions = { global: { plugins: [i18n], stubs: { UPagination: UPaginationStub } } }

describe('BasePagination', () => {
  it('renders the summary slot with computed from/to/total', () => {
    const wrapper = mount(BasePagination, {
      props: { page: 2, pageSize: 10, total: 25 },
      slots: { summary: (p: { from: number; to: number; total: number }) => `Showing ${p.from}-${p.to} of ${p.total}` },
      ...mountOptions,
    })
    expect(wrapper.text()).toContain('Showing 11-20 of 25')
  })

  it('hides the pager when total fits on one page', () => {
    const wrapper = mount(BasePagination, {
      props: { page: 1, pageSize: 10, total: 5 },
      slots: { summary: () => 'Showing 1-5 of 5' },
      ...mountOptions,
    })
    expect(wrapper.find('.pager-next').exists()).toBe(false)
  })

  it('emits update:page when the pager changes page', async () => {
    const wrapper = mount(BasePagination, {
      props: { page: 1, pageSize: 10, total: 25 },
      slots: { summary: () => 'Showing 1-10 of 25' },
      ...mountOptions,
    })
    await wrapper.find('.pager-next').trigger('click')
    expect(wrapper.emitted('update:page')).toEqual([[2]])
  })

  it('offers the configured sizes plus an All option', () => {
    const wrapper = mount(BasePagination, {
      props: { page: 1, pageSize: 25, total: 104 },
      slots: { summary: () => '' },
      ...mountOptions,
    })
    const values = wrapper.findAll('option').map(o => o.attributes('value'))
    expect(values).toEqual(['10', '25', '50', '100', 'all'])
    expect(wrapper.find('select').element.value).toBe('25')
  })

  it('accepts custom page-size options', () => {
    const wrapper = mount(BasePagination, {
      props: { page: 1, pageSize: 20, total: 104, pageSizeOptions: [20, 40] },
      slots: { summary: () => '' },
      ...mountOptions,
    })
    expect(wrapper.findAll('option').map(o => o.attributes('value'))).toEqual(['20', '40', 'all'])
  })

  it('emits the new size and resets to page 1 when the size changes', async () => {
    const wrapper = mount(BasePagination, {
      props: { page: 5, pageSize: 10, total: 104 },
      slots: { summary: () => '' },
      ...mountOptions,
    })
    const select = wrapper.find('select')
    select.element.value = '50'
    await select.trigger('change')
    expect(wrapper.emitted('update:pageSize')).toEqual([[50]])
    expect(wrapper.emitted('update:page')).toEqual([[1]])
  })

  it("emits 'all' rather than a sentinel number", async () => {
    const wrapper = mount(BasePagination, {
      props: { page: 1, pageSize: 10, total: 104 },
      slots: { summary: () => '' },
      ...mountOptions,
    })
    const select = wrapper.find('select')
    select.element.value = 'all'
    await select.trigger('change')
    expect(wrapper.emitted('update:pageSize')).toEqual([['all']])
  })

  it("shows every row and hides the pager when size is 'all'", () => {
    const wrapper = mount(BasePagination, {
      props: { page: 1, pageSize: 'all' as const, total: 104 },
      slots: { summary: (p: { from: number; to: number; total: number }) => `${p.from}-${p.to}/${p.total}` },
      ...mountOptions,
    })
    expect(wrapper.text()).toContain('1-104/104')
    expect(wrapper.find('.pager-next').exists()).toBe(false)
  })

  it('reports 0-0 when there are no rows', () => {
    const wrapper = mount(BasePagination, {
      props: { page: 1, pageSize: 10, total: 0 },
      slots: { summary: (p: { from: number; to: number; total: number }) => `${p.from}-${p.to}/${p.total}` },
      ...mountOptions,
    })
    expect(wrapper.text()).toContain('0-0/0')
  })

  it('can hide the rows-per-page control', () => {
    const wrapper = mount(BasePagination, {
      props: { page: 1, pageSize: 10, total: 25, hidePageSize: true },
      slots: { summary: () => '' },
      ...mountOptions,
    })
    expect(wrapper.find('select').exists()).toBe(false)
  })
})
