# Compilar iOS en GitHub Actions

Este es el camino alternativo a EAS Cloud: el workflow `iOS — compilar` ejecuta
`eas build --local` en un Mac de GitHub. Expo proporciona la configuración,
la numeración y las credenciales de firma que ya guardamos allí; la compilación
ocurre en GitHub y no consume el cupo de builds de EAS Cloud.

Los runners macOS consumen minutos de GitHub Actions
y pueden generar cargos según el plan y el presupuesto de la cuenta. Por eso el
workflow se inicia manualmente y valida secretos en Linux antes de usar el Mac.

## Ejecutar una compilación

1. Publicá en GitHub los cambios que querés incluir. El workflow compila el
   commit de la rama elegida; no ve cambios locales sin subir.
2. Abrí [Actions → iOS — compilar](https://github.com/Niiihuel/dnmusic/actions/workflows/ios.yml).
3. Elegí **Run workflow**, rama y perfil:
   - `production`: IPA firmado para TestFlight/App Store.
   - `preview`: distribución interna para los iPhones registrados en el perfil.
4. Dejá **Subir a TestFlight** desactivado para generar solamente el IPA.
5. Al terminar, descargá `dnmusic-ios-<perfil>-<ejecución>` desde **Artifacts**.
   El archivo se conserva 7 días. Si se agotó el cupo de artifacts, el workflow
   guarda el IPA en un **borrador de Release** del mismo repositorio; el enlace
   aparece en el resumen del job. Es privado y no actualiza la app de escritorio.
   Esos borradores no vencen automáticamente: podés borrarlos cuando no los necesites.
   El IPA de producción no se instala directamente
   desde Safari: necesita TestFlight/App Store.

El build instala las dependencias con `npm ci` (incluidos los parches), genera
el proyecto iOS de Expo y compila todos los módulos nativos con Xcode 26.6 en
`macos-26`. Si GitHub retira esa versión de Xcode, actualizá `DEVELOPER_DIR` en el
workflow según la [imagen macOS de GitHub](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md).

Se usan las variables públicas del perfil en `eas.json`, no `.env.local`.
`production` conserva `autoIncrement` y la versión remota de EAS. Puede saltarse
un número si una compilación falla después de reservarlo: es normal.

## Credenciales necesarias

En [Settings → Secrets and variables → Actions](https://github.com/Niiihuel/dnmusic/settings/secrets/actions):

| Secreto | Cuándo hace falta | Contenido |
|---|---|---|
| `EXPO_TOKEN` | Siempre | Token de Expo con acceso al proyecto y sus credenciales |
| `ASC_API_KEY_ID` | TestFlight con clave propia | Key ID de App Store Connect |
| `ASC_API_KEY_ISSUER_ID` | TestFlight con clave propia | Issuer ID de App Store Connect |
| `ASC_API_KEY_P8_BASE64` | TestFlight con clave propia | Contenido del archivo `.p8`, codificado en base64 |

No subas tokens, certificados ni archivos `.p8` al repositorio ni los pegues en
el chat. Para guardar una clave desde Linux sin imprimirla en la terminal:

```bash
base64 -w 0 /ruta/segura/AuthKey_XXXXXXXXXX.p8 | gh secret set ASC_API_KEY_P8_BASE64 --repo Niiihuel/dnmusic
```

Los certificados y provisioning profiles de iOS deben estar preparados en EAS
para el perfil elegido. El workflow usa `--freeze-credentials` para evitar
cambios de firma inesperados y no necesita una contraseña de Apple en GitHub.
Si no están disponibles, o vencieron, preparalos una vez en tu computadora:

```bash
npx eas-cli credentials --platform ios
```

Para nuevos iPhones de `preview`, registralos con `eas device:create` y actualizá
el provisioning profile desde `eas credentials`. Cambiar capacidades de iOS
(por ejemplo, Associated Domains) también puede requerir actualizar la firma.

## Envío opcional a TestFlight

Por defecto, EAS Submit reutiliza la API Key para envíos que ya esté guardada
en Expo. No hace falta duplicarla en GitHub. Si todavía no está configurada,
podés prepararla con `eas credentials --platform ios` → perfil production →
App Store Connect, o usar los tres secretos `ASC_API_KEY_*` de GitHub.

Para usar estos secretos, creá una **Team API Key** con rol **App Manager** en
App Store Connect → Users
and Access → Integrations → App Store Connect API. Necesitás permiso para crear
la clave; guardá sus tres valores en los secretos indicados arriba. El proyecto
ya define `ascAppId` y `appleTeamId` en `eas.json`.

Ejecutá el workflow con `production` y **Subir a TestFlight** activado. Después
del build, un job separado descarga el IPA y usa **EAS Submit** para enviarlo a
Apple. Esto sigue utilizando el servicio de envío de Expo, pero no sus builds
en la nube. Apple todavía tiene que procesar el binario; no se publica en la
App Store automáticamente.

Si usás una clave propia en GitHub, se decodifica en una carpeta temporal con permisos privados; nunca se
incluye en los artifacts y se borra al finalizar el job. Si falla únicamente el
envío, el IPA queda descargable (artifact o borrador de Release) y podés usar **Re-run failed jobs** para reintentar
sin volver a compilar. Si la validación inicial falla por secretos faltantes,
corregilos y ejecutá nuevamente.

## Referencias

- [EAS Build local](https://docs.expo.dev/build-reference/local-builds/)
- [Tokens de Expo](https://docs.expo.dev/accounts/programmatic-access/)
- [Credenciales de firma](https://docs.expo.dev/app-signing/syncing-credentials/)
- [Facturación de GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

## Reenviar un IPA guardado sin compilar otra vez

En `iOS — compilar`, elegí `production`, activá TestFlight y completá
`ipa_release` con el tag del borrador `ios-build-ID-INTENTO`. La compilación se
omite y se envía ese IPA con su versión original. El job verifica que sea un
borrador de producción del mismo repositorio. El permiso `contents: write`
en el job de envío permite consultar borradores privados; no publica el borrador.
Dejá el campo vacío para compilar una versión nueva.
