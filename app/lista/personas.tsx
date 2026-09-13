import { BotonSuperficie } from '../../src/ui/BotonSuperficie'
import { IconButton } from '../../src/ui/IconButton'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
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
import { useMyProfile, useUser } from '../../src/state/session'
import { usePiso, useKeyboardH } from '../../src/state/shell'
import { Avatar } from '../../src/ui/Avatar'
import { ES_WEB } from '../../src/ui/Glass'
import { BotonHoja, EncabezadoHoja } from '../../src/ui/EncabezadoHoja'
import { ANCHO_HOJA, Hoja, useHojaModal } from '../../src/ui/Hoja'
import { SearchField } from '../../src/ui/SearchField'
import { ICON_COLOR, IconCheck, IconClose, IconShare, IconUsers } from '../../src/ui/icons'

/**
 * Quiénes escriben esta lista: el link para sumar gente y la gente ya sumada.
 *
 * Es la hoja de «Iniciar colaboración» de Apple Music: arriba el ícono y una
 * explicación de qué va a poder hacer quien entre, tu propia fila —con qué
 * nombre y qué cara te van a ver los demás—, y el botón del link. Debajo, lo
 * que Apple no tiene y acá sí: buscar a alguien por nombre, y la lista de los
 * que ya están.
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
  const perfil = useMyProfile()
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
  const miNombre = perfil?.displayName?.trim() || perfil?.username || 'Vos'

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
          <Text className="text-muted-foreground text-footnote">No se encontró la lista.</Text>
        </View>
      </Hoja>
    )
  }

  return (
    <Hoja>
      <View className="flex-1 bg-background">
        <View className="w-full flex-1 self-center" style={{ maxWidth: ANCHO_HOJA }}>
          <EncabezadoHoja
            titulo="Colaborar"
            sobre={nombre ? `«${nombre}»` : undefined}
            izquierda={<BotonHoja tipo="cerrar" onPress={() => volver(router, '/')} />}
          />
          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-6 px-5 pt-1"
            /* Acotado en el escritorio, como el resto de las hojas de formulario. */
            contentContainerStyle={{ paddingBottom: (modal ? 24 : piso) + teclado }}
            keyboardShouldPersistTaps="handled"
          >
            {/*
             * La presentación: qué es esto y qué va a poder hacer quien entre.
             * Es el bloque centrado de la hoja de Apple Music —ícono, título,
             * dos líneas— y va primero porque es lo que le da sentido al botón
             * de abajo: nadie manda un link sin saber a qué invita.
             */}
            <View className="items-center gap-2 pt-2">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-muted">
                <IconUsers size={24} color={ICON_COLOR.foreground} />
              </View>
              <Text className="pt-1 text-foreground text-center text-title3 font-bold">
                Invitá a participar
              </Text>
              <Text className="max-w-sm text-muted-foreground text-center text-footnote leading-5">
                Cualquier persona con el link va a poder sumar canciones y sacar las que
                sobren. Tu nombre y tu foto se van a ver junto a la lista.
              </Text>
            </View>

            {/*
             * Cómo te van a ver: tu fila, con «Editar» para ir al perfil. Es la
             * fila de identidad de la hoja de Apple Music y responde a la
             * duda que tiene cualquiera antes de mandar el link — «¿con qué
             * nombre me van a ver?».
             */}
            <View className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3">
              <Avatar name={miNombre} path={perfil?.avatarPath} size={40} />
              <View className="min-w-0 flex-1">
                <Text className="text-foreground text-subheadline font-semibold" numberOfLines={1}>
                  {miNombre}
                </Text>
                {perfil?.username ? (
                  <Text className="text-muted-foreground text-caption1" numberOfLines={1}>
                    @{perfil.username}
                  </Text>
                ) : null}
              </View>
              <BotonSuperficie
                accessibilityRole="button"
                accessibilityLabel="Editar tu perfil"
                onPress={() => router.push('/profile/editar')}
                className="min-h-9 justify-center rounded-full px-3 active:bg-muted"
              >
                <Text className="text-foreground text-footnote font-semibold">Editar</Text>
              </BotonSuperficie>
            </View>

            <BotonSuperficie
              accessibilityRole="button"
              accessibilityLabel="Compartir el link para sumarse"
              onPress={() => void invitarAColaborar(id, nombre || 'la lista')}
              className="h-12 flex-row items-center justify-center gap-2 rounded-full bg-primary px-6 active:opacity-80"
            >
              <IconShare size={16} color={ICON_COLOR.onPrimary} />
              <Text className="text-primary-foreground text-subheadline font-semibold">
                {ES_WEB ? 'Copiar el link' : 'Compartir el link'}
              </Text>
            </BotonSuperficie>

            {/* Buscar por nombre es solo del dueño, como sumar a mano en la base. */}
            {soyDueño ? (
              <View className="gap-2">
                <Text className="px-1 text-muted-foreground text-footnote font-semibold uppercase">
                  O sumalos por nombre
                </Text>
                <SearchField
                  value={busqueda}
                  onChangeText={setBusqueda}
                  placeholder="Buscá a alguien"
                  loading={buscando}
                />

                {resultados.length ? (
                  <View className="overflow-hidden rounded-2xl bg-card">
                    {resultados.map((c) => {
                      const dentro = yaEstan.has(c.id)
                      return (
                        <BotonSuperficie
                          key={c.id}
                          accessibilityRole="button"
                          accessibilityLabel={dentro ? `${c.username} ya está` : `Sumar a ${c.username}`}
                          disabled={dentro}
                          onPress={() => void sumar(c)}
                          className="flex-row items-center gap-3 px-4 py-2.5 active:bg-muted"
                        >
                          <Avatar name={c.displayName || c.username} path={c.avatarPath} size={36} />
                          <View className="min-w-0 flex-1">
                            <Text className="text-foreground text-subheadline font-semibold" numberOfLines={1}>
                              {c.displayName?.trim() || `@${c.username}`}
                            </Text>
                            <Text className="text-muted-foreground text-caption1" numberOfLines={1}>
                              @{c.username}
                            </Text>
                          </View>
                          {dentro ? (
                            <IconCheck size={16} color={ICON_COLOR.muted} />
                          ) : (
                            <View className="rounded-full bg-muted px-3 py-1.5">
                              <Text className="text-foreground text-caption1 font-semibold">Sumar</Text>
                            </View>
                          )}
                        </BotonSuperficie>
                      )
                    })}
                  </View>
                ) : null}
              </View>
            ) : null}

            <View className="gap-2">
              <Text className="px-1 text-muted-foreground text-footnote font-semibold uppercase">
                En la lista · {gente?.length ?? 0}
              </Text>
              {gente === null ? (
                <View className="py-6">
                  <ActivityIndicator color={ICON_COLOR.muted} />
                </View>
              ) : (
                <View className="overflow-hidden rounded-2xl bg-card">
                  {gente.map((g) => {
                    const soyYo = g.id === user?.id
                    /* La cruz aparece si sos el dueño —sacás a cualquiera menos a
                       vos, que no te podés echar de tu propia lista— o si es tu
                       propia fila y estás de invitado: eso es irse. */
                    const puedoSacar = (soyDueño && !g.esDueño) || (soyYo && !g.esDueño)
                    return (
                      <View key={g.id} className="flex-row items-center gap-3 px-4 py-3">
                        <Avatar name={g.displayName || g.username} path={g.avatarPath} size={36} />
                        <View className="min-w-0 flex-1">
                          <Text className="text-foreground text-subheadline font-semibold" numberOfLines={1}>
                            {g.displayName?.trim() || `@${g.username}`}
                            {soyYo ? ' (vos)' : ''}
                          </Text>
                          <Text className="text-muted-foreground text-caption1">
                            {g.esDueño ? 'Armó la lista' : 'Colabora'}
                          </Text>
                        </View>
                        {puedoSacar ? (
                          <IconButton label={soyYo ? 'Salir de la lista' : `Sacar a ${g.username}`} symbol="xmark" onPress={() => void sacar(g)} lado={36} size={15} icon={<IconClose size={15} color={ICON_COLOR.muted} />} />
                        ) : null}
                      </View>
                    )
                  })}
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Hoja>
  )
}
