# dnmusic para escritorio

La misma app que sirve Vercel, adentro de una ventana, con actualizaciones que
se aplican solas. No hay una versión de escritorio del código: `desktop/` es una
cáscara que carga el export de `npm run build:web` sin tocarle una línea.

Windows y Linux. macOS no está: auto-actualizar en Mac exige firma y
notarización de Apple —sin firma válida, Squirrel.Mac no puede reemplazar la
app— y eso es un trámite aparte, no una casilla más en el YAML.

## Dónde está cada cosa

| Archivo | Qué hace |
| --- | --- |
| `desktop/src/main.ts` | La ventana, el menú, el cierre que instala y reabre |
| `desktop/src/protocolo.ts` | Sirve el bundle web desde `app://dnmusic` |
| `desktop/src/actualizador.ts` | Busca, baja e instala; decide **cuándo** |
| `desktop/src/preload.ts` | Lo único que la web puede ver del escritorio |
| `desktop/electron-builder.yml` | Cómo se empaqueta y a qué repo se publica |
| `desktop/scripts/traer-web.mjs` | Copia `dist/` y el ícono adentro de `desktop/` |
| `.github/workflows/escritorio.yml` | Compila los dos sistemas y publica el release |

## Probarlo en local

```bash
npm run build:web          # en la raíz: genera dist/
cd desktop && npm install
npm run dev
```

En desarrollo el actualizador se apaga solo y lo dice en la consola —
`[actualizador] apagado: la app no está empaquetada`—: no tiene contra qué
comparar, porque la versión sale del paquete instalado.

Para ver el instalador de verdad sin publicar nada:

```bash
cd desktop && npm run empaquetar   # queda en desktop/release/
```

### En NixOS, `npm run dev` no arranca

El Electron que baja npm es un binario genérico y NixOS no los ejecuta:

```
Could not start dynamically linked executable: …/node_modules/electron/dist/electron
NixOS cannot run dynamically linked executables intended for generic linux environments
```

Le pasa lo mismo al AppImage recién empaquetado. **Empaquetar sí funciona** —
electron-builder no ejecuta el binario, solo lo copia—, así que esto solo afecta
a probar en esta máquina; el CI corre en Ubuntu y no lo ve.

Lo más cómodo es correr la app con el Electron de nixpkgs, que ya está parcheado:

```bash
nix-shell -p electron --run "electron ."   # desde desktop/
```

Sirve para todo lo que no dependa de la versión exacta (así se verificó esto).
Si querés que ande el binario de npm —y con él `npm run dev` y el AppImage—,
la solución permanente es una línea en `/etc/nixos/configuration.nix`:

```nix
programs.nix-ld.enable = true;
```

## Publicar una versión

Una sola vez, para dejarlo andando:

1. **Crear el repo público de releases** `Niiihuel/dnmusic-releases`. Vacío,
   sin código: solo cuelgan los binarios.
2. **Un token** con permiso de escritura ahí (fine-grained PAT, repo
   `dnmusic-releases`, *Contents: read and write*).
3. **Los secrets** de este repo → Settings → Secrets → Actions:
   `RELEASES_TOKEN`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   y `EXPO_PUBLIC_MUSIC_API`.

Dos trampas de esa lista, las dos vistas al publicar la 1.0.0:

**Los `EXPO_PUBLIC_*` llevan los valores de producción, no los de
`.env.local`.** En el `.env.local` viven el Supabase de Docker y una IP de la
red de casa. Un instalador construido con eso **compila igual** y sale a la
calle sin buscador, sin portada y sin poder iniciar sesión, sin un solo error
que lo explique. Los buenos son los del bundle que sirve Vercel.

**`gh secret set` puede guardar vacío sin avisar.** Sin una terminal
interactiva no muestra el prompt, lee una entrada vacía y la guarda igual; el
secret después aparece en `gh secret list` como cualquier otro. Se distingue en
el bloque `env:` del paso de chequeo: los que tienen valor salen `***`, los
vacíos salen en blanco. La forma que no falla es desde un archivo:

```bash
gh secret set RELEASES_TOKEN --repo Niiihuel/dnmusic < /tmp/tok && shred -u /tmp/tok
```

Después, cada versión es un tag:

```bash
git tag escritorio-v1.1.0
git push origin escritorio-v1.1.0
```

El workflow exporta la web, escribe esa versión en `desktop/package.json`,
compila Windows y Linux y sube los cuatro archivos al release: los dos
instaladores, sus `.blockmap` y el `latest.yml` / `latest-linux.yml` que el
actualizador lee para saber qué hay.

**La versión vive en el tag y en ningún otro lado.** Si además hubiera que
subirla a mano en `desktop/package.json`, el día que te olvides el release sale
publicado con el número viejo, las apps lo comparan contra el suyo, les da igual
y nadie se actualiza nunca. No hay error que ver: simplemente no pasa nada.

