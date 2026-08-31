import { localizeHomeCases } from '~/utils/homeCases'
import { localizeProjectCaseDetails } from '~/utils/projectCaseDetails'
import { projectDetailLocaleLoaders } from '~/generated/locales/manifest'

export function useHomeCases() {
  const { locale, tm } = useI18n()
  return computed(() => {
    locale.value
    return localizeHomeCases(tm('projects.items'))
  })
}

export async function useProjectCaseDetails() {
  const { locale } = useI18n()
  const copy = shallowRef(await projectDetailLocaleLoaders[locale.value]())

  watch(locale, async (nextLocale) => {
    copy.value = await projectDetailLocaleLoaders[nextLocale]()
  })

  return computed(() => localizeProjectCaseDetails(copy.value))
}
