let caseDetailRouteWarmup: Promise<void> | null = null

/**
 * Warm the shared `/projects/:id` page once per client session.
 * Every case detail uses the same route component, so the first matching path
 * prepares the route graph for all case IDs without touching their heavy media.
 */
export function warmCaseDetailRoute(to: string): Promise<void> {
  if (!import.meta.client) return Promise.resolve()

  caseDetailRouteWarmup ??= preloadRouteComponents(to).catch(() => {
    // A transient dev transform/HMR failure should not poison later attempts.
    caseDetailRouteWarmup = null
  })

  return caseDetailRouteWarmup
}
