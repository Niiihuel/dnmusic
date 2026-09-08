# Acceso con aprobación — activo en DMusic

Activado el 7 de septiembre de 2026 con autorización explícita del dueño:
migración `20260916000000`, bootstrap UUID verificado de @nihuel, ambos hooks Auth,
Realtime `private_only=true` y servidor `dnmusic-api.vercel.app`
(`dpl_BKaFitdqMtL9qSzjw5f4RusrBqdg`). Backfill, permiso admin, lectura de perfil y
solicitudes, lógica de hooks y grants verificados por SQL con ROLLBACK;
configuración confirmada por Management. Salud HTTP 200 y acceso anónimo HTTP 401.

Google quedó habilitado en producción el 8 de septiembre de 2026, con sus
credenciales guardadas únicamente en Supabase. La configuración local permanece
desactivada para no distribuir secretos. Escritorio 1.12.0 incorpora el cliente
OAuth y permitirá completar la prueba real; iOS queda para una entrega separada.
Los binarios móviles anteriores requieren actualización para los canales privados.
Ver [configuración de Google](../docs/ACCESO-GOOGLE.md).

La migración `20260916000000_access_approval.sql` no habilita Google ni elige un
administrador por nombre. El backfill aprueba todas las cuentas existentes. Las
altas posteriores sólo aceptan el proveedor Google controlado por Auth y nacen
pendientes, incluso si `user_metadata` intenta declarar aprobación o privilegios.

## Contrato del cliente

- `access_status()` devuelve **objeto JSON**, no array: `{status: 'pending' |
  'approved' | 'rejected', is_admin: boolean}`. Sin fila de acceso falla cerrado
  como pendiente; la llamada requiere JWT (incluye el rol `app_pending`).
- `access_requests()` devuelve filas `{user_id, email, display_name, username,
  avatar_url, status, requested_at, decided_at}`. Sólo dueño aprobado. Incluye
  todos los estados; pendientes primero, luego `requested_at ASC, user_id ASC`.
  Email/nombres/avatar pueden ser null. Avatar es metadata de presentación, nunca
  una prueba de identidad o autoridad.
- `decide_access(p_user_id uuid, p_approve boolean)` devuelve objeto JSON
  `{user_id, status: 'approved' | 'rejected', decided_at}`. Permite volver a aprobar
  un rechazado; no permite modificar el dueño ni conceder administración.
- Recheck no vuelve a crear una solicitud. Después de aprobar hay que refrescar
  la sesión: el hook cambia el rol del próximo JWT de `app_pending` a
  `authenticated`. Rechazar bloquea inmediatamente las siguientes consultas DB y
  servidor incluso con JWT anterior. Una conexión Realtime ya autorizada puede
  conservar permisos hasta reautenticarse/desconectarse (ver límites abajo).

## Controles y superficies

1. `app_private.access_accounts` y `access_owner` carecen de grants de datos para
   clientes y tienen RLS. La autoridad se fija por UUID en `access_owner`.
2. Restrictive RLS sobre todas las tablas actuales de `public`, Storage objects /
   buckets y Realtime messages. Se suma a las policies existentes; no amplía las
   reglas de pertenencia de listas, chat o Jam.
3. `check_app_access` como `pgrst.db_pre_request`: protege Data API / GraphQL por
   PostgREST. Las excepciones son estado propio y login legacy sintético; ni
   siquiera aprobado puede consultar solicitudes si no es el dueño.
4. Cada RPC SECURITY DEFINER accesible a clientes mantiene su OID, firma y ACL
   autorizada pero delega a implementación privada después de verificar aprobación.
   Esto cierra el bypass de RLS de sus propietarios. Las implementaciones privadas
   no reciben EXECUTE de clientes. Nuevas tablas/RPC deben añadir el guard; las
   pruebas SQL auditan cobertura. Defaults de nuevas funciones ya no conceden
   EXECUTE público.
