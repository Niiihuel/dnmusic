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
