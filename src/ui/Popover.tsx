import { estadoControlWeb } from './estadoControl'
import { useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  Text,
  View,
  type View as RNView,
} from 'react-native'
import { HAY_MENU_NATIVO, Menu } from './Menu'
import { ICON_COLOR, IconCheck, IconChevronDown, IconChevronUp } from './icons'

export type PopoverOption<T> = { value: T; label: string }

type Props<T> = {
  value: T
  options: PopoverOption<T>[]
  onChange: (value: T) => void
  label?: string
  /** Se dibuja antes del texto en el disparador. */
  icon?: React.ReactNode
  /**
   * Texto del disparador cuando el de la opción elegida no entra.
   * `''` deja el botón solo con el ícono.
   */
  display?: string
  /** Necesario cuando el disparador queda solo con el ícono. */
  accessibilityLabel?: string
}

const MENU_W = 210
const ROW_H = 44
const GAP = 8

/**
 * Menú anclado al botón que lo abre.
 *
 * Se despliega hacia arriba si no hay lugar abajo, y viceversa: la posición se
 * mide en el momento de abrir con `measureInWindow`, así el menú queda pegado
 * al disparador en vez de anclado al borde de la pantalla.
 *
 * Va dentro de un Modal porque los paneles de la app tienen `overflow: hidden`
 * y un menú posicionado en el árbol normal quedaría recortado por su contenedor.
 * El Modal lo dibuja por encima de todo; las coordenadas medidas son de ventana,
 * que es justo el sistema de referencia que el Modal usa.
 */
export function Popover<T extends string | number>({
  value,
  options,
  onChange,
  label,
  icon,
  display,
  accessibilityLabel,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 })
  const ref = useRef<RNView>(null)
  const selected = options.find((o) => o.value === value)
  const text = display ?? selected?.label ?? '—'

  const menuH = options.length * ROW_H

  /*
   * En iOS, el menú del sistema — el mismo `UIMenu` de los tres puntos.
   *
   * Ocho idiomas no son demasiados para un menú: iOS los desplaza solo si no
   * entran, y para elegir un valor entre varios es el control correcto. Lo que
   * había antes era un action sheet, que sube desde abajo y tapa media pantalla
   * para algo que no interrumpe nada — encima acá el elegido se marcaba
   * escribiéndole un «✓» adentro del texto, porque un action sheet no tiene
   * estado seleccionado. El menú sí: el ✓ lo pone el sistema, alineado, como en
   * cualquier otra app.
   */
  /*
   * El disparador, dibujado una sola vez.
   *
   * Antes había dos: éste, y un `Label` de SwiftUI que repetía ícono y texto
   * en el idioma de iOS. Con el menú en UIKit el disparador ya no lo dibuja
   * SwiftUI, así que la píldora que se ve en la web y en Android es la misma
   * que se ve en el teléfono — un solo lugar donde cambiarla.
   */
  const disparador = (dirigida: boolean) => (
    <View className="flex-row items-center gap-2 rounded-full bg-muted px-4 py-2.5">
      {icon}
      {label && <Text className="text-muted-foreground text-caption1">{label}</Text>}
      {text !== '' && <Text className="text-foreground text-footnote font-medium">{text}</Text>}
      {dirigida ? (
        <IconChevronUp size={14} color={ICON_COLOR.muted} />
      ) : (
        <IconChevronDown size={14} color={ICON_COLOR.muted} />
      )}
    </View>
  )

  if (HAY_MENU_NATIVO) {
    return (
      <Menu
        label={accessibilityLabel ?? label ?? 'Elegir'}
        trigger={disparador(false)}
        items={options.map((o) => ({
          label: o.label,
          onPress: () => onChange(o.value),
          selected: o.value === value,
        }))}
      />
    )
  }

  const openMenu = () => {
    ref.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h })
      setOpen(true)
    })
  }

  // Arriba por defecto; si no entra, abajo.
  const above = anchor.y - menuH - GAP >= 8
  const top = above ? anchor.y - menuH - GAP : anchor.y + anchor.h + GAP
  const left = Math.max(8, anchor.x)

  return (
    <>
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        onPress={openMenu}
        className="active:opacity-80"
      >
        {disparador(above)}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* El fondo que cierra va como hermano del menú: envolviéndolo, cada
            opción quedaría dentro de un Pressable y en web eso genera un
            <button> dentro de otro <button>. */}
        <View className="flex-1">
          <Pressable
            accessibilityRole="button"
            {...estadoControlWeb('none')}
            accessibilityLabel="Cerrar el menú"
            onPress={() => setOpen(false)}
            className="absolute inset-0"
          />
          <View
            style={{ position: 'absolute', top, left, width: MENU_W }}
            className="overflow-hidden rounded-xl bg-card"
          >
            {options.map((o, i) => {
              const active = o.value === value
              return (
                <Pressable
                  key={String(o.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                  style={{ height: ROW_H }}
                  className={`flex-row items-center justify-between px-4 active:bg-muted ${
                    i > 0 ? 'border-t border-muted' : ''
                  }`}
                >
                  <Text
                    className={`text-subheadline ${active ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
                  >
                    {o.label}
                  </Text>
                  {active && <IconCheck size={14} color={ICON_COLOR.foreground} />}
                </Pressable>
              )
            })}
          </View>
        </View>
      </Modal>
    </>
  )
}
