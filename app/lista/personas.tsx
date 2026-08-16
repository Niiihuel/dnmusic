import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { invitarAColaborar } from '../../src/lib/compartirLista'
import { mensajeError } from '../../src/lib/mensajeError'
import { volver } from '../../src/lib/volver'
import { searchContacts, type ContactResult } from '../../src/services/contacts'
import {
  addCollaborator,
  listCollaborators,
  removeCollaborator,
  type Colaborador,
} from '../../src/services/playlists'
import { avisar } from '../../src/state/aviso'
import { useUser } from '../../src/state/session'
import { usePiso, useKeyboardH } from '../../src/state/shell'
import { Avatar } from '../../src/ui/Avatar'
import { ES_WEB } from '../../src/ui/Glass'
import { ANCHO_HOJA, Hoja, useHojaModal } from '../../src/ui/Hoja'
import { ICON_COLOR, IconCheck, IconClose, IconSearch, IconShare } from '../../src/ui/icons'

/**
 * Quiénes escriben esta lista: el link para sumar gente y la gente ya sumada.
 *
 * Dos caminos, y no sobra ninguno. El **link** sirve para quien no tenés
 * agregado —se manda por WhatsApp y listo—, y **buscar por nombre** sirve para
 * quien sí, que es el caso de todos los días y donde mandar un link sería dar
 * una vuelta larga para algo que está a dos toques.
 *
 * Sacar y salir son el mismo botón mirado desde dos lados: el dueño ve una cruz
 * al lado de cada uno, y el que colabora la ve solo al lado de sí mismo. Es una
 * sola función en la base (`remove_playlist_collaborator`) y una sola acá.
 */
