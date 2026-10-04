import { ScrollArea as ScrollView } from './ScrollArea'
import { FilaAccion, FilaAjuste, FilaDato, FilaInterruptor, FilaOpciones, GrupoAjustes } from './Ajustes'
import type { FilaAgrupada, ListaAgrupadaProps, SeccionAgrupada } from './ListaAgrupada.types'

/**
 * La lista agrupada donde no hay una del sistema: web y Android.
 *
 * En el iPhone Metro elige `ListaAgrupada.ios.tsx`, que es el `List` de
 * SwiftUI. Acá se arma con las piezas de siempre —`GrupoAjustes` y sus filas—,
 * así que **no hay dos diseños**: hay uno, dibujado por el sistema donde el
 * sistema lo tiene y a mano donde no.
 *
 * Los `symbol` (SF Symbols) se ignoran acá: no existen fuera de Apple. Lo que
 * se dibuja es el `icono`, que cada llamada pasa junto al símbolo.
 */
export function ListaAgrupada({ secciones, piso = 24 }: ListaAgrupadaProps) {
  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-6 p-4" contentContainerStyle={{ paddingBottom: piso }}>
      {secciones.map((seccion) => (
        <Seccion key={seccion.id} seccion={seccion} />
      ))}
    </ScrollView>
  )
}

function Seccion({ seccion }: { seccion: SeccionAgrupada }) {
  return (
    <GrupoAjustes titulo={seccion.titulo} pie={seccion.pie} error={seccion.error}>
      {seccion.filas.map((fila, i) => (
        <Fila key={fila.id} fila={fila} ultima={i === seccion.filas.length - 1} />
      ))}
    </GrupoAjustes>
  )
}

function Fila({ fila, ultima }: { fila: FilaAgrupada; ultima: boolean }) {
  if (fila.tipo === 'interruptor') {
    return (
      <FilaInterruptor
        iconoPlano
        rotulo={fila.rotulo}
        detalle={fila.detalle}
        activo={fila.activo}
        onCambiar={fila.onCambiar}
        disabled={fila.disabled}
        icono={fila.icono}
        ultima={ultima}
      />
    )
  }

  if (fila.tipo === 'accion') {
    /* Con valor a la derecha es la fila que lleva a otra pantalla, que acá
       tiene su propia pieza —con su chevron, que en SwiftUI no está. */
    if (fila.valor !== undefined) {
      return (
        <FilaAjuste
          iconoPlano
          rotulo={fila.rotulo}
          valor={fila.valor}
          onPress={fila.onPress}
          icono={fila.icono}
          ultima={ultima}
          disabled={fila.disabled || fila.busy}
        />
      )
    }
    return (
      <FilaAccion
        copyText={fila.copyText}
        iconoPlano
        rotulo={fila.rotulo}
        onPress={fila.onPress}
        icono={fila.icono}
        ultima={ultima}
        disabled={fila.disabled}
        busy={fila.busy}
      />
    )
  }

  if (fila.tipo === 'menu') {
    return (
      <FilaOpciones
        iconoPlano
        rotulo={fila.rotulo}
        valor={fila.opciones.find((opcion) => opcion.seleccionada)?.id ?? fila.opciones[0]?.id ?? ''}
        opciones={fila.opciones.map((opcion) => ({
          value: opcion.id,
          label: opcion.rotulo,
          sfSymbol: opcion.symbol,
          destructive: opcion.destructiva,
        }))}
        onElegir={fila.onElegir}
        disabled={fila.disabled}
        icono={fila.icono}
        ultima={ultima}
      />
    )
  }

  return <FilaDato iconoPlano rotulo={fila.rotulo} valor={fila.valor} icono={fila.icono} ultima={ultima} />
}
