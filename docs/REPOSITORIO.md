# Repositorio de dnmusic

El nombre público de la aplicación y del servicio es **dnmusic**.

## Despliegues

Producción vive en Railway: web/API en
`https://dnmusic-production-c3f4.up.railway.app` y Supabase autogestionado en
el mismo proyecto. No deben crearse despliegues de Vercel desde ninguna rama.
La configuración de bloqueo está en `vercel.json` y `server/vercel.json`,
mediante `git.deploymentEnabled: false`.

Esta regla se aplica al código que la contiene: las ramas antiguas deben
incorporarla antes de volver a publicarse. No elimina sitios alojados ni cambia
dominios existentes. Para retirar Vercel por completo, desconectar el repositorio
y eliminar los proyectos antiguos desde su cuenta, tras revisar los enlaces
publicados y las URLs de retorno de autenticación. Borrar registros de
deployments en GitHub no elimina los sitios alojados en Vercel.

Referencia: https://vercel.com/docs/project-configuration/git-configuration

### Flujo de Railway

La rama destinada a producción es `production` de `Niiihuel/dnmusic`. El
servicio Railway `dnmusic` sirve web y API en un mismo contenedor. El
repositorio fija `Dockerfile` y el healthcheck `/live` en
`railway.toml`; `/health` comprueba además las dependencias de la API.

En **Railway → dnmusic → Settings → Source**, comprobar que la fuente sea el
repositorio `Niiihuel/dnmusic` y que la rama de despliegue sea `production`.
Activar autodeploy y **Wait for CI** solamente después de verificar la conexión
y los permisos de la GitHub App. La última publicación verificada se hizo con
un upload de código; una rama existente y un push, por sí solos, no prueban
que el servicio ya esté conectado a GitHub. Si la fuente sigue siendo un upload,
publicar explícitamente y comprobar el SHA del código publicado.

En GitHub, proteger `production`: exigir PR y el check **Types & lint** del
workflow `.github/workflows/ci-checks.yml`, sin saltar el requisito para las
publicaciones normales. El workflow corre para PR dirigidos a `production` y
para cada push a esa rama. Railway **Wait for CI** espera los workflows del
commit antes de iniciar el despliegue; la protección de rama evita integrar
un PR con CI fallida. El PR #4 sigue en borrador y apunta a otra base: no es
un mecanismo de publicación a `production`.

Las migraciones `20261001000000_playlist_mixes.sql`,
`20261002000000_playlist_rhythm_reorder.sql` y
`20261003000000_music_health_service_role.sql` ya se aplicaron al PostgreSQL
de producción y figuran en su ledger. Supabase es autogestionado en Railway;
no asumir que enlazar el repositorio o desplegar `dnmusic` aplica migraciones.
Para cambios futuros:

1. Revisar la migración y su compatibilidad con la versión que aún está en
   producción. Probarla y respaldar los datos cuando el cambio lo requiera.
2. Aplicarla al PostgreSQL correcto en orden de nombre/versión, registrar su
   versión en el ledger y verificar tablas, políticas RLS, permisos y RPC
   afectados. Evitar volver a ejecutar las tres migraciones ya registradas.
3. Dejar pasar CI, integrar a `production` y desplegar ese commit. Con Git
   conectado y Wait for CI activo, Railway puede hacerlo al recibir el push;
   en caso contrario hay que iniciar y supervisar el despliegue manualmente.
4. Comparar el SHA desplegado con `production` y comprobar que `/live` responda
   `200` JSON, `/health` responda `200` JSON con dependencias sanas, la web
   abra, y `/analysis` y `/peaks` respondan JSON de autorización a solicitudes
   sin sesión (no HTML de la SPA). Confirmar también logs y errores del servicio.

Si una migración rompe la versión anterior, dividir el cambio en fases
compatibles antes de integrarlo. Un rollback de código no revierte el esquema.

Referencias: [Railway GitHub autodeploys](https://docs.railway.com/deployments/github-autodeploys)
y [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

## Identificadores de compatibilidad

El slug de Expo `flora` identifica el proyecto EAS existente, no el nombre
visible de la app. No cambiarlo sin coordinar el proyecto remoto, las
actualizaciones y la firma. Los dominios internos antiguos de autenticación
y los marcadores de tarjetas tampoco deben reemplazarse sin una migración:
pueden seguir siendo necesarios para cuentas y artefactos ya creados.

## Secretos

- Mantener claves privadas y credenciales en el gestor de secretos del servicio,
  nunca en archivos versionados ni en variables `EXPO_PUBLIC_*`.
- `.env.example` sólo debe contener ejemplos. Las claves públicas de Supabase
  con rol `anon` no sustituyen las políticas RLS: nunca incluir `service_role`
  en la aplicación.
- Mantener activados Secret scanning, Push protection y Dependabot alerts en
  GitHub. Revisar las alertas antes de publicar.
- Si una credencial privada se expone, revocarla o rotarla primero. Borrar el
  archivo o un commit no revoca la clave ni elimina copias ajenas.
- No usar `npm audit fix --force` sin revisar los cambios: puede sustituir
  versiones principales de Expo y romper las compilaciones.
