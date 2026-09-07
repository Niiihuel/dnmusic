import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { avisar } from '../state/aviso'
import { mensajeError } from '../lib/mensajeError'
import { useUser } from '../state/session'
import { ensureConversation, searchContacts, type ContactResult } from '../services/contacts'
import { sendMessage } from '../services/messages'
import { linkDeJam } from '../lib/invitarJam'
import { Avatar } from './Avatar'
import { SearchField } from './SearchField'
import { ICON_COLOR, IconCheck } from './icons'

/**
 * Mandar la invitación al Jam **por chat**, eligiendo un amigo.
 *
 * El link seguía haciendo falta cuando había que copiarlo y pegarlo en otra
 * app; acá se busca a la persona por nombre —los mismos contactos del chat— y
 * se le manda el link a la conversación de una. Si nunca se habían escrito, la
 * conversación se crea en el momento (`ensureConversation`). Es el mismo
 * selector que el de una lista colaborativa (`app/lista/personas`), con el
 * envío en vez del alta.
 */
export function MandarJamAmigo({ code }: { code: string }) {
  const user = useUser()
  const [busqueda, setBusqueda] = useState('')
  const [hallado, setHallado] = useState<{ texto: string; contactos: ContactResult[] } | null>(null)
  const enviando = useRef(false)
  const [buscando, setBuscando] = useState(false)
  const [enviados, setEnviados] = useState<Set<string>>(new Set())
  const [mandando, setMandando] = useState<string | null>(null)

  /* Con menos de dos letras no se busca; lo que se muestra se deriva del texto
     más abajo, así vaciar no pide un render de más. Mismo debounce que el
     resto de los buscadores de gente. */
  useEffect(() => {
    const texto = busqueda.trim()
    if (texto.length < 2) return
    const corte = new AbortController()
    const t = setTimeout(() => {
      setBuscando(true)
      searchContacts(texto, corte.signal)
        .then((r) => { if (!corte.signal.aborted) setHallado({ texto, contactos: r }) })
        .catch(() => {
          /* Abortada o sin red: la lista anterior sigue siendo lo mejor que
             tenemos, así que no se vacía. */
        })
        .finally(() => { if (!corte.signal.aborted) setBuscando(false) })
    }, 250)
    return () => {
      corte.abort()
      clearTimeout(t)
    }
  }, [busqueda])

  const resultados = busqueda.trim().length >= 2 && hallado?.texto === busqueda.trim() ? hallado.contactos : []

  async function mandar(c: ContactResult) {
    if (!user || enviando.current || enviados.has(c.id)) return
    enviando.current = true
    setMandando(c.id)
    try {
      const pairId = c.pairId ?? (await ensureConversation(c.id))
      await sendMessage(pairId, user.id, {
        text: `Escuchemos juntos en dnmusic 🎧 ${linkDeJam(code)}`,
      })
      setEnviados((s) => new Set(s).add(c.id))
      avisar(`Se lo mandé a ${c.displayName?.trim() || `@${c.username}`}.`)
    } catch (e) {
      avisar(mensajeError(e), true)
    } finally {
      enviando.current = false
      setMandando(null)
    }
  }

  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="text-foreground text-[15px] font-semibold">Invitar por chat</Text>
      <SearchField value={busqueda} onChangeText={setBusqueda} placeholder="Buscar una persona" accessibilityLabel="Buscar a un amigo para mandarle el Jam" loading={busqueda.trim().length >= 2 && buscando} />
      {hallado?.texto === busqueda.trim() && !buscando && !resultados.length ? <Text className="text-muted-foreground text-[13px]">No encontramos personas con ese nombre.</Text> : null}
      {resultados.map((c) => {
        const ya = enviados.has(c.id)
        return (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityLabel={ya ? `Ya le mandaste a ${c.username}` : `Mandarle a ${c.username}`}
            disabled={ya || mandando !== null}
            onPress={() => void mandar(c)}
            className="min-h-11 flex-row items-center gap-3 rounded-2xl px-3 py-3 active:bg-muted"
          >
            <Avatar name={c.displayName || c.username} path={c.avatarPath} size={40} />
            <View className="min-w-0 flex-1">
              <Text className="text-foreground text-[15px] font-semibold" numberOfLines={1}>
                {c.displayName?.trim() || `@${c.username}`}
              </Text>
              <Text className="text-muted-foreground text-[13px]" numberOfLines={1}>
                @{c.username}
              </Text>
            </View>
            {mandando === c.id ? (
              <ActivityIndicator size="small" color={ICON_COLOR.muted} />
            ) : ya ? (
              <IconCheck size={16} color={ICON_COLOR.muted} />
            ) : (
              <Text className="text-foreground text-[14px] font-semibold">Invitar</Text>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}
