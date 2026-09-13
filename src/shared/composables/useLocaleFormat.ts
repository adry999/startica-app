import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const intlLocaleByAppLocale: Record<string, string> = { ro: 'ro-RO', en: 'en-GB' }

export function useLocaleFormat() {
  const { locale } = useI18n()
  const intlLocale = computed(() => intlLocaleByAppLocale[locale.value] ?? 'ro-RO')

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat(intlLocale.value, { style: 'currency', currency: 'RON' }).format(amount)
  }

  // Postgres `date` values carry no time zone; formatting them in UTC keeps
  // 2026-09-01 from rendering as 31 August in zones west of Greenwich.
  function formatCalendarDate(calendarDate: string): string {
    return new Date(calendarDate).toLocaleDateString(intlLocale.value, { timeZone: 'UTC' })
  }

  return { formatCurrency, formatCalendarDate }
}
