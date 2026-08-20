# dnmusic 🎧

Una app de música con la gente adentro: escuchás, armás listas, y las mismas
personas con las que hablás son las que ves escuchando. Un solo código
TypeScript corre en el navegador, en el iPhone y en una ventana propia de
Windows o Linux.

Arrancó como una mensajería con flores 3D (se llamaba Dany, después Flora) y
terminó siendo, sobre todo, música. De aquello no queda código — ni las flores,
ni el par de usuarios fijos: hoy hay registro abierto, solicitudes de contacto y
bloqueo.

## Qué hace

| | |
|---|---|
| **Música** | Buscador, portada por géneros, álbumes, artistas, radio de recomendadas y cola editable |
| **Listas** | Propias, **públicas** o privadas, **colaborativas** por link, e importables desde Spotify |
| **Perfil** | Fondo a sangre estilo Steam y un mosaico de vitrinas que se arrastra — canciones, versos, listas, imágenes, artistas y álbumes, en tres tamaños |
| **Chat** | Conversaciones en tiempo real; un mensaje puede llevar un **fragmento de canción** con su letra sincronizada |
| **Jam** | Escuchar juntos, sincronizados, con cola compartida — se entra por link o código |
| **Escucha** | Tu cuenta en varios aparatos es **una sola música**: los demás son espejos, y tocar el transporte traspasa |
| **Reacciones** | Dejarle un emoji a lo que un contacto está escuchando ahora; le queda en el perfil |
| **Descargas** | Canciones guardadas en el teléfono para que suenen sin conexión |
| **Push** | Avisos con la app cerrada, en el teléfono y en el escritorio |

Cada pieza grande tiene su documento en `docs/`, con las decisiones y el porqué.

## Stack

| Capa | Tecnología |
|------|------------|
| App | **Expo SDK 57** (React Native 0.86, React 19) + TypeScript 6 |
| Rutas | expo-router (SPA, `web.output: single`), typed routes |
| Estilos | NativeWind 4 + Tailwind 3.4, tokens propios |
| Animación | react-native-reanimated 4 |
| Audio | expo-audio + módulos Expo propios en Swift (`modules/`) |
| Backend | **Supabase** — Postgres + Realtime + Auth + Storage + RLS |
| Servicio de música | Node (`server/`) en Railway — YouTube necesita jsdom y la VM de BotGuard |
| Web / PWA | react-native-web → Vercel (`dnmusic-app.vercel.app`) |
| Escritorio | Electron (`desktop/`) — Windows y Linux, con auto-actualización |
| iOS | EAS Build + submit a App Store Connect |

### Las tres plataformas, un solo bundle

La **PWA** es el camino corto: se abre la URL, "Agregar a pantalla de inicio", y
queda un ícono sin la barra de Safari. Lo que no puede dar es audio en segundo
plano con la pantalla bloqueada ni controles nativos — para eso está el build de
iOS.

El **escritorio** no tiene versión propia del código: `desktop/` es una cáscara
que carga el export de `npm run build:web` sin tocarle una línea. Además hace de
salida a internet — ver más abajo.

## Estructura

```
app/                     Rutas (expo-router)
  index.tsx              Los tres paneles: biblioteca, contenido, lo que suena
  sign-in · sign-up      Login por usuario y registro abierto
  playing · cola         Reproductor y cola a pantalla completa
  lista/ · perfil/       Listas y perfiles ajenos
  profile/               El tuyo, y todo lo de editarlo
  jam/                   Crear, entrar, personas y opciones
  ajustes/               Descargas, bloqueados, novedades
  compose · song         Escribir un mensaje, elegir el fragmento
src/
  services/              music, playlists, jam, escucha, contacts, profile…
  state/                 Stores con useSyncExternalStore (playback, player, jam…)
  ui/                    Los componentes; MotorAudio es el que suena
  lib/                   supabase, artwork, novedades, puentes al escritorio
  models/                Message, SongSnippet, username
server/                  Servicio de música (Node): busca, resuelve y cachea
desktop/                 Cáscara de Electron + resolutor de a bordo
modules/                 Módulos Expo en Swift: comandos remotos, ruta de audio,
                         exclusión del backup
supabase/
  migrations/            La verdad del esquema: tablas, RLS, triggers, RPCs
  tests/                 Pruebas SQL contra un Postgres real
public/ · scripts/       Manifest e íconos PWA, y el script que los inyecta
docs/                    DESIGN, MUSICA, JAM, ESCUCHA, PERFIL, LISTAS,
                         DESCARGAS, ESCRITORIO, BUILD-IOS
```

`docs/DESIGN.md` es el sistema de diseño y **se sigue sin excepciones**.

## Desarrollo local

Supabase entero corre en contenedores —Postgres, Auth, Realtime, PostgREST y
Studio— y el servicio de música en el suyo. No hace falta ninguna cuenta.

```bash
npm install
npx supabase start                 # levanta el stack y aplica supabase/migrations/
cp .env.example .env.local         # pegá ahí la API_URL y la ANON_KEY que imprime
docker compose up --build music    # el servicio de música, en :8787
npm run web                        # http://localhost:8081
```

