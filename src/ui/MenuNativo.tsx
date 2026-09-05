import type { MenuNativoProps } from './MenuNativo.types'

// Metro sustituye este archivo por .ios.tsx en el iPhone.
export const HAY_MENU_NATIVO = false
export function MenuNativo({ children }: MenuNativoProps) {
  return <>{children}</>
}
