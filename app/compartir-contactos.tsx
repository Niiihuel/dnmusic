import { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { volver } from '../src/lib/volver'
import { mensajeError } from '../src/lib/mensajeError'
import { listConversations, contactTitle, type Conversation } from '../src/services/contacts'
import { compartirPorChat } from '../src/services/compartirPorChat'
import { cancionACompartir } from '../src/state/compartir'
import { useUser } from '../src/state/session'
import { avisar } from '../src/state/aviso'
import { Hoja } from '../src/ui/Hoja'
import { BotonHoja, EncabezadoHoja } from '../src/ui/EncabezadoHoja'
import { ListaAgrupada } from '../src/ui/ListaAgrupada'
import { SearchField } from '../src/ui/SearchField'
import { Vacio } from '../src/ui/Vacio'
import { IconMessage, ICON_COLOR } from '../src/ui/icons'

/** Solo contactos aceptados: compartir nunca envía solicitudes implícitas. */
export default function CompartirContactos() {
  const router = useRouter()
  const user = useUser()
  const [track] = useState(cancionACompartir)
  const [contactos, setContactos] = useState<Conversation[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [mandando, setMandando] = useState<string | null>(null)
  const [enviados, setEnviados] = useState<Set<string>>(new Set())
  const ocupado = useRef(false)
  const uid = user?.id
  const cerrar = () => volver(router, '/')

  useEffect(() => {
    let vigente = true
    if (!uid) return
    listConversations().then((r) => {
      if (vigente) setContactos(r)
    }).catch((e) => {
      if (vigente) setError(mensajeError(e))
    }).finally(() => {
      if (vigente) setCargando(false)
    })
    return () => { vigente = false }
  }, [uid, intento])

  async function mandar(c: Conversation) {
    if (!uid || !track || ocupado.current || enviados.has(c.pairId)) return
    ocupado.current = true
    setMandando(c.pairId)
    setError(null)
    try {
      await compartirPorChat(c.pairId, uid, track)
      setEnviados((prev) => new Set(prev).add(c.pairId))
      avisar(`Canción enviada a ${contactTitle(c.contact)}.`)
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      ocupado.current = false
      setMandando(null)
    }
  }

  const texto = busqueda.trim().toLocaleLowerCase()
  const visibles = contactos.filter(({ contact }) =>
    `${contact.displayName ?? ''} ${contact.username}`.toLocaleLowerCase().includes(texto))

  return <Hoja titulo="Enviar por chat" onCerrar={cerrar}>
    <EncabezadoHoja titulo="Enviar por chat" sobre={track ? `${track.title} · ${track.artist}` : undefined}
      izquierda={<BotonHoja tipo="cerrar" onPress={cerrar} />} />
    {!track || !uid ? <Vacio compacto icono={<IconMessage size={24} color={ICON_COLOR.muted} />}
      titulo={!uid ? 'Iniciá sesión para compartir' : 'No hay una canción seleccionada'}
      detalle="Volvé a abrir Compartir desde una canción." /> : <>
      <View className="px-4 pb-2">
        <SearchField value={busqueda} onChangeText={setBusqueda} placeholder="Buscar en tus contactos" loading={cargando} />
        {error ? <Text accessibilityRole="alert" className="pt-2 text-footnote text-foreground">{error}</Text> : null}
      </View>
      <ListaAgrupada label="Contactos para compartir" secciones={[{
        id: 'contactos',
        pie: cargando ? 'Cargando contactos…' : !contactos.length
          ? 'Todavía no tenés contactos. Agregá una persona desde el chat y esperá que acepte la solicitud.'
          : !visibles.length ? 'No hay contactos que coincidan con la búsqueda.' : 'Tocá un contacto para enviarle la canción completa.',
        filas: [
          ...(error && !contactos.length ? [{ tipo: 'accion' as const, id: 'reintentar', rotulo: 'Reintentar', onPress: () => {
            setError(null); setCargando(true); setIntento((n) => n + 1)
          } }] : []),
          ...visibles.map((c) => ({
            tipo: 'accion' as const,
            id: c.pairId,
            rotulo: `${contactTitle(c.contact)}${c.contact.displayName?.trim() ? ` (@${c.contact.username})` : ''}${enviados.has(c.pairId) ? ' · Enviada' : ''}`,
            symbol: enviados.has(c.pairId) ? 'checkmark' as const : 'paperplane' as const,
            busy: mandando === c.pairId,
            disabled: mandando !== null || enviados.has(c.pairId),
            onPress: () => void mandar(c),
          })),
        ],
      }]} />
    </>}
  </Hoja>
}
