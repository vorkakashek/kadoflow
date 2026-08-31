type ResponsiveMediaPreset = {
  width: number
  height: number
  webpSrcset: string
  avifSrcset: string
  sizes: string
}

const presets: Record<string, ResponsiveMediaPreset> = {
  '/home/cases/keys-store/keys-1.webp': {
    width: 2079,
    height: 1296,
    webpSrcset: '/home/cases/keys-store/keys-1-480.webp 480w, /home/cases/keys-store/keys-1-960.webp 960w, /home/cases/keys-store/keys-1-1440.webp 1440w, /home/cases/keys-store/keys-1-2079.webp 2079w',
    avifSrcset: '/home/cases/keys-store/keys-1-480.avif 480w, /home/cases/keys-store/keys-1-960.avif 960w, /home/cases/keys-store/keys-1-1440.avif 1440w, /home/cases/keys-store/keys-1-2079.avif 2079w',
    sizes: '(max-width: 767px) 92vw, 50vw',
  },
  '/home/cases/keys-store/keys-2.png': {
    width: 286,
    height: 4096,
    webpSrcset: '/home/cases/keys-store/keys-2-286.webp 286w',
    avifSrcset: '/home/cases/keys-store/keys-2-286.avif 286w',
    sizes: '(max-width: 767px) 92vw, 50vw',
  },
  '/home/cases/keys-store/keys-3.png': {
    width: 2110,
    height: 1133,
    webpSrcset: '/home/cases/keys-store/keys-3-480.webp 480w, /home/cases/keys-store/keys-3-960.webp 960w, /home/cases/keys-store/keys-3-1440.webp 1440w, /home/cases/keys-store/keys-3-2110.webp 2110w',
    avifSrcset: '/home/cases/keys-store/keys-3-480.avif 480w, /home/cases/keys-store/keys-3-960.avif 960w, /home/cases/keys-store/keys-3-1440.avif 1440w, /home/cases/keys-store/keys-3-2110.avif 2110w',
    sizes: '(max-width: 767px) 92vw, 50vw',
  },
}

/**
 * Decorate localized content with generated delivery candidates. The content
 * stays readable and source-led; asset metadata has one shared authority.
 */
export function attachResponsiveMedia<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => attachResponsiveMedia(item)) as T
  }
  if (!value || typeof value !== 'object') return value

  const next: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    next[key] = attachResponsiveMedia(child)
  }
  const src = typeof next.src === 'string' ? next.src : ''
  const preset = presets[src]
  return (preset ? { ...next, ...preset } : next) as T
}