Las claves que imprime el CLI son las de desarrollo estándar: idénticas en toda
instalación local y sin ningún valor fuera de tu máquina. La `service_role` va
en un `.env` aparte (sin `.local`) — es el único archivo que lee docker compose
para resolver los `${...}` del `docker-compose.yml`.

> **En NixOS**, el CLI de Supabase por `npx` no arranca y el de nixpkgs está
> viejo: las migraciones se aplican con `docker exec … psql` contra el
> contenedor, registrándolas después en el ledger de migraciones a mano.

### Comandos

```bash
npm run web          # dev server
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build:web    # export estático + etiquetas PWA → dist/
npx supabase stop    # apagar el stack
```

Los mismos chequeos corren en cada PR (`.github/workflows/ci-checks.yml`), para
la app, el servicio y el escritorio.

### Las pruebas del esquema

Las policies y los RPCs se prueban contra un Postgres real, no contra un mock.
Cada archivo corre en **una** transacción que termina en `rollback`, y la
identidad se simula fijando el claim `sub` como lo hace Supabase:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/jam.sql
```

Hoy son 104 verificaciones en 6 archivos: Jam, escucha entre dispositivos,
listas colaborativas, reacciones y búsqueda de contactos.

## Producción

**Supabase.** Creá el proyecto y aplicá el mismo esquema:

```bash
npx supabase link --project-ref <REF>
npx supabase db push
```

**Web.** Vercel toma `vercel.json` (`build:web` → `dist/`, con rewrite de SPA).
Los deploys por git están bloqueados a propósito: se publica con `vercel`.

**Servicio de música.** Railway, y se sube con `railway up` — no por git.

**iOS.** `npm run ios:release` (EAS build de producción + auto-submit). El
detalle está en `docs/BUILD-IOS.md`.

**Escritorio.** Un tag dispara el workflow, que compila los dos sistemas y
publica los instaladores donde electron-updater los busca:

```bash
git tag escritorio-v1.2.0 && git push origin escritorio-v1.2.0
```

En las variables de entorno **nunca** va la `service_role` key: saltea RLS por
completo.

## Cómo llega el audio

El servicio de música resuelve la canción y la deja cacheada en Storage, así que
se baja una sola vez para todos. El problema es que YouTube le niega el audio a
las IPs de datacenter —`Sign in to confirm you're not a bot`— mientras cualquier
IP de casa resuelve sin drama.

La salida a esto es comunitaria: cuando el `/resolve` del servidor falla, **la
app de escritorio baja el tema con la IP de esa casa y lo aporta al bucket
común**. Lo que resuelve uno le suena a todos, y la web y el teléfono lo
encuentran después en el caché. Cada usuario de escritorio es una salida más.

El camino alternativo —un proxy residencial por el que salga todo el tráfico a
YouTube— está implementado y es una variable de entorno (`YT_PROXY_URL`, ver
`server/src/salida.ts`). Los detalles, en `docs/MUSICA.md` y `docs/ESCRITORIO.md`.

## Modelo de seguridad

Las policies de RLS en `supabase/migrations/` son el único control de acceso. Lo
que sostienen:

- Solo los miembros de una conversación leen sus mensajes; un tercero
  autenticado ve **0**.
- Solo podés insertar mensajes de los que sos remitente, y solo el **receptor**
  marca `opened_at` / `read_at`.
- El texto, el remitente y la fecha son **inmutables** tras el insert — lo
  impone un trigger, porque una policy de UPDATE no puede comparar contra la
  fila vieja.
- Los timestamps los pisa el servidor con `now()`: el reloj del cliente no cuenta.
- Nadie borra mensajes (no hay policy de DELETE).
- Escribirle a alguien nuevo pide una **solicitud** que la otra persona acepta;
  el **bloqueo** corta la visibilidad en los dos sentidos sin borrar nada.
- Buscar contactos pasa por un RPC que encuentra a quien buscás y **no** deja
  pasearse por las cuentas de la app.
- Una lista tiene dos permisos que no son el mismo: **visibilidad** (quién la
  lee) y **colaboración** (quién la escribe). Son ortogonales.

## Estado actual

Funcionando y verificado:

- [x] Auth con registro abierto, contactos, solicitudes y bloqueo
- [x] Música completa: buscador, portada, álbumes, artistas, cola y radio
- [x] Listas propias, públicas, colaborativas e importadas de Spotify
- [x] Perfil con fondo, marcos y mosaico de vitrinas arrastrable
- [x] Jam y escucha entre dispositivos, probados contra Postgres real
- [x] Descargas para escuchar sin internet
- [x] Push con la app cerrada, en teléfono y escritorio
- [x] Pantalla bloqueada de iOS con ⏮⏭ (módulo Swift propio en `modules/`)
- [x] PWA instalable y app de escritorio con auto-actualización
- [x] Ícono propio, `tsc --noEmit` y `eslint` limpios

Pendiente:

- [ ] Publicar en la App Store — el build de EAS está armado, falta la subida
- [ ] macOS en el escritorio: auto-actualizar exige firma y notarización de Apple
- [ ] Control remoto de verdad entre dispositivos (pausar el otro aparato sin
      traer la música); hoy el modal solo ofrece el traspaso
- [ ] Nombres de dispositivo reales («iPhone de Nihuel»), hoy son genéricos

## Licencia

Privado. Uso personal.
