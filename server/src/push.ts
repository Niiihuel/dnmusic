import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * El envío de notificaciones push, del lado del servidor.
 *
 * El trigger de la base avisa con **solo el id del mensaje** (ver la migración
 * `20260814160000_push.sql`): acá se relee todo con la llave de servicio — el
 * texto, la canción, quién lo mandó y los tokens de los aparatos del
 * destinatario — y se arma la notificación para la API de Expo Push.
 *
 * Todo pasa por dos RPCs (`datos_push`, `borrar_tokens_push`) y no por las
 * tablas: en esta base ni la service_role tiene grants directos — el mismo
 * estilo del resto del proyecto, donde cada puerta es una función.
 *
 * Por qué acá y no en un Edge Function: este servidor ya existe, ya tiene la
 * service_role y ya se despliega junto con el resto; un runtime más era una
 * pieza más que mantener para exactamente el mismo fetch.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
/** La API de Expo acepta hasta 100 notificaciones por pedido. */
const LOTE = 100

type DatosPush = {
  pairId?: string
  text?: string
  song?: { title?: string; artist?: string; artworkUrl?: string } | null
  quien?: string
  tokens?: string[]
}

type TicketExpo = {
  status?: string
  details?: { error?: string }
}

export type ResultadoPush = {
  ok: boolean
  /** A cuántos aparatos salió. 0 no es un error: sin tokens no hay a quién. */
  enviados: number
}

export async function notificarMensaje(
  supabase: SupabaseClient,
  messageId: string,
): Promise<ResultadoPush> {
  const { data, error } = await supabase.rpc('datos_push', { p_message: messageId })
  if (error) return { ok: false, enviados: 0 }
  const datos = (data ?? null) as DatosPush | null
  const tokens = datos?.tokens ?? []
  if (!datos?.pairId || !tokens.length) return { ok: !!datos?.pairId, enviados: 0 }

  /*
   * El cuerpo: el texto si lo hay; si no, la canción que viaja en el mensaje.
   * Un recorte sin texto es el caso más lindo de la app y el aviso lo dice
   * como tal, con la nota musical de Apple Music.
   */
  const song = datos.song ?? null
  const texto = typeof datos.text === 'string' ? datos.text.trim() : ''
  const cuerpo = texto
    ? song
      ? `${texto} · ♪ ${song.title ?? 'una canción'}`
      : texto
    : song
      ? `♪ ${song.title ?? 'Una canción'}${song.artist ? ` — ${song.artist}` : ''}`
      : 'Te mandó un mensaje'

  const notificaciones = tokens.map((token) => ({
    to: token,
    title: datos.quien ?? 'Alguien',
    body: cuerpo,
    sound: 'default',
    /* Con qué abrir: la app navega a la conversación al tocarla. */
    data: { pairId: datos.pairId, messageId },
    /* La carátula, cuando hay canción: en iOS y Android la notificación la
       muestra como imagen grande. Si la plataforma no la soporta, se ignora. */
    ...(song?.artworkUrl ? { richContent: { image: song.artworkUrl } } : {}),
  }))

  return mandar(supabase, notificaciones)
}

type DatosSolicitud = {
  quien?: string
  username?: string
  tokens?: string[]
}

/**
 * «Fulano te quiere agregar», con la app cerrada.
 *
 * Hasta acá una solicitud solo existía adentro de la app: un cartelito al
 * refrescar la bandeja, que si no estabas mirando no te enterabas hasta la
 * próxima vez que entraras.
 *
 * Va **sin cuerpo largo y sin foto**: no hay nada que previsualizar, y la
 * decisión —aceptar o no— se toma mirando el perfil, no la notificación.
 */
export async function notificarSolicitud(
  supabase: SupabaseClient,
  de: string,
  para: string,
): Promise<ResultadoPush> {
  const { data, error } = await supabase.rpc('datos_push_solicitud', {
    p_from: de,
    p_to: para,
  })
  if (error) return { ok: false, enviados: 0 }
  const datos = (data ?? null) as DatosSolicitud | null
  const tokens = datos?.tokens ?? []
  if (!tokens.length) return { ok: true, enviados: 0 }

  const quien = datos?.quien ?? 'Alguien'
  return mandar(
    supabase,
    tokens.map((token) => ({
      to: token,
      title: quien,
      body: 'Quiere ser tu contacto',
      sound: 'default',
      /* Sin `pairId`: todavía no hay conversación que abrir. La app la lleva a
         la bandeja, que es donde está el botón de aceptar. */
      data: { solicitudDe: datos?.username ?? null },
    })),
  )
}

type NotificacionExpo = { to: string; [clave: string]: unknown }

/**
 * El envío en sí: por lotes, y limpiando los tokens que Expo da por muertos.
 *
 * Lo comparten los dos avisos porque el trato con Expo es idéntico —lo único
 * distinto entre un mensaje y una solicitud es qué dice la notificación— y
 * tener dos copias de este bucle era la forma segura de que una aprendiera a
 * limpiar tokens y la otra no.
 */
async function mandar(
  supabase: SupabaseClient,
  notificaciones: NotificacionExpo[],
): Promise<ResultadoPush> {
  let enviados = 0
  const muertos: string[] = []
  for (let i = 0; i < notificaciones.length; i += LOTE) {
    const lote = notificaciones.slice(i, i + LOTE)
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lote),
      })
      const cuerpoRes = (await res.json().catch(() => null)) as { data?: TicketExpo[] } | null
      const tickets = cuerpoRes?.data ?? []
      tickets.forEach((ticket, j) => {
        if (ticket.status === 'ok') enviados += 1
        /* Un aparato que desinstaló la app o cerró sesión hace mucho: su token
           ya no existe para Expo y guardarlo es mandar al vacío para siempre. */
        if (ticket.details?.error === 'DeviceNotRegistered') {
          const original = lote[j]
          if (original) muertos.push(original.to)
        }
      })
    } catch {
      // Expo no contestó: lo que se avisa ya está en la app, no se reintenta.
    }
  }

  if (muertos.length) {
    // El error viaja en el resultado, no como excepción: no hay que atraparlo.
    await supabase.rpc('borrar_tokens_push', { p_tokens: muertos })
  }

  return { ok: true, enviados }
}
