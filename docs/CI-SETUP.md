# Setup de CI/CD → TestFlight

Esta guía lleva la app desde el código hasta el iPhone de ella (y el tuyo) por
**TestFlight**, sin necesidad de tener una Mac: todo se compila en GitHub Actions.

> Resumen: Generás certificados en Apple → los guardás encriptados con `fastlane match`
> en un repo privado → los secretos viven en GitHub → cada `git push` compila y sube.

---

## 0. Requisitos

- Cuenta **Apple Developer** pagada ($99/año). ✔ (ya la tenés)
- Cuenta de **GitHub**.
- Repo de **GitHub** con este proyecto (pushealo).
- Acceso a una Mac **solo una vez** para generar los certificados con `match`.
  - Si no tenés Mac: podés generar los certificados desde la Consola de Apple
    y configurar match en modo manual, o pedirle a alguien con Mac 10 minutos.
  - Alternativa sin Mac: usá el primer workflow para compilar y exportar el `.cer`
    vía el portal de Apple (más verboso; ver sección "Sin Mac" al final).

---

## 1. Crear el App ID y el Bundle ID

1. [Apple Developer → Certificates, Identifiers & Profiles → Identifiers](https://developer.apple.com/account/resources/identifiers/list)
2. **+** → App IDs → App → descripción "Dany" �� Bundle ID:
   - **Explicit**: `com.dany.app` (exactamente el del `project.yml`).
3. Capabilities: dejá las que necesites (ninguna obligatoria para el MVP).

---

## 2. Crear una App Store Connect API Key

1. [App Store Connect → Usuarios y acceso → Integraciones → Equipo (API)](https://appstoreconnect.apple.com/access/integrations/api)
2. **Generar API Key**:
   - Nombre: `Dany CI`
   - Acceso: **Admin** (necesario para subir builds y gestionar certificados).
3. Anotá los tres valores (no los podés volver a ver el archivo):
   - **Key ID** (ej. `ABC1234567`)
   - **Issuer ID** (ej. `12345678-abcd-...`)
   - **Archivo `.p8`** (descargalo; `AuthKey_ABC1234567.p8`)

---

## 3. Guardar los certificados con fastlane match (una vez, con Mac)

`match` crea y guarda de forma encriptada el certificado de distribución y el
provisioning profile en un **repo git privado**.

1. Creá un **repo privado vacío** en GitHub, por ejemplo `USUARIO/dany-certificados`.
2. En una Mac (o pidiéndole a alguien), con tu Apple ID conectado:

```bash
brew install fastlane
cd /tmp
git clone https://github.com/USUARIO/dany-certificados.git
cd dany-certificados
git checkout -b main
echo "# Certificados encriptados de Dany" > README.md
git commit -am init && git push -u origin main

# Generar y guardar certificados (te pedirá tu Apple ID + 2FA):
fastlane match appstore \
  --git_url "https://github.com/USUARIO/dany-certificados" \
  --app_identifier "com.dany.app"
```

Te pedirá una **MATCH_PASSWORD** (contraseña de cifrado): anotala.

---

## 4. Configurar los secrets en GitHub

En tu repo de GitHub → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Qué poner |
|--------|-----------|
| `GOOGLE_SERVICE_INFO_PLIST` | Tu `GoogleService-Info.plist` real en **base64**. Generar con: `base64 -i GoogleService-Info.plist \| pbcopy` (Mac) o `base64 -w0 GoogleService-Info.plist` (Linux). |
| `ASC_KEY_ID` | El **Key ID** del paso 2. |
| `ASC_ISSUER_ID` | El **Issuer ID** del paso 2. |
| `ASC_KEY_P8` | El contenido del `.p8` en **base64**: `base64 -w0 AuthKey_XXXX.p8`. |
| `MATCH_PASSWORD` | La contraseña de cifrado del paso 3. |
| `MATCH_GIT_URL` | `https://github.com/USUARIO/dany-certificados`. |
| `DEVELOPMENT_TEAM` | Tu **Team ID** (Member Center → Membership, ej. `A1B2C3D4E5`). |

> El runner necesita acceso de lectura al repo de certificados. Como usás API Key
> Admin, match clonará vía HTTPS; si el repo de certs es privado, agregá un token
> de acceso personal al `MATCH_GIT_URL`
> (`https://x-access-token:TOKEN@github.com/USUARIO/dany-certificados`) o configurá
> `MATCH_GIT_BASIC_AUTHORIZATION`. Lo más simple: dejá el repo de certs **privado**
> y usá un token fine-grained con `Contents: Read`.

También editá **`project.yml`** y **`fastlane/Matchfile`** con tu Team ID y URL reales.

---

## 5. Subir el primer build

```bash
git add -A
git commit -m "feat(ci): build y subida a TestFlight"
git push origin main
```

- GitHub Actions compila en `macos-15`, firma y sube a TestFlight (~10–15 min).
- Mirá el progreso en la pestaña **Actions** del repo.
- Si falla, el log te indica qué secret/certificado revisar.

---

## 6. Probar en TestFlight

1. Entra a [App Store Connect → Mis apps → Dany → TestFlight](https://appstoreconnect.apple.com).
   (La app se crea sola en el primer build subido con ese Bundle ID.)
2. En **Grupo de prueba** agregá tu email y el de ella como testers internos.
3. Llegará un mail con el código de invitación → instalan la app **TestFlight**
   y la abren.

> Los builds de TestFlight **expiran a los 90 días** (la app instalada sigue
> funcionando hasta que la borren, pero para reinstalar hay que re-subir un build).
> Con cada `git push` a `main` generás un build nuevo automáticamente.

---

## Sin Mac: alternativa para generar certificados

Si no conseguís una Mac ni por 10 minutos, podés crear el certificado a mano
desde el portal y alimentar match en modo lectura:

1. Apple Developer → Certificates → crear **Apple Distribution** (subiendo un CSR).
   Para el CSR necesitás una herramienta; lo más práctico es usar el primer run de
   GitHub Actions en modo "generar certs" (hay actions de la comunidad como
   `yanamura/...`) — **es más fricción que pedir 10 minutos de Mac**.
2. Recomendación fuerte: conseguí una Mac una sola vez (amigo, ciber, Mac cloud de
   pago por uso). Después nunca más la necesitás.

---

## Minutos de macOS de GitHub (ojo)

- Los runners **macOS** consumen la cuota **x10** (1 min macOS = 10 min de cuota).
- Repo **público**: minutos generosos (gratis).
- Repo **privado** en plan gratis: ~200 min macOS reales/mes ≈ 15-20 builds.
- Si te quedás corto: **Codemagic** da 500 min/mes gratis de macOS, y soporta
  `fastlane`. Es la alternativa recomendada para iterar mucho sin pagar.
