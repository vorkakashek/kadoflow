/**
 * SPA visits to home skip the hero entrance and boot the swarm immediately,
 * so balls are already moving when the page (or menu iris) reveals.
 */
export default defineNuxtPlugin(() => {
  const router = useRouter()
  const { skipHeroIntro } = usePageCanvas()
  router.beforeEach((to, from) => {
    if (to.path !== '/') return
    if (!from.matched.length) return
    if (from.path === '/') return
    skipHeroIntro.value = true
  })
})
