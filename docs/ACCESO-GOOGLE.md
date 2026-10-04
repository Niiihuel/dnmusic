# Google y aprobación de acceso

El cliente ofrece **Continuar con Google** para entrar o crear una cuenta;
`/sign-up` redirige a `/sign-in`. Una cuenta nueva espera aprobación y una
sesión existente conserva su UUID, perfil y listas. Quien todavía tiene una
cuenta antigua conectada puede [vincular Google](VINCULAR-GOOGLE.md) desde
Configuración; entrar con una identidad distinta no recupera automáticamente
los datos de otra cuenta.

## Permisos y comportamiento

- El dueño decide en **Configuración → Solicitudes de acceso**. Su UUID se fija
  y verifica en Auth; el nombre mutable `nihuel` no concede administración.
- Los hooks de Auth, el guard de PostgREST, RLS y canales Realtime privados
  mantienen la aprobación fuera de la interfaz. Quitar el formulario de
  contraseña no equivale a desactivar ese proveedor para clientes antiguos.
- El estado pendiente se consulta cada 15 segundos con la app visible. Al
  aprobar, se renueva el token antes de activar datos y reproducción.
- El recuerdo local de una cuenta aprobada permite sus descargas sin conexión;
  no concede permisos remotos ni administración. Una respuesta pendiente o
  rechazada lo borra. El permiso se comprueba al volver al primer plano y
  periódicamente con la app visible.
- Cancelar permite reintentar; un doble toque no abre dos transacciones.
  Cerrar sesión invalida las operaciones pendientes.

La migración de aprobación es
`supabase/migrations/20260916000000_access_approval.sql`. Las activaciones
iniciales de septiembre se realizaron en el anterior proyecto de Supabase
Cloud; producción ahora usa el gateway autogestionado de Railway. Ver
[repositorio y despliegue](REPOSITORIO.md) antes de cambiar un entorno remoto.

## Configuración de Google

1. En [Google Auth Platform](https://console.cloud.google.com/auth/overview),
   configurar nombre, soporte y audiencia para el entorno correspondiente.
2. Crear un cliente OAuth **Aplicación web**. Google retorna a Supabase en
   todas las plataformas; Expo y Electron no reciben el Client Secret.
3. Autorizar el callback `<SUPABASE_URL>/auth/v1/callback` del entorno. Para
   el gateway actual de producción:

   `https://envoy-production-2fb6.up.railway.app/auth/v1/callback`

4. Guardar Client ID y Client Secret en la configuración de Google del servicio
   Auth de ese Supabase. Las credenciales anteriores de Supabase Cloud no
   configuran por sí solas el servicio autogestionado.
5. Si Google está en modo de prueba, añadir las cuentas a su audiencia.
   Esa lista es independiente de la aprobación dentro de dnmusic.

El proveedor local permanece apagado en `supabase/config.toml` hasta que el
entorno tenga sus propias credenciales. No usar un callback de desarrollo
como destino de producción ni copiar secretos a `EXPO_PUBLIC_*`.

## Retornos de Supabase hacia la app

Configurar el Site URL de producción con el origen web canónico y una allowlist
limitada a los callbacks. El código añade `dn_state` y puede añadir `sb_flow_id`;
los patrones escapan `?` para aceptar la query del mismo pathname:

```text
https://dnmusic-production-c3f4.up.railway.app/auth/callback\?**
http://localhost:8081/auth/callback\?**
http://127.0.0.1:8081/auth/callback\?**
dnmusic://auth/callback\?**
http://127.0.0.1:*/auth/callback/*\?**
```

Electron abre el navegador del sistema y recoge el código en un servidor
efímero de `127.0.0.1`. Comprueba puerto, ruta aleatoria, nonce y PKCE antes del
IPC. iOS/Android usan `openAuthSessionAsync`; web valida el retorno antes de
intercambiar el código. No habilitar dominios arbitrarios o todos los previews.

El SDK usa `auth.experimental.appendPkceFlowIdToRedirects`: el retorno conserva
`dn_state` y `sb_flow_id` y valida origen, nonce y desafío S256. La vinculación
usa `linkIdentity` con la sesión existente y comprueba el UUID antes y después
del intercambio. Una cuenta antigua sin sesión ni Google vinculado requiere
recuperación asistida que verifique titularidad, sin reasignar datos por nombre.

## Validación

`npm run check` incluye los tests de acceso, sesión, callback y vinculación de
app y Electron. Los runners SQL verifican permisos reales; un export de Expo
sólo comprueba el bundle. Un cambio nativo de AuthSession/WebBrowser requiere
un binario nuevo.

Antes de distribuir, probar OAuth con el cliente Google del entorno: entrar,
crear cuenta → espera → aprobación → refresh → acceso, cancelar, cerrar sesión
y comprobar canales privados en web, Electron e iOS/Android. Los tests locales
no completan consentimiento real ni verifican la configuración remota.

Referencias: [Google en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google),
[redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls),
[identidades](https://supabase.com/docs/guides/auth/auth-identity-linking),
[OAuth en apps instaladas](https://developers.google.com/identity/protocols/oauth2/native-app).