5. `access_token_hook` emite JWT sin privilegios de tablas para pendiente/rechazado.
   El rol `app_pending` no hereda `authenticated`. Protege también suscripciones
   Postgres Changes/DELETE, donde sólo una policy RLS no basta.
6. `songs` conserva su estado privado. `artwork`, `covers`, `avatars`, `showcases`
   y `decoraciones` conservan sus URLs públicas: son presentación pública, no
   credenciales ni autorización de acceso a la app. La migración no modifica
   `storage.buckets.public`. RLS protege operaciones autenticadas/listados/escritura
   y audio privado; no pretende ocultar esas imágenes públicas.
7. Los cuatro servicios (`jam`, `escucha`, `contacts`, `messages`) ya crean canales
   con `config.private=true`, incluidos los que sólo usan Postgres Changes para
   poder unirse con private-only. Las policies permiten `escucha:<auth.uid()>` e
   `inbox:<auth.uid()>` propios, `jam:<uuid>` si es miembro y `messages:<uuid>` si
   pertenece al par. Las policies de cada tabla siguen filtrando Postgres Changes.
8. `server/src/acceso.ts` valida `auth.getUser(token)` y pregunta por ese UUID a
   `access_user_approved`, ejecutable sólo por service_role. Tanto `index.ts` como
   `livianas.ts` lo usan, sin caché positiva. Salud y el relay push con secreto
   conservan su contrato de infraestructura; `/img` sólo sirve imágenes ya
   públicas de Google/YouTube mediante allowlist y no puede acceder a Storage.

## Secuencia de despliegue y próximas instalaciones

No desplegar el cliente que exige `access_status` antes de que exista la RPC.
Tampoco desplegar guards de servidor antes de la migración: fallan cerrados cuando
falta el RPC. Preparar los tres artefactos y coordinar una ventana de actualización.

1. En una instalación nueva, mantener Google deshabilitado mientras no haya credenciales. Deshabilitar
   **altas** email/phone/anónimas; conservar login por contraseña de cuentas
   existentes. No apagar globalmente las sesiones. La configuración local ya
   propone `[auth.email].enable_signup=false`; producción la administra el dueño.
2. Preparar el cliente con los cuatro canales privados incluidos en este cambio.
   No se requiere migración de URLs firmadas de imágenes. Los móviles anteriores
   conservan sus imágenes; necesitan actualizar para usar Realtime private-only.
3. En la ventana coordinada: aplicar migración, fijar UUID del dueño con el script
   explícito, desplegar servidor y cliente preparado. Con Google deshabilitado no
   entran cuentas nuevas; el backfill conserva aprobadas las existentes.
4. Activar en Auth estos hooks Postgres (ambos son necesarios):
   - Before User Created: `public.before_user_created_google`.
   - Custom Access Token: `public.access_token_hook`.
   Sus rutas locales figuran en `supabase/config.toml`. El archivo no modifica el
   proyecto remoto; Management/Dashboard requieren configuración equivalente.
5. Realtime Settings: desactivar **Allow public access** (private-only), junto con
   cliente compatible. Las policies SQL no pueden desactivar por sí solas el
   transporte de canales públicos. Desconectar/reautenticar conexiones antiguas.
6. Validar una sesión existente aprobada, estado admin del UUID fijado, servicios,
   medios privados y canales. Luego configurar Google y sus redirect URIs, probar
   un alta controlada pendiente, acceso denegado en todas las superficies, decisión
   admin y refresh de JWT. Recién entonces habilitar nuevas altas Google.

No hay dependencia de Google para que un usuario **existente** aprobado consulte
las RPC de acceso. No se debe fingir aprobación en el cliente si la migración falta.

## Bootstrap explícito

Verificar el UUID existente directamente en Auth por un operador confiable. No
inferirlo en runtime a partir de `username`, email o metadata enviada por cliente.
El script es idempotente para el mismo UUID y rechaza sustituir un dueño ya fijado.

