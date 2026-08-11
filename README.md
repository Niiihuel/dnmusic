# dnmusic 🎧

Un reproductor de música para dos personas, con un canal de mensajes al lado.
Tus listas, la portada, los álbumes y los artistas viven en el panel del medio;
el chat es el otro modo de la misma pantalla, y un mensaje puede llevar un
**fragmento de canción** con su letra sincronizada.

> Un regalito hecho con cariño. 💛

Arrancó como una app de mensajería con flores 3D (se llamaba Dany, después
Flora) y terminó siendo, sobre todo, música. De aquello no queda código.

## Stack

| Capa | Tecnología |
|------|------------|
| App | **Expo SDK 57** (React Native 0.86, React 19) + TypeScript |
| Rutas | expo-router (SPA, `web.output: single`) |
| Estilos | NativeWind 4 + Tailwind 3.4, tokens propios |
| Animación | react-native-reanimated |
| Backend | **Supabase** — Postgres + Realtime + Auth + RLS |
| Web / PC | react-native-web → PWA instalable |
| Hosting | Vercel (`vercel.json` incluido) |

Un solo código TypeScript para el iPhone de ella, tu PC y la app nativa, sin
reescribir nada.

### PWA hoy, build nativo cuando haga falta

La PWA es el camino corto: ella abre la URL, hace **"Agregar a pantalla de
inicio"** y le queda un ícono que abre sin la barra de Safari. Desde iOS 16.4 las
PWA instaladas soportan Web Push, así que las notificaciones también funcionan
(solo si está agregada a la pantalla de inicio, no abierta en una pestaña).

Lo que la PWA **no** puede dar es el audio en segundo plano con la pantalla
bloqueada ni los controles nativos del sistema. Para eso hace falta un build de
verdad —EAS o `expo prebuild` + fastlane en un runner macOS— y la cuenta de
Apple Developer.

## Estructura

```
app/                     Rutas (expo-router)
  _layout.tsx            Arranque de sesión + redirección
  sign-in.tsx            Login de los 2 usuarios
  index.tsx              Los tres paneles: biblioteca, contenido, lo que suena
  compose.tsx            Escribir un mensaje
  song.tsx               Elegir el fragmento de una canción
  message/[id].tsx       Un mensaje a pantalla completa
src/
  models/                Message, SongSnippet
  services/              auth.ts, messages.ts (realtime), music.ts, playlists.ts
  state/                 store.ts (useSyncExternalStore), session.ts, playback.ts
  lib/                   supabase.ts
  ui/                    PlaylistView, AlbumPanel, ArtistPage, NowPlayingBar…
server/                  Servicio de música (Node): resuelve audio de YouTube
supabase/migrations/     Tablas + RLS + trigger + realtime
public/                  manifest.json + íconos PWA
scripts/inject-pwa.mjs   Inyecta las etiquetas PWA en el export
docs/DESIGN.md           El sistema de diseño; se sigue sin excepciones
docs/MUSICA.md           De dónde sale el audio y por qué
docs/BUILD-IOS.md        Cómo se buildea para iPhone (EAS)
```

## Desarrollo local (Docker)

Todo el stack de Supabase corre en contenedores: Postgres, Auth (GoTrue),
Realtime, PostgREST y Studio. No hace falta ninguna cuenta ni conexión a
internet para desarrollar.

```bash
npm install
npx supabase start        # levanta el stack y aplica supabase/migrations/
```

El comando imprime la `API_URL` y la `ANON_KEY` locales. Ponelas en `.env.local`
(`cp .env.example .env.local`). Son las claves de desarrollo estándar del CLI —
idénticas en toda instalación local y sin ningún valor fuera de tu máquina.

### Crear los usuarios y el par

```bash
# Los 2 usuarios (no hay registro abierto en la app)
SRK=$(npx supabase status -o json | python3 -c 'import sys,json;print(json.load(sys.stdin)["SERVICE_ROLE_KEY"])')
for EMAIL in vos@ejemplo.com ella@ejemplo.com; do
  curl -s -X POST http://127.0.0.1:54321/auth/v1/admin/users \
    -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"<CONTRASEÑA>\",\"email_confirm\":true}"
done
```

Después, en **Studio** (http://127.0.0.1:54323) o por `psql`, vinculalos:

```sql
insert into public.pairs (id) values (gen_random_uuid()) returning id;

insert into public.pair_members (pair_id, user_id) values
  ('<PAIR_ID>', '<TU_USER_ID>'),
  ('<PAIR_ID>', '<SU_USER_ID>');
```

### Correr la app

```bash
npm run web        # http://localhost:8081
npm run typecheck  # tsc --noEmit
npm run build:web  # export estático + etiquetas PWA → dist/
npx supabase stop  # apagar el stack
```

## Producción

Creá un proyecto en [supabase.com](https://supabase.com) y aplicá el mismo
esquema:

```bash
npx supabase link --project-ref <REF>
npx supabase db push        # aplica supabase/migrations/
```

Repetí los pasos de usuarios y par contra el proyecto hosteado, y poné su URL y
anon key en las variables de entorno de Vercel. **Nunca** uses ahí la
`service_role` key: saltea RLS por completo.

### Deploy

```bash
vercel            # usa vercel.json: build:web → dist/, con rewrite de SPA
```

Después, en el iPhone de ella: abrir la URL en **Safari** → Compartir →
**Agregar a pantalla de inicio**.

## Modelo de seguridad

Las policies de RLS en `supabase/migrations/` son el único control de acceso, y
están verificadas con 11 casos contra un Postgres real:

- Solo los miembros del par leen sus mensajes; un tercero autenticado ve **0**.
- Solo podés insertar mensajes de los que sos remitente.
- Solo el **receptor** puede marcar `opened_at` / `read_at`, nunca el remitente.
- El texto, el remitente y la fecha son **inmutables** tras el insert
  (lo impone un trigger, porque una policy de UPDATE no puede comparar contra la
  fila vieja).
- Los timestamps los pisa el servidor con `now()`: el reloj del cliente no cuenta.
- Nadie borra mensajes (no hay policy de DELETE).

## Estado actual

Funcionando y verificado:

- [x] Scaffold Expo + TypeScript, `tsc --noEmit` limpio
- [x] NativeWind con tokens de diseño, tema claro/oscuro por `data-theme`
- [x] Esquema SQL + RLS, probado contra Postgres real (11/11)
- [x] Auth, conversaciones en tiempo real, composer y visor de mensajes
- [x] Música: buscador, listas propias, álbumes, artistas y cola con letra
- [x] PWA instalable: manifest, íconos, deep links, cero errores de consola

Pendiente:

- [ ] Ícono propio (hoy es el placeholder de Expo)
- [ ] Botones ⏮⏭ en la pantalla bloqueada de iOS: expo-audio no los registra,
      hace falta un módulo Expo local en Swift (ver `expo/expo#43538`)
- [ ] Build de iOS de la app Expo — el pipeline viejo compilaba el scaffold Swift
- [ ] Web Push para avisar "te llegó un mensaje"

## Licencia

Privado. Solo para uso personal de las dos personas.
