# Política remota de actualizaciones

Las migraciones de fuentes `20260918000000` y políticas `20260919000000` se
aplicaron al Supabase vinculado de DMusic el 9 de septiembre de 2026, tras
verificar en dry-run que eran las únicas pendientes. No se crearon políticas:
ninguna versión queda obligatoria hasta que el administrador la configure.
Las pruebas SQL locales finalizaron con ROLLBACK. Después se aplicaron ambas
migraciones al entorno local, también sin crear políticas.
El cliente todavía requiere distribución; no se publicó una versión en esta tarea.

## Integración raíz

`app/_layout.tsx` envuelve `Chrome` con `ControlActualizaciones`, por fuera del
Stack y de `SessionGate`. Incluye rutas y overlays; `StatusBar` y `SplashAnimado`
permanecen afuera. El bloqueo sustituye Chrome, incluyendo su motor de audio;
al revocarse vuelve a montar navegación y sesión.

La píldora de escritorio está envuelta con `AvisoActualizacionSinPolitica`, que
oculta el aviso anterior cuando la política activa cubre una versión posterior
a la instalada. Sin política aplicable conserva su funcionamiento original.

## Funcionamiento

- Plataformas: `windows`, `linux`, `macos`, `ios`, `android`, `web`.
- Campos: `latest_version`, `minimum_version`, `update_url`, `enabled`, `revision`.
- Versiones estables `major.minor.patch`, componentes entre 0 y 999999, sin
  prefijos, prereleases, metadata ni ceros iniciales. Comparación numérica.
- `instalada < mínima`: bloqueo sin cerrar, atrás, Escape ni excepción admin.
  La preferencia de avisos y los descartes no afectan este caso.
- `mínima <= instalada < última`: tarjeta opcional descartable, también mediante
  Escape/atrás del modal. Respeta la preferencia existente de avisos.
- Un descarte persiste por plataforma + última versión. Una nueva última versión
  vuelve a avisar; elevar la mínima siempre prevalece sobre un descarte.
- Caché local validada, con lectura limitada a 1.5 segundos. Tras hidratarla,
  `Chrome` se monta sin esperar los 12 segundos máximos de la consulta remota.
  Si la caché ya obliga, el bloqueo se muestra antes de terminar la consulta.
- Consulta al arrancar, al volver a estado activo, y cada 15 minutos mientras
  la app está activa. Web/Electron también escuchan foco, visibilidad y `online`.
  Hay un único reloj y las consultas concurrentes comparten la misma promesa.
- Los polls no desmontan Chrome salvo al pasar a una política obligatoria.
- Errores, timeout y respuestas inválidas conservan la política conocida. Una
  respuesta válida `null` (sin fila) o `enabled=false` retira el bloqueo. Sin
  caché y sin red, se permite continuar: no se inventa una obligación que el
  dispositivo todavía no conoce. Una caché ilegible tampoco inventa un bloqueo.
- Versión instalada: IPC `app:version` en escritorio; `nativeApplicationVersion`
  en iOS/Android; `Constants.expoConfig.version` en web. Electron se reconoce por
  el puente, y su OS por el user agent. Un navegador móvil recibe política web.
  Un puente sin versión/OS identificable o un build no estable informa error y
  no recibe una política de otra plataforma. Expo Go no es un binario de DMusic
  válido para comprobar el comportamiento de versiones móviles.
- La UI usa el actualizador existente si tiene una descarga al menos tan nueva
  como `latest_version`; ofrece descargar o instalar/reiniciar cuando procede.
  El enlace de descarga siempre queda disponible, incluso si Electron no se
  puede actualizar solo. Abrir el enlace nunca levanta por sí solo un bloqueo.

Este es un bloqueo de interfaz para clientes que incorporen el control. No es
atestación de binarios ni un bloqueo de API por versión. Clientes anteriores,
modificados o que borren su almacenamiento quedan fuera de esa garantía. Hay
que distribuir primero una versión que incluya el control antes de exigir
mínimos a esa base de instalaciones.

## Administración en Ajustes

Entrar con la cuenta del dueño y abrir **Ajustes → Actualizaciones**. La sección
se muestra con `useIsAccessAdmin()`, y ambas RPC administrativas vuelven a
verificar en base de datos `app_private.is_admin()`: UUID fijado y cuenta aprobada,
nunca el nombre mutable `nihuel` ni `user_metadata`.

1. Elegir plataforma. Se cargan las políticas ya guardadas y sus revisiones.
2. Escribir la última versión que realmente esté distribuida y su URL.
3. Para avisos opcionales, mínima `0.0.0`. Para obligar a actualizar a las
   anteriores a una versión elegida, fijarla como mínima. **Hacer obligatoria la
   última** copia la última versión al campo mínimo, sin guardar todavía.
4. **Abrir destino para verificar** y comprobar que esa versión está disponible
   para esa plataforma y para los destinatarios (incluido acceso a TestFlight).
5. Activar la política, **Revisar y guardar**, y confirmar el resumen concreto.
   El guardado sólo se presenta como exitoso cuando responde la RPC. Para
   desactivar, apagar el interruptor y confirmar otro guardado.

