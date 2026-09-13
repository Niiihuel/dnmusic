import { Platform, useWindowDimensions } from 'react-native'
import { NativeMediaTabs } from '../../modules/media-controls'
import { usePendientesChats } from '../state/session'
import type { Tab } from '../state/shell'
import { TabPildora as Respaldo, useIrATab } from './TabBar.shared'
export { useIrATab, FilaChat } from './TabBar.shared'

const destinos = new Set<Tab>(['inicio', 'listas', 'chats', 'perfil', 'buscar'])

export function TabPildora({ active }: { active: Tab }) {
  const ir = useIrATab()
  const pendientes = usePendientesChats()
  const { fontScale } = useWindowDimensions()
  const baseHeight = Number.parseInt(String(Platform.Version), 10) >= 26 ? 72 : 60
  const height = baseHeight + Math.max(0, Math.min(fontScale, 2) - 1) * 16
  if (!NativeMediaTabs) return <Respaldo active={active} />
  return <NativeMediaTabs active={active} unread={pendientes} style={{ height, width: '100%' }}
    onSelect={({ nativeEvent: { id } }) => { if (destinos.has(id as Tab)) ir(id as Tab) }} />
}
