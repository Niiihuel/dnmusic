import { useEffect, useRef } from 'react'
import { View } from 'react-native'
import type { MenuKeyboardScopeProps } from './MenuKeyboardScope'

/** Un mismo recorrido para botones, clic derecho y el menú del teclado. */
export function MenuKeyboardScope({ children, onClose, subMenu, onCloseSub }: MenuKeyboardScopeProps) {
  const root = useRef<View>(null)
  const parentItem = useRef<HTMLElement | null>(null)
  const previousSub = useRef<number | null>(null)
  useEffect(() => {
    const element = root.current as unknown as HTMLElement | null
    if (!element) return
    const returning = previousSub.current !== null && subMenu === null
    if (subMenu !== null) parentItem.current = document.activeElement as HTMLElement | null
    previousSub.current = subMenu
    const frame = requestAnimationFrame(() => {
      if (returning && parentItem.current?.isConnected) parentItem.current.focus()
      else {
        const menus = element.querySelectorAll<HTMLElement>('[role="menu"]')
        const menu = menus[subMenu === null ? 0 : menus.length - 1]
        menu?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [subMenu])

  function onKeyDown(e: KeyboardEvent) {
    if (e.defaultPrevented) return
    const active = document.activeElement as HTMLElement | null
    const menu = active?.closest('[role="menu"]')
    const items = Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])
    const index = items.indexOf(active!)
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault(); e.stopPropagation(); onClose(); return
    }
    if (e.key === 'ArrowLeft' && subMenu !== null) {
      e.preventDefault(); onCloseSub(); return
    }
    if (!items.length) return
    if (e.key === 'Enter' || e.key === ' ' || (e.key === 'ArrowRight' && active?.getAttribute('aria-haspopup') === 'menu')) {
      e.preventDefault(); active?.click(); return
    }
    const next = e.key === 'ArrowDown' ? (index + 1) % items.length
      : e.key === 'ArrowUp' ? (index - 1 + items.length) % items.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : -1
    if (next >= 0) {
      e.preventDefault(); items[next].focus(); items[next].scrollIntoView({ block: 'nearest' })
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ordered = [...items.slice(index + 1), ...items.slice(0, index + 1)]
      const match = ordered.find(item => item.textContent?.trim().toLocaleLowerCase().startsWith(e.key.toLocaleLowerCase()))
      if (match) { e.preventDefault(); match.focus() }
    }
  }
  return <View ref={root} className="flex-1" {...({ onKeyDown } as object)}>{children}</View>
}
