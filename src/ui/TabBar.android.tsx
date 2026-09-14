import { View } from 'react-native'
import { NavigationBar, NavigationBarItem, Text } from '@expo/ui/jetpack-compose'
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers'
import { AndroidHost, androidAccessibility } from './AndroidHost'
import { AndroidIcon } from './AndroidIcon'
import { IconButton } from './IconButton'
import { useIrATab } from './TabBar.shared'
import { usePendientesChats } from '../state/session'
import type { Tab } from '../state/shell'
export { useIrATab, FilaChat } from './TabBar.shared'

const tabs = [
  { id: 'inicio', label: 'Inicio', symbol: 'house' }, { id: 'listas', label: 'Listas', symbol: 'music.note.list' },
  { id: 'chats', label: 'Chats', symbol: 'bubble.left.and.bubble.right' }, { id: 'perfil', label: 'Perfil', symbol: 'person.crop.circle' },
] as const

export function TabPildora({ active }: { active: Tab }) {
  const ir = useIrATab()
  const unread = usePendientesChats()
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
    <View style={{ flex: 1, borderRadius: 32, overflow: 'hidden', backgroundColor: '#242426' }}>
      <AndroidHost matchContents={{ vertical: true }} style={{ width: '100%', minHeight: 80 }} modifiers={[{ $type: 'dnmusicOwnedInsets' }]}>
        <NavigationBar containerColor="#242426" tonalElevation={0} modifiers={[fillMaxWidth()]}>
          {tabs.map(tab => <NavigationBarItem key={tab.id} selected={active === tab.id} onClick={() => ir(tab.id)}
            colors={{ selectedIconColor: '#FFFFFF', selectedTextColor: '#FFFFFF', selectedIndicatorColor: '#414145',
              unselectedIconColor: '#B3B3B3', unselectedTextColor: '#B3B3B3' }}
            modifiers={[androidAccessibility(tab.id === 'chats' && unread ? `Chats, ${unread} sin leer` : tab.label)]}>
            <NavigationBarItem.Icon><AndroidIcon symbol={tab.symbol} color={active === tab.id ? '#FFFFFF' : '#B3B3B3'} /></NavigationBarItem.Icon>
            <NavigationBarItem.Label><Text style={{ fontSize: 11 }}>{tab.label}{tab.id === 'chats' && unread ? ` · ${Math.min(unread, 99)}` : ''}</Text></NavigationBarItem.Label>
          </NavigationBarItem>)}
        </NavigationBar>
      </AndroidHost>
    </View>
    <IconButton label="Buscar música" symbol="magnifyingglass" variant="glass" lado={52} selected={active === 'buscar'} onPress={() => ir('buscar')} />
  </View>
}
