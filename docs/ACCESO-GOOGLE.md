# Google y aprobación de acceso

## Estado de esta entrega

Activación autorizada y aplicada el 7 de septiembre de 2026 en Supabase DMusic
(`tdvndpjaxuqhibcpufat`). Migración registrada, cuentas existentes aprobadas y
administración fijada al UUID verificado de `@nihuel`. Los dos hooks de Auth y
Realtime `private_only` están activos. Las altas por contraseña quedan rechazadas
por el hook y el trigger. El login del cliente se unificó posteriormente en Google.

Servidor de producción actualizado y READY en
[dnmusic-api](https://dnmusic-api.vercel.app), despliegue
`dpl_BKaFitdqMtL9qSzjw5f4RusrBqdg`. Salud HTTP 200; búsqueda sin sesión HTTP 401.
Se desplegó con variables de producción, excluyendo archivos de secretos.

**Google está habilitado en producción desde el 8 de septiembre de 2026.**
El Client ID y el secreto viven únicamente en Supabase; no forman parte del
repositorio ni del cliente. La configuración local conserva el proveedor apagado
hasta que un entorno de desarrollo suministre sus propias credenciales.

El cliente actualizado forma parte de escritorio 1.12.0. El flujo OAuth real se
verificará con ese binario publicado; iOS queda para una entrega separada. Las
versiones móviles anteriores necesitan actualizarse para usar canales privados.

## Comportamiento

- Las cuentas nuevas eligen **Continuar con Google** y esperan aprobación.
- El cliente actualizado permite iniciar sesión únicamente con Google; `/sign-up` redirige a `/sign-in`. No muestra acceso por usuario/contraseña.
- Las sesiones existentes se conservan. Quien todavía esté conectado con una cuenta antigua puede vincular Google desde Configuración para mantener su UUID, perfil y listas.
- Esta entrega no deshabilita el proveedor de contraseña en Supabase ni modifica usuarios remotos. Quitar el formulario no equivale a cerrar ese endpoint para clientes antiguos.
- El dueño decide en **Configuración → Solicitudes de acceso**.
- La cuenta administradora confirmada es `@nihuel`. Su UUID se verificó contra
  Auth; el bootstrap fija ese UUID, nunca toma un nombre suministrado por un cliente.
- El estado pendiente se consulta cada 15 segundos mientras la app está visible.
  Al aprobar, se renueva el token antes de activar datos y reproducción.
- Una cuenta ya aprobada en el mismo aparato conserva sus descargas sin conexión.
  Ese recuerdo local no permite administrar ni concede ningún permiso al servidor.
  Una respuesta pendiente/rechazada borra ese recuerdo. La app comprueba el permiso
  remoto al volver al primer plano y periódicamente mientras está visible.

## Configuración de Google Cloud

1. Abrir [Google Auth Platform](https://console.cloud.google.com/auth/overview),
   seleccionar el proyecto de DMusic y completar nombre, soporte y audiencia.
2. Crear un cliente OAuth de tipo **Aplicación web**. Este flujo usa Supabase como
   callback de Google en todas las plataformas; no introduce secretos en Expo/Electron.
3. Autorizar en Google este redirect URI exacto:

   `https://tdvndpjaxuqhibcpufat.supabase.co/auth/v1/callback`

4. Cargar Client ID y Client Secret directamente en
   [Supabase → Google](https://supabase.com/dashboard/project/tdvndpjaxuqhibcpufat/auth/providers).
   No pegarlos en el chat, Git, variables `EXPO_PUBLIC_*` ni archivos del cliente.
5. Si Google está en modo de prueba, añadir las cuentas de prueba a su audiencia.
   Esta lista de Google es independiente de la aprobación del dueño dentro de DMusic.

## Retornos de Supabase hacia la app

Configurar el Site URL de producción con el dominio real de la web y una allowlist
limitada a estos callbacks. El código añade `dn_state` y puede añadir `sb_flow_id`;
los patrones escapan `?` para aceptar únicamente la query del mismo pathname:

```text
https://dnmusic-app.vercel.app/auth/callback\?**
http://localhost:8081/auth/callback\?**
http://127.0.0.1:8081/auth/callback\?**
dnmusic://auth/callback\?**
http://127.0.0.1:*/auth/callback/*\?**
```

Verificar el dominio de producción antes de cargarlo. No permitir todos los dominios
Vercel. Electron abre el navegador del sistema y recibe el código por un servidor
efímero en `127.0.0.1`; comprueba puerto, ruta aleatoria, nonce y PKCE antes del IPC.
iOS/Android usan `openAuthSessionAsync`; web valida el callback antes de intercambiar
el código. Cancelar o cerrar sesión invalida transacciones anteriores.

No se ha validado un OAuth real: requiere el cliente de Google configurado. iOS
necesita un nuevo binario por las dependencias nativas de AuthSession/WebBrowser.
La exportación Hermes prueba compilación, no sustituye la prueba en un dispositivo.

## Verificación realizada

- Cliente: 330 pruebas; escritorio: 64; servidor: 9.
- TypeScript y ESLint pasan; exportaciones web y Hermes iOS pasan.
- Matriz SQL de permisos pasa en base local y transaccional.
- Suite SQL general: 11/12; el fallo de orden de `jam_tocar_cola` se reproduce
  antes de esta migración (detalle en ACCESS_APPROVAL).
- Verificación remota transaccional: migración registrada, todas las cuentas
  existentes aprobadas, UUID del dueño, audio privado, lógica y grants de hooks,
  rechazo de alta email y lectura de solicitudes/perfil como administrador.
- Hooks y Realtime privado confirmados mediante lectura posterior de Management.
- Panel local verificado en navegador con @nihuel como administrador y las
  cuentas existentes aprobadas; no se cambió ninguna decisión para probarlo.
  localhost usa Supabase local, distinto del proyecto remoto de producción.
- Pendiente: OAuth Google real de alta → espera → aprobación → refresh → acceso
  y verificación de canales privados en dispositivos con el cliente actualizado.

Fuentes: [Google en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google),
[redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls),
[OAuth en apps instaladas](https://developers.google.com/identity/protocols/oauth2/native-app).

## Unificación del cliente · 12 de septiembre de 2026

El botón Google sirve para volver a entrar y para crear una cuenta. Se conserva
la aprobación de acceso, el retorno PKCE y la validación de sesión. Cancelar
permite reintentar; un doble toque no abre dos transacciones. La función antigua
`signIn` rechaza localmente el acceso por credenciales y no llama al proveedor.

Las cuentas antiguas usan identificadores de correo internos: no se puede
asumir que iniciar Google vincule automáticamente la cuenta anterior. La
vinculación requiere la sesión de esa cuenta mediante `linkIdentity`. Una
cuenta antigua sin sesión y sin Google vinculado necesita una recuperación
asistida que verifique la titularidad; no se reasignan datos por nombre de usuario.
[Identidades en Supabase](https://supabase.com/docs/guides/auth/auth-identity-linking).

No se cambió la configuración remota de Auth ni se realizaron consentimientos
Google reales durante esta modificación.

### Retorno PKCE en el SDK actual

El cliente habilita `auth.experimental.appendPkceFlowIdToRedirects`. El SDK
devuelve `flowId` aunque esta opción esté apagada; sin ella, nuestra validación
del retorno rechazaba el inicio antes de abrir Google. La prueba de regresión
usa el SDK instalado para preparar la URL y pasarla por la validación real de
DMusic en web y escritorio. Los callbacks autorizados conservan `dn_state` y
`sb_flow_id`; no se reduce la validación de origen, nonce ni desafío S256.
