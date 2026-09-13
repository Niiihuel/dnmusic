import { Fragment, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import {
  Button,
  ContextMenu,
  ControlGroup,
  Divider,
  Host,
  Image,
  Menu,
  RNHostView,
  Text,
  Toggle,
} from '@expo/ui/swift-ui'
import { accessibilityLabel, buttonStyle, contentShape, disabled, frame, shapes } from '@expo/ui/swift-ui/modifiers'
import type { ReactNode } from 'react'
import type { SFSymbol } from 'sf-symbols-typescript'
import type { MenuItem } from './Menu'
import type { MenuNativoProps } from './MenuNativo.types'
import { llevaCorte, repartirMenu } from './menuReparto'
import { ICON_COLOR } from './icons'
import { HAY_CONTEXTO_COLECCION, MenuContextualColeccion, prepararMenuContextual } from './MenuContextualColeccion'
import { BotonMenuNativo } from '../../modules/native-menu'

export const HAY_MENU_NATIVO = true

const areaTactil = [frame({ minWidth: 44, minHeight: 44 }), contentShape(shapes.rectangle())]

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
      <Button
        role={item.destructive ? 'destructive' : 'default'}
        onPress={item.disabled ? undefined : item.onPress}
        modifiers={[disabled(!!item.disabled)]}
      >
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
      onPress={item.disabled ? undefined : item.onPress}
      modifiers={[disabled(!!item.disabled)]}
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
function Opciones({ items, deshabilitado = false }: { items: MenuItem[]; deshabilitado?: boolean }) {
  // iOS muestra las opciones indisponibles atenuadas. El menú de respaldo
  // conserva su reparto actual, que las oculta.
  const { rapidas, lista } = repartirMenu(
    deshabilitado ? items.map((item) => ({ ...item, disabled: true })) : items,
    true,
  )
  return (
    <>
      {rapidas.length ? (
        <>
          <ControlGroup>
            {rapidas.map((item, index) => (
              <Button
                key={`${index}:${item.label}`}
                label={item.label}
                systemImage={item.sfSymbol}
                onPress={item.disabled ? undefined : item.onPress}
                modifiers={[disabled(!!item.disabled)]}
              />
            ))}
          </ControlGroup>
          <Divider />
        </>
      ) : null}
      {lista.map((item, index) => (
        <Fragment key={`${index}:${item.label}`}>
          {llevaCorte(lista, index) ? <Divider /> : null}
          {item.items?.length ? (
            <Menu label={item.label} systemImage={item.sfSymbol} modifiers={[disabled(!!item.disabled)]}>
              <Opciones items={item.items} deshabilitado={item.disabled} />
            </Menu>
          ) : item.selected !== undefined ? (
            <Toggle
              label={item.label}
              systemImage={item.sfSymbol}
              isOn={item.selected}
              onIsOnChange={item.disabled ? undefined : item.onPress}
              modifiers={[disabled(!!item.disabled)]}
            />
          ) : (
            <Fila item={item} />
          )}
        </Fragment>
      ))}
    </>
  )
}

/**
 * El menú del sistema, en UIKit.
 *
 * Es el mismo `UIMenu` que ya presenta la pulsación larga de las filas, con el
 * mismo traductor: lo único distinto es el disparador. Acá no hay `RNHostView`
 * ni alturas viajando de SwiftUI a Yoga — la lámina se estira sobre lo que RN
 * ya dibujó, o dibuja ella sola el glifo del sistema cuando no hay nada debajo.
 *
 * `onOpen` congela qué hace cada fila en el momento de abrir: si la pantalla se
 * vuelve a dibujar con el menú abierto, quien está eligiendo sigue eligiendo
 * sobre lo que vio.
 */
function MenuUIKit({
  items,
  label,
  size,
  symbol,
  fullWidth,
  children,
  disabled: estaDeshabilitado,
}: {
  items: MenuItem[]
  label: string
  size: number
  symbol?: SFSymbol
  fullWidth: boolean
  children?: ReactNode
  disabled: boolean
}) {
  const preparado = useMemo(() => prepararMenuContextual(items), [items])
  const abiertas = useRef(preparado.acciones)
  if (!BotonMenuNativo) return <>{children}</>
  return (
    <View
      collapsable={false}
      style={children ? (fullWidth ? { width: '100%' } : undefined) : { width: 44, height: 44 }}
    >
      {children}
      <BotonMenuNativo
        style={StyleSheet.absoluteFill}
        items={preparado.items}
        menuLabel={label}
        symbol={children ? undefined : symbol}
        symbolSize={size}
        symbolColor={ICON_COLOR.muted}
        disabled={estaDeshabilitado}
        onOpen={() => {
          abiertas.current = preparado.acciones
        }}
        onSelect={(event) => abiertas.current.get(event.nativeEvent.id)?.()}
      />
    </View>
  )
}

/** SwiftUI administra el gesto, la elevación, los submenús y la respuesta háptica. */
export function MenuNativo({
  items,
  label = 'Opciones',
  size = 17,
  symbol = 'ellipsis',
  children,
  longPress = false,
  fullWidth = false,
  disabled: estaDeshabilitado = false,
}: MenuNativoProps) {
  const [width, setWidth] = useState(0)
  if (estaDeshabilitado && longPress) return <>{children}</>
  if (children && longPress && fullWidth && HAY_CONTEXTO_COLECCION) {
    return <MenuContextualColeccion items={items}>{children}</MenuContextualColeccion>
  }
  /*
   * El disparador que se toca va por UIKit; SwiftUI queda de respaldo.
   *
   * El respaldo es para los binarios que no traen el módulo: una actualización
   * sólo de JS no lo incorpora. Con el módulo presente, ningún menú que se toca
   * pasa por SwiftUI.
   */
  if (BotonMenuNativo && !longPress) {
    return (
      <MenuUIKit items={items} label={label} size={size} symbol={symbol} fullWidth={fullWidth} disabled={estaDeshabilitado}>
        {children}
      </MenuUIKit>
    )
  }
  const trigger = children ? (
    <RNHostView matchContents>
      <View collapsable={false} style={{ minWidth: 44, minHeight: 44, ...(fullWidth ? { width } : {}) }}>
        {children}
      </View>
    </RNHostView>
  ) : (
    <Image systemName={symbol} size={size} color={ICON_COLOR.muted} modifiers={areaTactil} />
  )
  const contenido = (
    <Host
      colorScheme="dark"
      seedColor={ICON_COLOR.foreground}
      ignoreSafeArea="all"
      matchContents={children ? (fullWidth ? { vertical: true } : true) : false}
      style={children ? (fullWidth ? { width } : undefined) : { height: 44, minWidth: 44 }}
    >
      {longPress ? (
        <ContextMenu>
          <ContextMenu.Trigger>{trigger}</ContextMenu.Trigger>
          <ContextMenu.Items>
            <Opciones items={items} />
          </ContextMenu.Items>
        </ContextMenu>
      ) : (
        <Menu label={trigger} modifiers={[buttonStyle('plain'), accessibilityLabel(label), disabled(estaDeshabilitado)]}>
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
