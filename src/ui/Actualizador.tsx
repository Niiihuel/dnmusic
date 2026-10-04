import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import {
  buscarActualizacion,
  descargarActualizacion,
  HAY_ACTUALIZADOR,
  instalarActualizacion,
  PUEDE_DESCARGAR_ACTUALIZACION,
  useActualizacion,
  type EstadoActualizacion,
} from '../state/actualizacion'
import { TarjetaVersion } from './TarjetaVersion'

function describir(estado: EstadoActualizacion): { titulo: string; detalle: string } {
  switch (estado.fase) {
    case 'buscando':
      return { titulo: 'Buscando novedades', detalle: 'Comprobando si hay una versión nueva.' }
    case 'sin-novedad':
      return { titulo: 'Estás al día', detalle: `Tenés instalada la versión ${estado.version}.` }
    case 'esperando-silencio':
      return {
        titulo: `Versión ${estado.version} disponible`,
        detalle: PUEDE_DESCARGAR_ACTUALIZACION
          ? 'La descarga empieza cuando pauses la música. También podés iniciarla ahora.'
          : 'La descarga empieza cuando pauses la música.',
      }
    case 'bajando':
      return {
        titulo: `Descargando ${estado.version}`,
        detalle:
          estado.total > 0
            ? `${Math.round(estado.bajados / 1_000_000)} de ${Math.round(estado.total / 1_000_000)} MB`
            : 'Preparando la descarga…',
      }
    case 'lista':
      return {
        titulo: `Versión ${estado.version} lista`,
        detalle: 'Reiniciá cuando quieras. También se instala al cerrar la app.',
      }
    case 'error':
      return {
        titulo: 'No pudimos actualizar',
        detalle: 'Revisá tu conexión e intentá otra vez en un momento.',
      }
    case 'apagado':
      return { titulo: 'Actualización manual', detalle: `En esta instalación ${estado.motivo}.` }
    default:
      return {
        titulo: 'Buscar una versión nueva',
        detalle: estado.version
          ? `Versión instalada · ${estado.version}`
          : 'Buscá si hay una versión nueva disponible.',
      }
  }
}

export function Actualizador() {
  const estado = useActualizacion()
  const [notasAbiertas, setNotasAbiertas] = useState(false)
  if (!HAY_ACTUALIZADOR) return null
  const { titulo, detalle } = describir(estado)
  const notas = 'notas' in estado ? estado.notas : null
  const ocupado = estado.fase === 'buscando' || estado.fase === 'bajando'
  const esperando = estado.fase === 'esperando-silencio'
  const lista = estado.fase === 'lista'
  const porcentaje =
    estado.fase === 'bajando' && Number.isFinite(estado.porcentaje)
      ? Math.max(0, Math.min(100, Math.round(estado.porcentaje)))
      : 0
  const accion = lista
    ? instalarActualizacion
    : esperando
      ? descargarActualizacion
      : buscarActualizacion
  const rotulo = lista
    ? 'Reiniciar e instalar'
    : esperando
      ? 'Descargar ahora'
      : estado.fase === 'error'
        ? 'Reintentar'
        : 'Buscar actualizaciones'
  return (
    <TarjetaVersion version={'version' in estado ? estado.version : undefined} etiqueta="Actualizaciones de dnmusic" titulo={titulo} detalle={detalle}>
      {estado.fase === 'buscando' ? <ActivityIndicator accessibilityLabel="Buscando actualizaciones" color="#fff" /> : null}
      {estado.fase === 'bajando' ? (
        <View className="gap-2">
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Descarga de la actualización"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={porcentaje}
            className="h-1 w-full overflow-hidden rounded-full bg-muted"
          >
            <View className="h-full rounded-full bg-primary" style={{ width: `${porcentaje}%` }} />
          </View>
          <Text className="text-right text-muted-foreground text-caption2 tabular-nums">
            {porcentaje}%
          </Text>
        </View>
      ) : null}
      <View className="flex-row flex-wrap items-center gap-2">
        {!ocupado && estado.fase !== 'apagado' && (!esperando || PUEDE_DESCARGAR_ACTUALIZACION) ? (
          <Pressable
            accessibilityRole="button"
            onPress={accion}
            className={`min-h-11 items-center justify-center rounded-full px-4 active:opacity-80 ${lista ? 'bg-primary' : 'bg-muted'}`}
          >
            <Text
              className={`text-footnote font-semibold ${lista ? 'text-primary-foreground' : 'text-foreground'}`}
            >
              {rotulo}
            </Text>
          </Pressable>
        ) : null}
        {notas?.cambios.length ? (
          <Pressable
            accessibilityRole="button"
            aria-expanded={notasAbiertas}
            onPress={() => setNotasAbiertas((v) => !v)}
            className="min-h-11 items-center justify-center rounded-full px-3 active:bg-muted"
          >
            <Text className="text-muted-foreground text-footnote">
              {notasAbiertas ? 'Ocultar cambios' : 'Qué trae esta versión'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {notasAbiertas && notas ? (
        <View className="gap-3">
          {notas.titulo ? (
            <Text className="text-foreground text-footnote font-semibold">{notas.titulo}</Text>
          ) : null}
          {notas.cambios.map((cambio, i) => (
            <Text key={i} className="text-muted-foreground text-footnote leading-5">
              · {cambio}
            </Text>
          ))}
        </View>
      ) : null}
    </TarjetaVersion>
  )
}
