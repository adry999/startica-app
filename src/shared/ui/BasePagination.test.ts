// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
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

const mountOptions = { global: { stubs: { UPagination: UPaginationStub } } }

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
})
