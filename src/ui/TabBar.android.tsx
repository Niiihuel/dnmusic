import { View } from 'react-native'
import { Badge, BadgedBox, Icon, NavigationBar, NavigationBarItem, Text } from '@expo/ui/jetpack-compose'
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers'
import { AndroidHost, androidAccessibility } from './AndroidHost'
import { useIrATab } from './TabBar.shared'
import { usePendientesChats } from '../state/session'
import type { Tab } from '../state/shell'
import { ANDROID_COLORS as color, ANDROID_TYPE } from './androidDesign'
export { useIrATab, FilaChat } from './TabBar.shared'

const tabs = [
  { id: 'inicio', label: 'Inicio', source: require('../../assets/android-nav/home.xml') },
  { id: 'listas', label: 'Listas', source: require('../../assets/android-nav/library.xml') },
  { id: 'chats', label: 'Chats', source: require('../../assets/android-nav/chats.xml') },
  { id: 'perfil', label: 'Perfil', source: require('../../assets/android-nav/profile.xml') },
  { id: 'buscar', label: 'Buscar', source: require('../../assets/android-nav/search.xml') },
] as const

const COLORES = {
  selectedIconColor: color.strong,
  selectedTextColor: color.text,
  selectedIndicatorColor: color.raised,
  unselectedIconColor: color.muted,
  unselectedTextColor: color.muted,
} as const

/** Una sola NavigationBar Material 3: destinos, búsqueda e insets pertenecen a la misma superficie. */
export function TabPildora({ active }: { active: Tab }) {
  const ir = useIrATab()
  const unread = usePendientesChats()

  return <View style={{ width: '100%', backgroundColor: color.surface, boxShadow: '0 -2px 6px rgba(0,0,0,0.18), 0 -8px 20px rgba(0,0,0,0.12)' }}>
    <AndroidHost style={{ width: '100%', height: 80 }} modifiers={[{ $type: 'dnmusicOwnedInsets' }]}>
      <NavigationBar containerColor={color.surface} contentColor={color.text} tonalElevation={0} modifiers={[fillMaxWidth()]}>
        {tabs.map(tab => {
          const selected = active === tab.id
          const count = tab.id === 'chats' ? Math.min(unread, 99) : 0
          const icon = <Icon source={tab.source} size={24} tint={selected ? color.strong : color.muted} />
          return <NavigationBarItem key={tab.id} selected={selected} alwaysShowLabel onClick={() => ir(tab.id)}
            colors={COLORES}
            modifiers={[androidAccessibility(count ? `${tab.label}, ${unread} sin leer` : tab.label, selected ? 'Seleccionado' : undefined)]}>
            <NavigationBarItem.Icon>
              {count ? <BadgedBox>
                {icon}
                <BadgedBox.Badge><Badge containerColor="#FFFFFF" contentColor="#121212"><Text>{count}</Text></Badge></BadgedBox.Badge>
              </BadgedBox> : icon}
            </NavigationBarItem.Icon>
            <NavigationBarItem.Label><Text style={ANDROID_TYPE.caption}>{tab.label}</Text></NavigationBarItem.Label>
          </NavigationBarItem>
        })}
      </NavigationBar>
    </AndroidHost>
  </View>
}