export default function PersonasDeLista() {
  const router = useRouter()
  const piso = usePiso(24)
  const teclado = useKeyboardH()
  const modal = useHojaModal()
  const user = useUser()
  const { id, nombre } = useLocalSearchParams<{ id?: string; nombre?: string }>()

  const [gente, setGente] = useState<Colaborador[] | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [encontrados, setEncontrados] = useState<ContactResult[]>([])
  const [buscando, setBuscando] = useState(false)

  /*
   * Releer no es una función que llame a la red: es subir un número.
   *
   * El pedido vive en un solo lugar —el efecto de abajo— y `rev` es lo que lo
   * vuelve a disparar después de sumar o sacar a alguien. Con una función
   * `async` que hiciera el `setGente` por su cuenta habría dos caminos hacia el
   * mismo estado, y el de después de un `await` puede llegar cuando la hoja ya
   * se cerró.
   */
  const [rev, setRev] = useState(0)
  const recargar = useCallback(() => setRev((n) => n + 1), [])

  useEffect(() => {
    if (!id) return
    let vivo = true
    listCollaborators(id)
      .then((g) => {
        if (vivo) setGente(g)
      })
      .catch((e: unknown) => {
        if (!vivo) return
        avisar(mensajeError(e), true)
        setGente([])
      })
    return () => {
      vivo = false
    }
  }, [id, rev])

  /*
   * La búsqueda se corta con un AbortController y no con un debounce a secas:
   * escribir rápido dispara varias, y sin cancelar la anterior, la respuesta
   * lenta de «ma» podía pisar la de «marina». Mismo patrón que el buscador de
   * canciones.
   *
   * Con menos de dos letras no se limpia nada: lo que se muestra se **deriva**
   * más abajo. Vaciar el estado desde acá sería pedirle a React un render de
   * más para llegar a lo que ya se sabe mirando el texto.
   */
  useEffect(() => {
    const texto = busqueda.trim()
    if (texto.length < 2) return
    const corte = new AbortController()
    const t = setTimeout(() => {
      setBuscando(true)
      searchContacts(texto, corte.signal)
        .then((r) => setEncontrados(r))
        .catch(() => {
          /* Abortada o sin red: la lista anterior sigue siendo la mejor
             respuesta que tenemos, así que no se vacía. */
        })
        .finally(() => setBuscando(false))
    }, 250)
    return () => {
      corte.abort()
      clearTimeout(t)
    }
  }, [busqueda])

  const soyDueño = gente?.some((g) => g.esDueño && g.id === user?.id) ?? false
  const yaEstan = new Set((gente ?? []).map((g) => g.id))
  /* Lo que se ve, derivado del texto: con menos de dos letras no hay búsqueda
     que mostrar, aunque el estado todavía guarde el resultado anterior. */
  const resultados = busqueda.trim().length >= 2 ? encontrados : []

  async function sumar(contacto: ContactResult) {
    if (!id) return
    try {
      await addCollaborator(id, contacto.id)
      setBusqueda('')
      setEncontrados([])
      recargar()
    } catch (e) {
      avisar(mensajeError(e), true)
    }
  }

  async function sacar(persona: Colaborador) {
    if (!id) return
    const meVoy = persona.id === user?.id
    try {
      await removeCollaborator(id, persona.id)
      if (meVoy) {
        /* Te fuiste: la lista ya no es tuya para mirar, así que la hoja no
           tiene contra qué recargar. Se cierra y avisa. */
        avisar('Saliste de la lista.')
        volver(router, '/')
        return
      }
      recargar()
    } catch (e) {
      avisar(mensajeError(e), true)
    }
  }

  if (!id) {
    return (
      <Hoja>
        <View className="flex-1 items-center justify-center bg-background">
          <Text className="text-muted-foreground text-[13px]">No se encontró la lista.</Text>
        </View>
      </Hoja>
    )
  }

  return (
    <Hoja>
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-6 px-5 pt-6"
        /* Acotado en el escritorio, como el resto de las hojas de formulario. */
        contentContainerStyle={{
          paddingBottom: modal ? 24 : piso + teclado,
          maxWidth: ANCHO_HOJA,
          width: '100%',
          alignSelf: 'center',
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center gap-1">
          <Text className="text-foreground text-lg font-bold">Armenla entre todos</Text>
          <Text className="text-muted-foreground text-center text-[12px] leading-4">
            Quien entre puede sumar canciones y sacar las que sobren.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Compartir el link para sumarse"
          onPress={() => void invitarAColaborar(id, nombre || 'la lista')}
          className="flex-row items-center justify-center gap-2 self-center rounded-full bg-primary px-6 py-3 active:opacity-80"
        >
          <IconShare size={16} color={ICON_COLOR.onPrimary} />
          <Text className="text-primary-foreground text-[14px] font-semibold">
            {ES_WEB ? 'Copiar el link' : 'Compartir el link'}
          </Text>
        </Pressable>

        {/* Buscar por nombre es solo del dueño, como sumar a mano en la base. */}
        {soyDueño ? (
          <View className="gap-2">
            <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
              O sumalos por nombre
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
                accessibilityLabel="Buscar a alguien para sumar"
                className="text-foreground h-11 flex-1 text-[14px]"
              />
              {buscando ? <ActivityIndicator size="small" color={ICON_COLOR.muted} /> : null}
            </View>

            {resultados.map((c) => {
              const dentro = yaEstan.has(c.id)
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityLabel={dentro ? `${c.username} ya está` : `Sumar a ${c.username}`}
                  disabled={dentro}
                  onPress={() => void sumar(c)}
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
                  {dentro ? (
                    <IconCheck size={16} color={ICON_COLOR.muted} />
                  ) : (
                    <Text className="text-foreground text-[12px] font-semibold">Sumar</Text>
                  )}
                </Pressable>
              )
            })}
          </View>
        ) : null}

        <View className="gap-2">
          <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
            En la lista · {gente?.length ?? 0}
          </Text>
          {gente === null ? (
            <View className="py-6">
              <ActivityIndicator color={ICON_COLOR.muted} />
            </View>
          ) : (
            <View className="rounded-2xl bg-card">
              {gente.map((g, i) => {
                const soyYo = g.id === user?.id
                /* La cruz aparece si sos el dueño —sacás a cualquiera menos a
                   vos, que no te podés echar de tu propia lista— o si es tu
                   propia fila y estás de invitado: eso es irse. */
                const puedoSacar = (soyDueño && !g.esDueño) || (soyYo && !g.esDueño)
                return (
                  <View
                    key={g.id}
                    className={`flex-row items-center gap-3 px-4 py-3 ${
                      i > 0 ? 'border-t border-background' : ''
                    }`}
                  >
                    <Avatar name={g.displayName || g.username} path={g.avatarPath} size={36} />
                    <View className="min-w-0 flex-1">
                      <Text className="text-foreground text-[13px] font-semibold" numberOfLines={1}>
                        {g.displayName?.trim() || `@${g.username}`}
                        {soyYo ? ' (vos)' : ''}
                      </Text>
                      <Text className="text-muted-foreground text-[11px]">
                        {g.esDueño ? 'Armó la lista' : 'Colabora'}
                      </Text>
                    </View>
                    {puedoSacar ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={soyYo ? 'Salir de la lista' : `Sacar a ${g.username}`}
                        onPress={() => void sacar(g)}
                        className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
                      >
                        <IconClose size={15} color={ICON_COLOR.muted} />
                      </Pressable>
                    ) : null}
                  </View>
                )
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </Hoja>
  )
}
