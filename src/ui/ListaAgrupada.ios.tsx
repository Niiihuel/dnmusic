import { Button, HStack, Host, Image, Label, LabeledContent, List, Menu, ProgressView, Section, Text, Toggle, VStack } from '@expo/ui/swift-ui'
import {
  accessibilityLabel,
  disabled,
  font,
  foregroundStyle,
  frame,
  listRowSeparator,
  scrollDismissesKeyboard,
  listRowBackground,
  listStyle,
  scrollContentBackground,
  tint,
  toggleStyle,
} from '@expo/ui/swift-ui/modifiers'
import type { FilaAgrupada, ListaAgrupadaProps } from './ListaAgrupada.types'

/**
 * La lista agrupada **del sistema**: el `List` de SwiftUI en `insetGrouped`.
 *
 * Es la misma pieza con la que están hechos los Ajustes de iOS, y trae todo lo
 * que una lista dibujada a mano tiene que reimplementar y nunca termina de
 * emparejar: el retraso del resaltado al tocar, el separador que respeta el
 * sangrado del ícono, el desplazamiento cuando sube el teclado, el índice de
 * VoiceOver, Texto Más Grande, Reducir Movimiento, y el aspecto que Apple le
 * cambie el año que viene.
 *
 * **Las filas se describen, no se pasan como hijos.** Un `Section` solo acepta
 * vistas de SwiftUI: hospedar filas de React Native obligaría a devolverle el
 * alto de cada una desde SwiftUI, que es el circuito de medición que este
 * proyecto ya sacó una vez (README de `modules/collection-controls`). Acá no
 * hay nada que medir dos veces — las dibuja SwiftUI.
 *
 * **La paleta se conserva.** `scrollContentBackground('hidden')` saca el fondo
 * agrupado que SwiftUI pone solo —un gris claro que en esta app sería el único
 * color— y deja ver el `background` de abajo; `listRowBackground` pone el
 * `card` de docs/DESIGN.md, y `seedColor` tiñe de blanco el interruptor y las
 * acciones, que es el acento de esta app. Sin esto el sistema pinta su propio
 * gris y su propio azul.
 */

/** `card` y `background` de docs/DESIGN.md, en hex porque SwiftUI no lee tokens. */
const FILA = '#181818'
const ACENTO = '#FFFFFF'

export function ListaAgrupada({ secciones, label, piso = 24 }: ListaAgrupadaProps) {
  return (
    <Host
      /* La lista llena su panel y desplaza sola: no se mide contra su
         contenido, que la dejaría creciendo sin fin adentro de un scroll. */
      style={{ flex: 1 }}
      useViewportSizeMeasurement
      colorScheme="dark"
      seedColor={ACENTO}
    >
      <List
        modifiers={[
          listStyle('insetGrouped'),
          scrollDismissesKeyboard('interactively'),
          scrollContentBackground('hidden'),
          ...(label ? [accessibilityLabel(label)] : []),
        ]}
      >
        {secciones.map((seccion) => (
          <Section
            key={seccion.id}
            title={seccion.titulo}
            footer={seccion.error || seccion.pie ? <Text>{seccion.error ?? seccion.pie}</Text> : undefined}
          >
            {seccion.filas.map((fila) => (
              <Fila key={fila.id} fila={fila} />
            ))}
          </Section>
        ))}
        <Text modifiers={[frame({ height: piso }), listRowBackground('clear'), listRowSeparator('hidden')]}>{' '}</Text>
      </List>
    </Host>
  )
}

function Fila({ fila }: { fila: FilaAgrupada }) {
  const fondo = [listRowBackground(FILA)]

  if (fila.tipo === 'interruptor') {
    return (
      <Toggle
        isOn={fila.activo}
        onIsOnChange={fila.disabled ? undefined : fila.onCambiar}
        label={fila.rotulo}
        systemImage={fila.symbol}
        modifiers={[...fondo, toggleStyle('switch'), tint(ACENTO), disabled(!!fila.disabled)]}
      />
    )
  }

  if (fila.tipo === 'menu') {
    return (
      <Menu
        modifiers={[...fondo, disabled(!!fila.disabled)]}
        label={
          <LabeledContent
            label={<Rotulo fila={fila} />}
          >
            <HStack spacing={5}>
              <Text>{fila.valor}</Text>
              <Image systemName="chevron.up.chevron.down" />
            </HStack>
          </LabeledContent>
        }
      >
        {fila.opciones.map((opcion) => (
          <Button
            key={opcion.id}
            label={opcion.rotulo}
            systemImage={opcion.seleccionada ? 'checkmark' : opcion.symbol}
            role={opcion.destructiva ? 'destructive' : 'default'}
            onPress={fila.disabled || opcion.disabled ? undefined : () => fila.onElegir(opcion.id)}
            modifiers={[disabled(!!opcion.disabled)]}
          />
        ))}
      </Menu>
    )
  }

  if (fila.tipo === 'accion') {
    /*
     * Con valor a la derecha, el botón envuelve un `LabeledContent`; sin él,
     * alcanza con el rótulo —el hijo de un `Button` tiene que ser una vista, y
     * para un botón de solo texto SwiftUI quiere `label`—.
     *
     * **El chevron no aparece.** Lo dibuja `NavigationLink`, que necesita una
     * pila de navegación de SwiftUI, y acá la navegación es de expo-router: la
     * fila avisa y navega React. Es la diferencia que queda con Ajustes de iOS
     * y hay que saberla antes de mirar la pantalla.
     */
    if (fila.valor !== undefined || fila.lleva || fila.busy) {
      return (
        <Button
          onPress={fila.disabled || fila.busy ? undefined : fila.onPress}
          role={fila.destructiva ? 'destructive' : 'default'}
          modifiers={[...fondo, disabled(!!fila.disabled || !!fila.busy)]}
        >
          <LabeledContent label={<Rotulo fila={fila} />}>
            {fila.busy ? <ProgressView /> : (
              <HStack spacing={5}>
                {fila.valor !== undefined ? <Text>{fila.valor}</Text> : null}
                {fila.lleva ? <Image systemName="chevron.right" /> : null}
              </HStack>
            )}
          </LabeledContent>
        </Button>
      )
    }
    return (
      <Button
        label={fila.rotulo}
        onPress={fila.disabled || fila.busy ? undefined : fila.onPress}
        systemImage={fila.symbol}
        role={fila.destructiva ? 'destructive' : 'default'}
        modifiers={[...fondo, disabled(!!fila.disabled || !!fila.busy)]}
      />
    )
  }

  /* Rótulo a la izquierda y valor a la derecha: es lo que hace `LabeledContent`
     y es exactamente la fila de dato de Ajustes. */
  return (
    <LabeledContent label={fila.rotulo} modifiers={fondo}>
      <Text>{fila.valor}</Text>
    </LabeledContent>
  )
}

function Rotulo({ fila }: { fila: FilaAgrupada }) {
  const detalle = 'detalle' in fila ? fila.detalle : undefined
  return <VStack alignment="leading" spacing={3}>
    <Label title={fila.rotulo} systemImage={fila.symbol} />
    {detalle ? <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('#B3B3B3')]}>{detalle}</Text> : null}
  </VStack>
}
