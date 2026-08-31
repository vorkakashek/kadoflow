import type { LocaleCode } from '~/generated/locales/manifest'

export type LocaleApi = {
  locale: Ref<LocaleCode>
  setLocale: (locale: LocaleCode) => Promise<void>
  t: (key: string, params?: Record<string, string | number>) => string
  tm: (key: string) => unknown
}

export function useI18n(): LocaleApi {
  return useNuxtApp().$localeApi as LocaleApi
}
