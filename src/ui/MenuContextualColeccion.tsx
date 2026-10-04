import { useMemo, useRef, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { CollectionContext, type NativeMenuEntry } from '../../modules/collection-controls'
import type { MenuItem } from './Menu'
import { llevaCorte, repartirMenu } from './menuReparto'

export const HAY_CONTEXTO_COLECCION = CollectionContext !== null

let revisionMenuContextual = 0

/** Conserva orden, grupos, selección y disabled, incluidos los submenús. */
export function prepararMenuContextual(items: MenuItem[]) {
  const acciones = new Map<string, () => void>()
  const revision = ++revisionMenuContextual
  let serial = 0
  function convertir(entries: MenuItem[], disabled = false): NativeMenuEntry[] {
    const { rapidas, lista } = repartirMenu(entries, true)
    function entrada(item: MenuItem): NativeMenuEntry {
      const id = `${revision}:${serial++}`
      const bloqueada = disabled || !!item.disabled
      if (!bloqueada && item.onPress) acciones.set(id, item.onPress)
      return { id, label: item.label, symbol: item.sfSymbol, subtitle: item.subtitle,
        destructive: item.destructive, disabled: bloqueada, selected: item.selected,
        ...(item.items?.length ? { children: convertir(item.items, bloqueada) } : {}) }
    }
    const groups: NativeMenuEntry[] = []
    if (rapidas.length) groups.push({ label: '', inline: true, small: true, children: rapidas.map(entrada) })
    let group: NativeMenuEntry[] = []
    lista.forEach((item, index) => {
      if (group.length && llevaCorte(lista, index)) {
        groups.push({ label: '', inline: true, children: group })
        group = []
      }
      group.push(entrada(item))
    })
    if (group.length) groups.push({ label: '', inline: true, children: group })
    return groups
  }
  return { items: convertir(items), acciones }
}

export function MenuContextualColeccion({ items, children, preview, onPreviewPress, previewCornerRadius }: {
  items: MenuItem[]; children: ReactNode
  previewCornerRadius?: number
  preview?: import('../../modules/collection-controls').CollectionPreview
  onPreviewPress?: () => void
}) {
  const preparado = useMemo(() => prepararMenuContextual(items), [items])
  const abiertas = useRef(preparado.acciones)
  if (!CollectionContext) return <>{children}</>
  return <View collapsable={false}>
    <CollectionContext pointerEvents="none" style={StyleSheet.absoluteFill}
      items={preparado.items} previewCornerRadius={previewCornerRadius} preview={preview} onPreviewPress={onPreviewPress}
      onOpen={() => { abiertas.current = preparado.acciones }}
      onSelect={event => abiertas.current.get(event.nativeEvent.id)?.()} />
    {children}
  </View>
}
