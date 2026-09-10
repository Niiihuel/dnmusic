# Conectar Google desde Configuración

En **Configuración → Cuenta**, iOS y escritorio comparten el control
`ConectarGoogle`: muestra el ícono del proveedor, una acción compacta, espera,
cancelación, errores y el correo de la identidad confirmada. Una identidad ya
conectada no ofrece iniciar otro flujo. El correo sólo se muestra al dueño en
Configuración, no en su perfil público.

La acción usa `auth.linkIdentity`, con la sesión existente, y reutiliza el
retorno PKCE. No llama a `signInWithOAuth` para vincular. La transacción registra
el UUID original y lo verifica antes y después del intercambio. Cancelar no
cierra la sesión. El callback vuelve a Configuración, también si Google deniega
el consentimiento. El perfil, playlists y aprobación se conservan porque no se
crea otro usuario ni se trasladan datos.

En iOS se abre el navegador de autenticación del sistema. En Electron el nuevo
método `oauthGoogle.abrirVinculacion` abre Google externamente y recoge el retorno
por el receptor loopback existente. Se validan host/ruta de Google, redirect_uri
de Supabase, client_id, state y retorno con nonce/flowId. Un binario anterior sin
ese método pide actualizar antes de iniciar. Se necesita distribuir un nuevo
cliente de PC; los cambios móviles entran en la próxima compilación habitual.

## Activación aplicada

Autorizada por el dueño y aplicada el 9 de septiembre de 2026 en el proyecto
`tdvndpjaxuqhibcpufat`. Se envió únicamente
`{ "security_manual_linking_enabled": true }` y una lectura posterior de la
configuración lo confirmó en `true`, con Google habilitado, `disable_signup`
en `false` y los dos hooks de Auth intactos. Ningún otro campo cambió: la
aprobación de cuentas nuevas sigue siendo una decisión independiente del dueño.

En local, `supabase/config.toml` ya declaraba `enable_manual_linking=true`, pero
el contenedor de Auth venía de un arranque anterior y conservaba
`GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=false`. Se recreó **sólo** ese
contenedor con el mismo `gotrue:v2.195.0`, sus 73 variables, su alias de red
`auth` y su healthcheck, con la bandera en `true`; la base de datos no se tocó
—vive en el volumen `supabase_db_dany`— y el resto del stack siguió corriendo.
Quedó sano y `/auth/v1/health` responde a través de Kong. El proveedor Google
sigue apagado en local a propósito: sus credenciales viven sólo en Supabase.

## Verificación

- Pruebas del cliente: vinculación iOS/web/PC, UUID original, cuenta ya conectada,
  doble click, cancelación, errores, callback incorrecto y cambio de sesión.
- Pruebas Electron con receptor HTTP loopback real y rechazo de URL/nonce ajenos.
- TypeScript, ESLint y exportaciones web/iOS.
- Falta completar consentimiento con una cuenta Google real y comprobar iOS en
  dispositivo. No se vincularon identidades reales durante la implementación.

Referencias: [Supabase Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
y [configuración de Auth](https://supabase.com/docs/reference/api/v1-update-auth-service-config).
