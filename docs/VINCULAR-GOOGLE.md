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

## Activación pendiente

La lectura de configuración del proyecto vinculado confirmó Google habilitado
y `security_manual_linking_enabled=false`. El intento de habilitar sólo esa
opción fue rechazado por revisión automática: requiere autorización específica
para este cambio de autenticación de alcance global. **No se modificó el remoto.**
El usuario debe autorizar habilitar vinculación manual en DMusic; después se
aplica únicamente `{ "security_manual_linking_enabled": true }` y se verifica.
El control de aprobación de cuentas nuevas sigue siendo independiente.

`supabase/config.toml` declara `enable_manual_linking=true` para futuros arranques
locales. No se reiniciaron contenedores ni se cambió su entorno en ejecución.

## Verificación

- Pruebas del cliente: vinculación iOS/web/PC, UUID original, cuenta ya conectada,
  doble click, cancelación, errores, callback incorrecto y cambio de sesión.
- Pruebas Electron con receptor HTTP loopback real y rechazo de URL/nonce ajenos.
- TypeScript, ESLint y exportaciones web/iOS.
- Falta completar consentimiento con una cuenta Google real y comprobar iOS en
  dispositivo. No se vincularon identidades reales durante la implementación.

Referencias: [Supabase Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
y [configuración de Auth](https://supabase.com/docs/reference/api/v1-update-auth-service-config).
