# Build de iOS

La app es Expo, así que el build lo hace **EAS** en la nube. No hace falta una
Mac, ni Xcode, ni certificados a mano.

Esto reemplaza al pipeline viejo (`fastlane` + `xcodegen` + runner macOS), que
compilaba el scaffold Swift `DanyApp/` — otra app, borrada junto con las flores.

## Qué necesitás

- La cuenta de **Apple Developer** paga (la tenés).
- Una cuenta de Expo, gratis: `expo.dev`.
- El iPhone a mano la primera vez, para registrarlo.

## Los tres perfiles

`eas.json` define tres, y hacen cosas distintas:

| Perfil | Para qué | Cómo llega al teléfono |
|---|---|---|
| `development` | El **development client**: la app con todo el código nativo, pero cargando el JS desde tu Metro. Es la que necesitás para probar el audio en segundo plano y, más adelante, el módulo Swift de los botones ⏮⏭. | Link/QR, instalación directa |
| `preview` | Un build de release, sin Metro. Para probar como queda de verdad. | Link/QR, instalación directa |
| `production` | El que va a TestFlight y a la App Store. | TestFlight |

`development` y `preview` usan **distribución interna**: se instalan escaneando
un QR, sin pasar por TestFlight. Por eso el teléfono tiene que estar registrado.

## Puesta a punto (una sola vez)

```bash
npm i -g eas-cli          # o usá npx eas-cli en cada comando
eas login                 # tu cuenta de Expo
eas init                  # crea el proyecto y escribe extra.eas.projectId en app.json
eas device:create         # registra el iPhone: te da un QR, ella instala el perfil
```

En `eas device:create` elegís "Website" y se abre un link. Al abrirlo **desde el
iPhone** se instala un perfil de configuración y el UDID queda registrado en tu
cuenta de Apple. Sin este paso, un build interno no se instala en ese teléfono.

Los certificados y provisioning profiles los genera y guarda EAS solo: la
primera vez que corras un build te pide el Apple ID y el código de dos factores,
y después no lo vuelve a pedir. No hay repo de `match` que mantener.

## Buildear

```bash
npm run ios:dev           # development client
npm run ios:preview       # release instalable
npm run ios:release       # producción + subida a TestFlight
```

Cuando termina te da un link. Abriéndolo desde el iPhone, se instala.

Con el development client puesto, el día a día es el de siempre:

```bash
npx expo start --dev-client
```

y escaneás el QR. El JS se recarga igual que en Expo Go, pero con el código
nativo de verdad: audio en segundo plano, controles del sistema y cualquier
módulo nativo propio.

## El servicio de música

`EXPO_PUBLIC_MUSIC_API` apunta a `http://localhost:8787` en el perfil de
desarrollo, que desde el teléfono **no resuelve**: `localhost` es el teléfono
mismo. Para probar en el iPhone, poné la IP de tu máquina en la red local:

```json
"env": { "EXPO_PUBLIC_MUSIC_API": "http://192.168.0.X:8787" }
```

Para `preview` y `production` hay que apuntarlo al servicio publicado. Hoy no
hay ninguno: el contenedor de `server/` corre solo en tu máquina.

## Cuánto sale

El plan gratuito de EAS trae una cantidad limitada de builds por mes y cola
compartida (la espera en hora pico puede ser larga). Los cupos cambian seguido:
mirá `expo.dev/pricing` antes de planificar una tanda.

## Por qué no GitHub Actions

Se puede: `expo prebuild` + CocoaPods + fastlane en un runner `macos-15`. Pero
en repo privado los runners macOS gastan minutos a **10×** —los 2000 gratis son
~200 minutos de macOS, y un build con pods son 15-25— y encima hay que mantener
a mano los certificados con `match`, que es la parte que más se rompe.

Si algún día querés que buildee solo al pushear, el camino es un workflow que
**llame a EAS** (`eas build --non-interactive`), no que compile en Actions. Lo
mejor de los dos: la automatización de Actions y las credenciales de EAS.
