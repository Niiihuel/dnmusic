import { Fragment, useState } from 'react'
import { View } from 'react-native'
import {
  Button,
  ContextMenu,
  Divider,
  Host,
  Image,
  Label,
  Menu,
  RNHostView,
  Toggle,
} from '@expo/ui/swift-ui'
import { accessibilityLabel, buttonStyle } from '@expo/ui/swift-ui/modifiers'
import type { MenuItem } from './Menu'
import type { MenuNativoProps } from './MenuNativo.types'
import { ICON_COLOR } from './icons'

export const HAY_MENU_NATIVO = true

function Opciones({ items }: { items: MenuItem[] }) {
  const visibles = items.filter((item) => !item.disabled)
  return visibles.map((item, index) => (
    <Fragment key={item.label}>
      {item.destructive && index > 0 && !visibles[index - 1].destructive ? <Divider /> : null}
      {item.items?.length ? (
        <Menu label={item.label} systemImage={item.sfSymbol}>
          <Opciones items={item.items} />
        </Menu>
      ) : item.selected !== undefined ? (
        <Toggle
          label={item.label}
          systemImage={item.sfSymbol}
          isOn={item.selected}
          onIsOnChange={item.onPress}
        />
      ) : (
        <Button
          label={item.label}
          systemImage={item.sfSymbol}
          role={item.destructive ? 'destructive' : 'default'}
          onPress={item.onPress}
        />
      )}
    </Fragment>
  ))
}

/** SwiftUI administra el gesto, la elevación, los submenús y la respuesta háptica. */
export function MenuNativo({
  items,
  label = 'Opciones',
  size = 17,
  symbol = 'ellipsis',
  text,
  children,
  longPress = false,
  fullWidth = false,
}: MenuNativoProps) {
  const [width, setWidth] = useState(0)
  const trigger = children ? (
    <RNHostView matchContents>
      <View collapsable={false} style={fullWidth ? { width } : undefined}>
        {children}
      </View>
    </RNHostView>
  ) : text ? (
    <Label title={text} systemImage={symbol} color={ICON_COLOR.foreground} />
  ) : (
    <Image systemName={symbol} size={size} color={ICON_COLOR.muted} />
  )
  const contenido = (
    <Host
      colorScheme="dark"
      ignoreSafeArea="all"
      matchContents={
        children ? (fullWidth ? { vertical: true } : true) : text ? { horizontal: true } : false
      }
      style={
        children ? (fullWidth ? { width } : undefined) : { height: 36, minWidth: text ? 92 : 36 }
      }
    >
      {longPress ? (
        <ContextMenu>
          <ContextMenu.Trigger>{trigger}</ContextMenu.Trigger>
          <ContextMenu.Items>
            <Opciones items={items} />
          </ContextMenu.Items>
        </ContextMenu>
      ) : (
        <Menu label={trigger} modifiers={[buttonStyle('plain'), accessibilityLabel(label)]}>
          <Opciones items={items} />
        </Menu>
      )}
    </Host>
  )
  // El ancho lo propone Yoga. Darlo explícitamente al contenido RN evita
  // ciclos de medición y filas recortadas dentro del Host de SwiftUI.
  return fullWidth ? (
    <View
      onLayout={(event) => {
        const ancho = event.nativeEvent.layout.width
        setWidth(ancho)
      }}
    >
      {contenido}
    </View>
  ) : (
    contenido
  )
}