Los destinos permitidos son HTTPS, sin credenciales, puertos ni fragmentos:
releases de `github.com/Niihuel/dnmusic-releases`, App Store/TestFlight para iOS,
Google Play con el package `com.nihuel.dnmusic` o releases para Android, y
`https://dnmusic-app.vercel.app/` (con query opcional) para web. Para incorporar
otro host legítimo, ampliar a la vez el validador TypeScript y SQL y sus pruebas.
La validación comprueba la forma y el destino permitido; **no prueba por HTTP que
un instalador exista ni que una tienda ya haya aprobado ese release**. No se
precargan URLs ficticias. En web hay que publicar la nueva versión y comprobar
su disponibilidad en PWA/service worker antes de subir la mínima.

La revisión enviada actúa como compare-and-swap: otro dispositivo no puede
sobrescribir silenciosamente una política más reciente. Ante conflicto,
recargar y revisar nuevamente.

## Base de datos y aplicación específica

Requiere `20260916000000_access_approval.sql` y el dueño ya fijado. El archivo nuevo
es `supabase/migrations/20260919000000_update_policies.sql`, posterior a fuentes
`20260918000000`. No modifica cuentas ni perfiles ni selecciona un admin por nombre.

- Tabla privada con RLS y sin grants de lectura/escritura directa, incluso para
  el cliente admin y `service_role`.
- RPC `update_policy(p_platform)` pública para `anon`, `app_pending` y
  `authenticated`. Sólo devuelve plataforma, versiones, destino, enabled y
  revisión; no expone el UUID del dueño.
- RPC `admin_update_policies()` y `admin_save_update_policy(...)`: ejecución
  exclusiva para `authenticated`, con comprobación administrativa dentro.
- Nuevo pre-request `check_update_policy_access()` permite exactamente la ruta
  `/rpc/update_policy`. Para cualquier otra ruta delega en el guard existente
  `check_app_access()`, preservando los controles de aprobación.
- La migración configura `authenticator.pgrst.db_pre_request` con ese wrapper y
  notifica recarga de configuración y esquema de PostgREST. No basta con crear
  la RPC y omitir este paso: fallaría la lectura antes del login.

Prueba local, sin dejar la migración aplicada (necesita el dueño fijado, otra
cuenta aprobada y que la tabla nueva todavía no exista):

```sh
node scripts/test-update-policies-local.mjs
```

Para reproducir la migración en una base local que todavía no la tenga:

```sh
docker exec -i supabase_db_dany psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/migrations/20260919000000_update_policies.sql
```

El remoto ya registra ambas migraciones en su historial. En otros entornos,
revisar siempre el dry-run y aplicar sólo las pendientes esperadas; no repetir
SQL directamente ni alterar su historial sin comprobar el estado.

Verificación posterior (lectura):

```sql
select count(*) from app_private.update_policies; -- 0 tras aplicar sin publicar políticas
select public.update_policy('windows'); -- null
select rolconfig from pg_roles where rolname='authenticator';
```

Si faltan las RPC, Ajustes informa el error de infraestructura y solicita aplicar
la migración; no anuncia que el sistema esté activo. Además del SQL, se requiere
distribuir el cliente que integra la UI. `expo-application` queda declarado como
dependencia directa para leer la versión del binario en móviles; incluirlo en
la próxima compilación nativa habitual.

## Recuperación si el dueño también queda bloqueado

No existe excepción admin en la pantalla obligatoria. Se puede administrar desde
otra instalación soportada. Como alternativa, el dueño del proyecto puede
retirar la política de una plataforma en SQL Editor, por medio de la misma RPC
con su identidad administrativa fijada. Este ejemplo **desactiva Windows**;
cambiar la plataforma si corresponde:

```sql
begin;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', (select user_id from app_private.access_owner), 'role', 'authenticated'
)::text, true);
with p as (select public.update_policy('windows') as v)
select public.admin_save_update_policy(
  v->>'platform', v->>'latest_version', v->>'minimum_version',
  v->>'update_url', false, (v->>'revision')::integer
) from p where v is not null;
commit;
```

Los clientes retirarán el bloqueo al recuperar red y consultar la política.

## Validación y referencias

- `node --test tests/politica-actualizacion.test.mjs`: comparación, plataformas,
  destinos, descarte, bloqueo, timeout, caché, arranque sin espera de red,
  ciclo de vida, deduplicación, permisos presentados en UI y confirmación admin.
- `node scripts/test-update-policies-local.mjs`: SQL real con roles anónimo,
  pendiente, usuario aprobado no admin, identidad inexistente, dueño y servicio;
  valida grants, guard de API, constraints, conflicto, publicación/revocación y
  ausencia de cambios después de ROLLBACK. No elimina ni modifica cuentas.
- `npm run typecheck` y `npm --prefix desktop run typecheck`.
- Las pruebas UI de esta tarea ejercitan render y acciones con mocks; no
  sustituyen una comprobación visual en dispositivos ni una instalación real.

Las RPC usan `security definer`, búsqueda de esquema fija y grants explícitos
siguiendo [Supabase: Database Functions](https://supabase.com/docs/guides/database/functions).
La identificación móvil usa [Expo Application](https://docs.expo.dev/versions/latest/sdk/application/)
y los eventos de reanudación siguen [React Native AppState](https://reactnative.dev/docs/appstate).
