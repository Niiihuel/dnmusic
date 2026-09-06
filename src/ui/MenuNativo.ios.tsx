import { Fragment, useState } from 'react'
import { View } from 'react-native'
import {
  Button,
  ContextMenu,
  ControlGroup,
  Divider,
  Host,
  Image,
  Label,
  Menu,
  RNHostView,
  Text,
  Toggle,
} from '@expo/ui/swift-ui'
import { accessibilityLabel, buttonStyle } from '@expo/ui/swift-ui/modifiers'
import type { MenuItem } from './Menu'
import type { MenuNativoProps } from './MenuNativo.types'
import { llevaCorte, repartirMenu } from './menuReparto'
import { ICON_COLOR } from './icons'

export const HAY_MENU_NATIVO = true

/**
 * Una fila del menú del sistema.
 *
 * Con subtítulo, el botón lleva **dos textos y la imagen** como etiqueta: es
 * la forma documentada de SwiftUI para que un menú muestre título y subtítulo
 * —el menú saca de la etiqueta el título, el subtítulo y el ícono, en ese
 * orden— y es exactamente lo que dibuja Apple Music debajo de «Ir al álbum».
 * Sin subtítulo alcanza con `label` y `systemImage`, que es más liviano.
 */
function Fila({ item }: { item: MenuItem }) {
  if (item.subtitle) {
    return (
      <Button role={item.destructive ? 'destructive' : 'default'} onPress={item.onPress}>
        <Text>{item.label}</Text>
        <Text>{item.subtitle}</Text>
        {item.sfSymbol ? <Image systemName={item.sfSymbol} /> : <Text>{''}</Text>}
      </Button>
    )
  }
  return (
    <Button
      label={item.label}
      systemImage={item.sfSymbol}
      role={item.destructive ? 'destructive' : 'default'}
      onPress={item.onPress}
    />
  )
}

/**
 * Las opciones, en el orden y con los cortes del menú propio.
 *
 * Es el mismo reparto de `repartirMenu`: las acciones rápidas van primero en
 * un `ControlGroup` —que adentro de un menú SwiftUI dibuja como la fila
 * horizontal de íconos de iOS 16 en adelante—, después la lista con un
 * `Divider` donde el menú propio pone su corte. Así los dos menús ofrecen lo
 * mismo en el mismo lugar, y una fila que se mueve en uno se mueve en el otro.
 */
function Opciones({ items }: { items: MenuItem[] }) {
  const { rapidas, lista } = repartirMenu(items)
  return (
    <>
      {rapidas.length ? (
        <>
          <ControlGroup>
            {rapidas.map((item) => (
              <Button
                key={item.label}
                label={item.label}
                systemImage={item.sfSymbol}
                onPress={item.onPress}
              />
            ))}
          </ControlGroup>
          <Divider />
        </>
      ) : null}
      {lista.map((item, index) => (
        <Fragment key={item.label}>
          {llevaCorte(lista, index) ? <Divider /> : null}
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
            <Fila item={item} />
          )}
        </Fragment>
      ))}
    </>
  )
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
