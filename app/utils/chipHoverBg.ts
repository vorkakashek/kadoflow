/** Scale-in chip fill from the pointer (or center on keyboard focus). */

export function setChipBgOrigin(
  el: HTMLElement,
  e: PointerEvent | FocusEvent,
) {
  if (!('clientX' in e)) {
    el.style.setProperty('--chip-bg-x', '50%')
    el.style.setProperty('--chip-bg-y', '50%')
    return
  }
  const box = el.getBoundingClientRect()
  const w = box.width || 1
  const h = box.height || 1
  el.style.setProperty('--chip-bg-x', `${((e.clientX - box.left) / w) * 100}%`)
  el.style.setProperty('--chip-bg-y', `${((e.clientY - box.top) / h) * 100}%`)
}
