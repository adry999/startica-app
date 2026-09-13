import { useI18n } from 'vue-i18n'
import { appErrorMessageKey, type AppError } from '@core/errors/app-error'

export function useAppErrorMessage() {
  const { t, te } = useI18n()

  return function describeAppError(error: AppError): string {
    const messageKey = appErrorMessageKey(error)
    return te(messageKey) ? t(messageKey) : t('errors.refused.rejected')
  }
}
