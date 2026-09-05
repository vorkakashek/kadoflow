const MOBILE_FAB_SIZE_PX = 42

export function useMobileFabGeometry() {
  const bottomExtra = useState<number>('mobile-fab-bottom-extra', () => 0)
  const style = computed(() => ({
    bottom: `calc(${bottomExtra.value}px + 2 * var(--layout-margin) + var(--safe-bottom, 0px))`,
    height: `${MOBILE_FAB_SIZE_PX}px`,
    minHeight: `${MOBILE_FAB_SIZE_PX}px`,
    maxHeight: `${MOBILE_FAB_SIZE_PX}px`,
  }))

  return {
    bottomExtra,
    style,
  }
}
