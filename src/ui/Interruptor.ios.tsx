import { Host, Toggle } from '@expo/ui/swift-ui'
import { accessibilityLabel, disabled as deshabilitado, tint, toggleStyle } from '@expo/ui/swift-ui/modifiers'
import type { InterruptorProps } from './Interruptor.types'

/**
 * El interruptor **del sistema**: el `Toggle` de SwiftUI, el mismo de Ajustes.
 *
 * Metro elige este archivo en el iPhone; el resto de las plataformas dibuja el
 * de `Interruptor.tsx`. Es la misma división que `Segmentado`.
 *
 * Lo que se gana no es el dibujo —el dibujado a mano queda muy parecido— sino
 * todo lo que viene atrás y no se puede imitar sin rehacerlo cada año: el
 * háptico al soltar, la curva exacta de la perilla, el arrastre lateral para
 * cambiarlo sin levantar el dedo, Reducir movimiento, Aumentar contraste,
 * VoiceOver diciendo «activado/desactivado», y que se actualice solo cuando
 * Apple cambie el control.
 *
 * Conserva el verde semántico del estado activo y la perilla blanca.
 * El área segura la resuelve la fila que aloja el control.
 */
export function Interruptor({ activo, onCambiar, compacto = false, disabled = false, rotulo }: InterruptorProps) {
  return (
    <Host
      matchContents
      ignoreSafeArea="all"
      colorScheme="dark"
      /* El control tiene su tamaño y el sistema lo escala solo; `compacto` no
         cambia el dibujo, solo lo que la fila reserva a su alrededor. */
      style={{ minWidth: 51, minHeight: compacto ? 32 : 44 }}
    >
      <Toggle
        isOn={activo}
        onIsOnChange={disabled ? undefined : onCambiar}
        modifiers={[
          accessibilityLabel(rotulo),
          toggleStyle('switch'),
          tint('#34C759'),
          deshabilitado(disabled),
        ]}
      />
    </Host>
  )
}

/**
 * El `Toggle` escucha su propio toque, así que la fila que lo contiene **no**
 * puede ser además un `Pressable`: los dos juntos lo prendían y lo apagaban en
 * el mismo gesto. Ver `Interruptor.tsx`, donde esto es `false`.
 *
 * De paso queda igual que Ajustes de iOS, donde tocar el rótulo de una fila con
 * interruptor no hace nada: el interruptor es el que se toca.
 */
export const INTERRUPTOR_PROPIO = true
