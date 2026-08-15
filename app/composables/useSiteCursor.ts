export function useSiteCursor() {
  const suppressed = useState('site-cursor-suppressed', () => false)
  return { suppressed }
}
