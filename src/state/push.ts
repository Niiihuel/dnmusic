import { useEffect } from 'react'
import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { getSupabase } from '../lib/supabase'
import { abrirChat } from './shell'

/**
 * Las notificaciones push: el token de este aparato y qué pasa al tocar una.
 *
 * El circuito entero, de punta a punta:
 *   1. Acá se pide permiso, se saca el token de Expo Push y se guarda en
 *      `push_tokens` (una fila por aparato, el token es la clave).
 *   2. Al llegar un mensaje, un trigger de la base le avisa al servidor de
 *      música, que arma la notificación y la manda por la API de Expo.
 *   3. Tocarla abre la conversación: `abrirChat` viaja por el mismo puente
 *      que usan el drawer y la barra, y aguanta el arranque en frío.
 *
 * `expo-notifications` es **opcional** como todos los módulos nativos nuevos:
 * en la web no existe y un development client viejo tampoco lo trae. En esos
 * casos este hook no hace nada — el mismo trato que `remote-commands`.
 *
 * Con la app al frente las notificaciones van en silencio: el tiempo real ya
 * refresca la bandeja, el globito de Chats ya suma y el aviso ya aparece.
 * Sonar dos veces por el mismo mensaje es lo que hace desactivar todo.
 */
export function usePush(uid: string | null) {
  useEffect(() => {
    if (!uid || Platform.OS === 'web') return

    let notificaciones: typeof import('expo-notifications')
    try {
      /* Perezoso: si el binario no trae el módulo, el import de arriba de todo
         reventaría la app al arrancar. Acá falla adentro del try y no hay push. */
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      notificaciones = require('expo-notifications')
    } catch {
      return
    }

    let vivo = true

    notificaciones.setNotificationHandler({
      handleNotification: () =>
        Promise.resolve({
          shouldShowBanner: false,
          shouldShowList: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
    })

    const alTocar = (respuesta: import('expo-notifications').NotificationResponse) => {
      const data = respuesta.notification.request.content.data as
        | { pairId?: unknown }
        | undefined
      if (typeof data?.pairId === 'string') abrirChat(data.pairId)
    }

    const sub = notificaciones.addNotificationResponseReceivedListener(alTocar)
    /* La app pudo haber **nacido** de un toque: ese ya pasó y el oyente no lo
       ve. Se pregunta por el último y se atiende igual. */
    void notificaciones
      .getLastNotificationResponseAsync()
      .then((r) => vivo && r && alTocar(r))
      .catch(() => {})

    void (async () => {
      try {
        const permiso = await notificaciones.requestPermissionsAsync()
        if (!vivo || !permiso.granted) return
        const projectId = (
          Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
        )?.eas?.projectId
        const { data: token } = await notificaciones.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        )
        if (!vivo || !token) return
        /* Por RPC como todo lo demás: la tabla no tiene grants directos. El
           upsert es por token — un teléfono que cambió de cuenta pisa su fila
           en vez de dejar una vieja avisándole al usuario anterior. */
        await getSupabase().rpc('guardar_token_push', {
          p_token: token,
          p_platform: Platform.OS,
        })
      } catch {
        // Sin permiso o sin red: sin push, y la app sigue igual.
      }
    })()

    return () => {
      vivo = false
      sub.remove()
    }
  }, [uid])
}