```sh
psql "$DATABASE_URL" -v owner_uuid=UUID_VERIFICADO -f supabase/scripts/bootstrap_access_owner.sql
```

Sólo `postgres` tiene EXECUTE al bootstrap; está en un schema no expuesto. Un
usuario nuevo debe ser aprobado explícitamente por un operador antes de poder
usarse como bootstrap. No se incluyó ningún UUID de pruebas/local en la migración.

## Validación local

`supabase/tests/access_approval.sql` usa fixtures locales y termina con ROLLBACK.
Para probar Auth/roles se requiere el usuario local `supabase_admin`: el rol
`postgres` local no tiene permiso de SET ROLE hacia `supabase_auth_admin`.
La migración se probó ejecutándola como `postgres`, y el harness cambia a
`supabase_admin` antes de simular los distintos actores. Esta prueba local no modifica producción; la activación remota autorizada se realizó después.
En esa fase, la migración quedó aplicada en Docker local y se volvió a ejecutar la prueba
sobre esa DB aplicada. Se registraron las versiones 20260914000000–20260916000000;
el historial local anterior tiene migraciones manuales sin registrar y no se alteró.
La CLI instalada rechaza `local_smtp`, por lo que se usó psql con una transacción
y registro explícito en `supabase_migrations.schema_migrations`.

La prueba incluye matriz anon/app_pending/authenticated stale/approved/admin/
service_role, metadata falsa, RPC definers, Storage, Realtime RLS, reaprobar,
protección del dueño, backfill, bootstrap y auditoría de cobertura completa.

Resultado: 11 de 12 suites SQL pasan. `jam_tocar_cola.sql` conserva un fallo previo
 de orden (`v1,p1,v2,p2,p3` frente a `v1,p1,p2,p3,v2`), reproducido con el test de
 HEAD y la DB anterior al gate. No se modificó su expectativa ni lógica de cola.
 Los fixtures de las suites existentes declaran proveedor Google y reciben
 aprobación sólo mediante setup SQL privilegiado dentro de su ROLLBACK.
 Siete pruebas de canales/reconexión y nueve pruebas de servidor pasan; TypeScript,
 ESLint de los archivos afectados y `git diff --check` pasan.

### Cron y llamadas privilegiadas

La inspección read-only de DB local y remoto no encontró `cron.job`; no hay tareas
pg_cron que preservar en esas bases. No se encontró tampoco RPC pública de
mantenimiento con nombre cron/cleanup/purge/limpiar/expire/prune. No se añade un
bypass genérico para cron: funciones exclusivas de service_role conservan sus
permisos, y los wrappers aceptan ese rol en llamadas servidor autenticadas.
Antes de añadir un job SQL sin JWT debe definirse una entrada privada específica,
no dar acceso a clientes por excepción al gate. La prueba de servidor verifica
que el UUID venga de Auth y que cada solicitud consulte aprobación vigente.

## Límites reales

- Ningún gate puede borrar datos que ya se descargaron, ni revocar retroactivamente
  una URL firmada entregada a un aprobado hasta que venza. Revisar TTL/caché y
  las imágenes de los buckets visuales siguen siendo públicas por diseño.
- Realtime autoriza canales privados al unirse/renovar JWT; el cambio DB por sí solo
  no expulsa una conexión previamente aprobada. El rol `app_pending` bloquea altas
  nuevas antes de obtener datos; para revocación inmediata de conexiones antiguas
  se requiere desconexión/reautenticación del servicio además de este gate.
- Google real y conexiones Realtime privadas deben verificarse al configurar el
  proveedor/servicio. Las pruebas SQL no simulan una autenticación OAuth real.

Fuentes oficiales:
[API y alcance de pre-request](https://supabase.com/docs/guides/api/securing-your-api),
[Auth hooks](https://supabase.com/docs/guides/auth/auth-hooks),
[Realtime privado](https://supabase.com/docs/guides/realtime/authorization),
[Postgres Changes y DELETE](https://supabase.com/docs/guides/realtime/postgres-changes).
