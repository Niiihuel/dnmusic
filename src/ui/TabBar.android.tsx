import { View } from 'react-native'
import { Badge, BadgedBox, Icon, NavigationBar, NavigationBarItem, Text } from '@expo/ui/jetpack-compose'
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers'
import { AndroidHost, androidAccessibility } from './AndroidHost'
import { useIrATab } from './TabBar.shared'
import { usePendientesChats } from '../state/session'
import type { Tab } from '../state/shell'
export { useIrATab, FilaChat } from './TabBar.shared'

const tabs = [
  { id: 'inicio', label: 'Inicio', source: require('../../assets/android-nav/home.xml') },
  { id: 'listas', label: 'Listas', source: require('../../assets/android-nav/library.xml') },
  { id: 'chats', label: 'Chats', source: require('../../assets/android-nav/chats.xml') },
  { id: 'perfil', label: 'Perfil', source: require('../../assets/android-nav/profile.xml') },
  { id: 'buscar', label: 'Buscar', source: require('../../assets/android-nav/search.xml') },
] as const

const COLORES = {
  selectedIconColor: '#FFFFFF',
  selectedTextColor: '#FFFFFF',
  selectedIndicatorColor: '#3B3B40',
  unselectedIconColor: '#A9A7AE',
  unselectedTextColor: '#A9A7AE',
} as const

/** Una sola NavigationBar Material 3: destinos, búsqueda e insets pertenecen a la misma superficie. */
export function TabPildora({ active }: { active: Tab }) {
  const ir = useIrATab()
  const unread = usePendientesChats()

  return <View style={{ width: '100%', backgroundColor: '#1C1B1F' }}>
    <AndroidHost style={{ width: '100%', height: 80 }} modifiers={[{ $type: 'dnmusicOwnedInsets' }]}>
      <NavigationBar containerColor="#1C1B1F" contentColor="#FFFFFF" tonalElevation={0} modifiers={[fillMaxWidth()]}>
        {tabs.map(tab => {
          const selected = active === tab.id
          const count = tab.id === 'chats' ? Math.min(unread, 99) : 0
          const icon = <Icon source={tab.source} size={24} tint={selected ? '#FFFFFF' : '#A9A7AE'} />
          return <NavigationBarItem key={tab.id} selected={selected} alwaysShowLabel onClick={() => ir(tab.id)}
            colors={COLORES}
            modifiers={[androidAccessibility(count ? `${tab.label}, ${unread} sin leer` : tab.label, selected ? 'Seleccionado' : undefined)]}>
            <NavigationBarItem.Icon>
              {count ? <BadgedBox>
                {icon}
                <BadgedBox.Badge><Badge containerColor="#FFFFFF" contentColor="#121212"><Text>{count}</Text></Badge></BadgedBox.Badge>
              </BadgedBox> : icon}
            </NavigationBarItem.Icon>
            <NavigationBarItem.Label><Text>{tab.label}</Text></NavigationBarItem.Label>
          </NavigationBarItem>
        })}
      </NavigationBar>
    </AndroidHost>
  </View>
}