## Las decisiones que importan

**Electron y no Tauri, por el audio.** Tauri no trae motor: en Linux usa el
WebKitGTK del sistema, que delega el audio a GStreamer. El catálogo es `.m4a`
—AAC— y decodificar AAC ahí depende de que la máquina tenga instalados
`gst-plugins-bad` y `gst-libav`. En una Ubuntu mínima o una Fedora sin RPM
Fusion, la música no suena, y no es algo que se pueda arreglar desde este
código. Electron empaqueta su propio Chromium con ffmpeg adentro: suena igual en
todas las máquinas, y es exactamente el mismo motor contra el que ya se verifica
la web. El precio es el tamaño —~100 MB contra ~8 MB— y no compra nada frente a
"a alguien no le anda".

**`app://dnmusic` y no `file://`.** En `file://` el origen es opaco y
localStorage no persiste; la sesión de Supabase en web vive justo ahí (ver
`src/lib/supabase.ts`, donde en web se deja el storage por defecto). Con
`file://` habría que iniciar sesión en cada arranque. El esquema propio,
registrado como `standard` + `secure`, es un origen real y estable, y de paso da
contexto seguro para `crypto.subtle` y para la History API que usa expo-router.

**Un chunk que falta devuelve 404, no index.html.** El fallback de SPA es el
mismo que hace `vercel.json` en la web, con el mismo corte: una ruta cae en
index.html, un archivo con extensión que no está devuelve 404. Si le
contestáramos HTML con 200 a un `.js` faltante, el navegador intentaría
ejecutarlo y el error sería `Unexpected token '<'`, que no dice nada de lo que
pasó.

**En Linux, solo AppImage.** Es el único formato que electron-updater sabe
reemplazar. Un `.deb` quedaría clavado en la versión con la que se instaló y sin
avisar nada, así que no se publica: es peor ofrecer una vía que no se actualiza
que no ofrecerla.

**No se baja nada mientras suena música.** Es lo mismo que en
[DESCARGAS.md](DESCARGAS.md): llenar la conexión bajando 100 MB de instalador y
cortar lo que estás escuchando ahora es trabajar en contra de lo único que la
app hace. El dato sale de `audio-state-changed` del webContents —Chromium
contando si la página emite audio—, así que el bundle web no necesita enterarse
de que corre adentro de Electron. Se espera medio minuto de silencio antes de
empezar, porque entre dos canciones hay un hueco sin audio y ese hueco no
significa que hayas parado.

**Se instala al cerrar, y vuelve a abrir sola.** Reiniciar en el medio te corta
la canción; instalar al cerrar y ahí terminar te deja con la versión nueva
instalada, la pantalla vacía y el ícono para buscar. Así que el cierre frena, el
instalador corre, y cuando termina lanza la app de nuevo — `quitAndInstall(true,
true)`, silencioso y con relanzamiento. Cerrar dos veces siempre cierra: el
intento se hace una sola vez por sesión.

**El repo de releases es público aunque el del código no lo sea.** Contra un
repo privado, electron-updater necesita un token de GitHub metido adentro de la
app: una credencial de lectura del código fuente repartida a todo el que la
instale y sacable del `.asar` en dos minutos. Con los binarios en un repo aparte
y público, el cliente descarga sin credencial ninguna. GitHub además no cobra el
ancho de banda de los releases, que con ~150 usuarios y ~100 MB por instalador
no es un detalle.

## Mostrar el aviso en la app (opcional)

Hoy la actualización es silenciosa: se baja y se aplica sin decir nada. El
puente para mostrarla ya está expuesto, si alguna vez se quiere un aviso con el
[`Aviso`](../src/ui/Aviso.tsx) de siempre:

```ts
type Puente = {
  actualizacion: {
    alCambiar: (f: (e: { fase: string; version?: string }) => void) => () => void
  }
}
const escritorio = (globalThis as any).dnmusicEscritorio as Puente | undefined

useEffect(() => {
  return escritorio?.actualizacion.alCambiar((e) => {
    if (e.fase === 'lista') mostrarAviso(`Actualización lista: se aplica al cerrar`)
  })
}, [])
```

## Lo que no hace

- **No recuerda el tamaño ni la posición de la ventana.** Abre siempre en
  1180×780.
- **No frena el suspendido de la pantalla mientras suena.** En una laptop con
  la tapa abierta, la máquina se puede dormir en el medio de un disco. Se
  arregla con `powerSaveBlocker`, colgado del mismo `audio-state-changed` que ya
  alimenta al actualizador.
- **No tiene teclas de medios ni controles del sistema.** Play/pausa desde el
  teclado multimedia no hace nada todavía.
- **No está firmado.** En Windows, SmartScreen avisa la primera vez que se
  instala. El auto-update funciona igual; la firma es un certificado pago.
