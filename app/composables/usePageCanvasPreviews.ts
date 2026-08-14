/**
 * Clears any leftover tile thumbs when Page Canvas closes.
 * While closed, tiles are stubs; the only fresh “screenshot” is the live dock on open.
 */
export function usePageCanvasPreviews() {
  const previews = useState<Record<string, string>>(
    'page-canvas-previews',
    () => ({}),
  )

  function clearAllPreviews() {
    for (const url of Object.values(previews.value)) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    }
    previews.value = {}
  }

  return {
    clearAllPreviews,
  }
}
