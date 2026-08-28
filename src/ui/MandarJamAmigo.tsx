import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { avisar } from '../state/aviso'
import { mensajeError } from '../lib/mensajeError'
import { useUser } from '../state/session'
import { ensureConversation, searchContacts, type ContactResult } from '../services/contacts'
import { sendMessage } from '../services/messages'
import { linkDeJam } from '../lib/invitarJam'
import { Avatar } from './Avatar'
import { ICON_COLOR, IconCheck, IconSearch } from './icons'

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
  const [encontrados, setEncontrados] = useState<ContactResult[]>([])
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
        .then((r) => setEncontrados(r))
        .catch(() => {
          /* Abortada o sin red: la lista anterior sigue siendo lo mejor que
             tenemos, así que no se vacía. */
        })
        .finally(() => setBuscando(false))
    }, 250)
    return () => {
      corte.abort()
      clearTimeout(t)
    }
  }, [busqueda])

  const resultados = busqueda.trim().length >= 2 ? encontrados : []

  async function mandar(c: ContactResult) {
    if (!user || mandando || enviados.has(c.id)) return
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
      setMandando(null)
    }
  }

  return (
    <View className="gap-2">
      <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
        Mandáselo a un amigo
      </Text>
      <View className="flex-row items-center gap-2 rounded-full bg-muted px-4">
        <IconSearch size={15} color={ICON_COLOR.muted} />
        <TextInput
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscá a alguien"
          placeholderTextColor="#6A6A6A"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Buscar a un amigo para mandarle el Jam"
          className="text-foreground h-11 flex-1 text-[14px]"
        />
        {buscando ? <ActivityIndicator size="small" color={ICON_COLOR.muted} /> : null}
      </View>
      {resultados.map((c) => {
        const ya = enviados.has(c.id)
        return (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityLabel={ya ? `Ya le mandaste a ${c.username}` : `Mandarle a ${c.username}`}
            disabled={ya || mandando === c.id}
            onPress={() => void mandar(c)}
            className="flex-row items-center gap-3 rounded-2xl px-2 py-2 active:bg-muted"
          >
            <Avatar name={c.displayName || c.username} path={c.avatarPath} size={34} />
            <View className="min-w-0 flex-1">
              <Text className="text-foreground text-[13px] font-semibold" numberOfLines={1}>
                {c.displayName?.trim() || `@${c.username}`}
              </Text>
              <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
                @{c.username}
              </Text>
            </View>
            {mandando === c.id ? (
              <ActivityIndicator size="small" color={ICON_COLOR.muted} />
            ) : ya ? (
              <IconCheck size={16} color={ICON_COLOR.muted} />
            ) : (
              <Text className="text-foreground text-[12px] font-semibold">Mandar</Text>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}
