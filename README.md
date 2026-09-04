# dnmusic

A music app with people at its center: listen, build playlists, and see what the same people you talk to are listening to. One TypeScript codebase runs in the browser, on iPhone, and in its own Windows or Linux window.

It started as a messaging app with 3D flowers (first called Dany, then Flora) and eventually became, above all, a music app. None of that code remains — neither the flowers nor the couple of fixed users: today it has open registration, contact requests, and blocking.

## What it does

| | |
|---|---|
| **Music** | Search, genre-based artwork, albums, artists, recommended radio, and an editable queue |
| **Playlists** | Personal, **public** or private, **collaborative** by link, and importable from Spotify |
| **Profile** | Full-bleed Steam-style background and a draggable showcase mosaic — songs, lyrics, playlists, images, artists, and albums in three sizes |
| **Chat** | Real-time conversations; a message can include a **song snippet** with synchronized lyrics |
| **Jam** | Listen together in sync with a shared queue — join by link or code |
| **Listening** | Your account across multiple devices is **one music session**: the others are mirrors, and using the transport controls hands playback over |
| **Reactions** | Leave an emoji on what a contact is listening to right now; it stays on their profile |
| **Downloads** | Save songs on your phone so they can play offline |
| **Push** | Notifications while the app is closed, on both phone and desktop |

Each major piece has its own document in `docs/`, including the decisions behind it and why they were made.

## Stack

| Layer | Technology |
|------|------------|
| App | **Expo SDK 57** (React Native 0.86, React 19) + TypeScript 6 |
| Routing | expo-router (SPA, `web.output: single`), typed routes |
| Styling | NativeWind 4 + Tailwind 3.4, custom tokens |
| Animation | react-native-reanimated 4 |
| Audio | expo-audio + custom Expo modules in Swift (`modules/`) |
| Backend | **Supabase** — Postgres + Realtime + Auth + Storage + RLS |
| Music service | Node (`server/`) as Vercel functions (`dnmusic-api.vercel.app`); the same handler runs in a container for local development |
| Web / PWA | react-native-web → Vercel (`dnmusic-app.vercel.app`) |
| Desktop | Electron (`desktop/`) — Windows and Linux, with auto-updates |
| iOS | EAS Build + submit to App Store Connect |

### Three platforms, one bundle

The **PWA** is the shortest path: open the URL, choose “Add to Home Screen,” and get an icon without Safari’s address bar. It cannot provide background audio with the screen locked or native controls — that is what the iOS build is for.

The **desktop app** has no separate application code: `desktop/` is a shell that loads the export from `npm run build:web` without changing a line of it. It also acts as an internet fallback — see below.

## Structure

```
app/                     Routes (expo-router)
  index.tsx              The three panels: library, content, and now playing
  sign-in · sign-up      Username login and open registration
  playing · cola         Full-screen player and queue
  lista/ · perfil/       Playlists and other people's profiles
  profile/               Your profile and everything used to edit it
  jam/                   Create, join, people, and options
  ajustes/               Downloads, blocked users, and what's new
  compose · song         Write a message and choose a snippet
src/
  services/              music, playlists, jam, escucha, contacts, profile…
    motor/               The phone's in-app resolver (WebView + BotGuard)
  state/                 Stores using useSyncExternalStore (playback, player, jam…)
  ui/                    Components; MotorAudio is the component that plays audio
  lib/                   supabase, artwork, what's new, and desktop bridges
  models/                Message, SongSnippet, username
server/                  Music service (Node): searches, resolves, and caches
 desktop/                Electron shell + in-app resolver
modules/                 Expo modules in Swift: remote commands, audio routing,
                         and backup exclusion
supabase/
  migrations/            The source of truth for the schema: tables, RLS, triggers, RPCs
  tests/                 SQL tests against a real Postgres database
public/ · scripts/       PWA manifest and icons, plus the injection script
docs/                    DESIGN, MUSICA, JAM, ESCUCHA, PERFIL, LISTAS,
                         DESCARGAS, ESCRITORIO, MOTOR-TELEFONO, BUILD-IOS
```

`docs/DESIGN.md` is the design system and **must be followed without exceptions**.

## Local development

The entire Supabase stack runs in containers — Postgres, Auth, Realtime, PostgREST, and Studio — as does the music service. No account is required.

```bash
npm install
npx supabase start                 # starts the stack and applies supabase/migrations/
cp .env.example .env.local         # paste the API_URL and ANON_KEY it prints here
docker compose up --build music    # music service on :8787
npm run web                        # http://localhost:8081
```

The keys printed by the CLI are standard development keys: identical across local installations and with no value outside your machine. The `service_role` key belongs in a separate `.env` file (without `.local`) — it is the only file Docker Compose reads to resolve `${...}` variables in `docker-compose.yml`.

> **On NixOS**, the Supabase CLI installed through `npx` does not start, while the nixpkgs version is outdated: apply migrations with `docker exec … psql` against the container, then register them manually in the migration ledger.

### Commands

```bash
npm run web          # dev server
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build:web    # static export + PWA tags → dist/
npx supabase stop    # stop the stack
```

The same checks run on every PR (`.github/workflows/ci-checks.yml`) for the app, service, and desktop app.

### Schema tests

RLS policies and RPCs are tested against a real Postgres database, not a mock. Each file runs in **one** transaction that ends with `rollback`, and the identity is simulated by setting the `sub` claim as Supabase does:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/jam.sql
```

There are currently 104 checks across 6 files: Jam, multi-device listening, collaborative playlists, reactions, and contact search.

## Production

**Supabase.** Create the project and apply the same schema:

```bash
npx supabase link --project-ref <REF>
npx supabase db push
```

**Web.** Vercel uses `vercel.json` (`build:web` → `dist/`, with an SPA rewrite). Git deployments are intentionally disabled: publish with `vercel`.

**Music service.** Vercel, deployed with `vercel --prod` from `server/` — not
through git. It used to be a Railway container; nothing of it stayed behind.

It ships as **two** functions behind one origin, split by how heavy they are to
start rather than by what they do:

- `api/index.ts` — the five routes that never touch YouTube (`/img`,
  `/translate`, `/spotify`, `/spotify/canciones`, `/artwork`), served from
  `src/livianas.ts`. A small bundle, so it starts fast. `/img` is the app's
  highest-volume route — one per artwork on screen — and sits behind the CDN,
  which serves repeats without ever reaching the function.
- `api/todo.ts` — everything else. It has no logic of its own: it imports the
  handler from `src/index.ts`, the very same one the container runs, which works
  because Vercel invokes with Node's `(IncomingMessage, ServerResponse)`
  signature — exactly what `createServer` takes. This bundle carries
  youtubei.js and static ffmpeg/ffprobe binaries, around 160 MB.

`vercel.json` maps every route to one of the two with an explicit rewrite that
passes the real path in a `ruta` parameter. A catch-all would be the natural
thing, but it matches a single segment, so `/spotify/canciones` and
`/resolve/progreso` returned a platform 404 without ever reaching the code.

**What did not move, because it cannot.** Downloading audio from YouTube does
not work from a datacenter IP — measured on Vercel, all seven clients answer
`Sign in to confirm you're not a bot`, including IOS and ANDROID_VR, which never
go through BotGuard. It did not work from Railway either, for the same reason,
so nothing was lost in the move. Audio gets into the cache the way it already
did: each device resolves it over its own home IP and contributes it for
everyone (see `docs/ESCRITORIO.md` and `docs/MOTOR-TELEFONO.md`).

jsdom does not load on Vercel at all — Node starts with
`--no-experimental-require-module` and jsdom 28 is CommonJS that `require()`s a
pure-ESM dependency. It is imported lazily so that only BotGuard depends on it:
search, home and albums do not mint tokens and never load it.

**Uploads do not go through the service.** A function caps the request body at
4.5 MB on the free plan, and a five-minute song weighs more. `/aportar` and
`/propia` hand out a single-use signed URL, the client `PUT`s the file straight
to Supabase Storage, and only then asks the server to confirm it. Nothing is
weakened: what gets uploaded lands in a quarantine path the app never plays
from, and the canonical `<videoId>.m4a` is still written only by the server,
after ffprobe and ffmpeg have approved it. The path is derived from the caller's
token rather than sent in the body, so confirming can only ever reach your own
upload. The old body-carrying `/aportar` still answers, for clients that have
not updated.

**iOS.** `npm run ios:release` (production EAS build + automatic submission). Details are in `docs/BUILD-IOS.md`.

**Desktop.** A tag triggers the workflow, which builds both systems and publishes the installers where electron-updater expects them:

```bash
git tag escritorio-v1.2.0 && git push origin escritorio-v1.2.0
```

The `service_role` key must **never** be included in environment variables exposed to the client: it bypasses RLS completely.

## How audio reaches the app

The music service resolves a song and caches it in Storage, so it only has to be downloaded once for everyone. The problem is that YouTube denies audio requests from datacenter IPs — `Sign in to confirm you're not a bot` — while any residential IP can resolve the same song without trouble.

The solution is community-based: when the server's `/resolve` fails, **a device downloads the song through its home IP and contributes it to the shared bucket**. Once one device resolves it, everyone can play it, and the web app finds it in the cache afterward.

Two clients can do this:

- **Desktop**, from Electron's main process (`desktop/src/resolutor.ts`).
- **Phone**, with a hidden WebView that attests to BotGuard and evaluates the JavaScript Hermes cannot (`src/services/motor/`; the rationale is documented in [docs/MOTOR-TELEFONO.md](docs/MOTOR-TELEFONO.md)). It was added for one specific reason: people who only have an iPhone should not depend on someone else turning on a computer.

The browser cannot do either — talking to InnerTube from a web page is blocked by CORS, which is precisely what a native app does not have to deal with — so it continues to use the server.

The alternative path — a residential proxy through which all YouTube traffic can exit — is implemented behind an environment variable (`YT_PROXY_URL`, see `server/src/salida.ts`). Details are in `docs/MUSICA.md` and `docs/ESCRITORIO.md`.

The route out is only part of the story; **how the client identifies itself** matters too. The service presents itself as a real YouTube Music client: it talks to `music.youtube.com` rather than `www`, uses the current client version rather than the one bundled with youtubei.js (a year and a half behind), and keeps one browser session from start to finish across BotGuard attestation, `/player`, and the download. This does not unblock a flagged IP, but it covers everything under our control; each piece is documented in `server/src/salida.ts` and `server/src/youtube.ts`.

## Security model

The RLS policies in `supabase/migrations/` are the only access control. They enforce the following:

- Only conversation members can read messages; an authenticated third party sees **0** messages.
- You can only insert messages where you are the sender, and only the **recipient** can set `opened_at` / `read_at`.
- Text, sender, and timestamp are **immutable** after insertion — a trigger enforces this because an UPDATE policy cannot compare against the old row.
- The server overwrites timestamps with `now()`; the client clock does not count.
- Nobody can delete messages (there is no DELETE policy).
- Messaging someone new requires a **request** that the other person accepts; **blocking** cuts visibility in both directions without deleting anything.
- Contact search goes through an RPC that finds the person you are looking for and does not allow browsing the app's accounts.
- A playlist has two separate permissions: **visibility** (who can read it) and **collaboration** (who can write to it). They are orthogonal.

## Current status

Working and verified:

- [x] Auth with open registration, contacts, requests, and blocking
- [x] Full music experience: search, artwork, albums, artists, queue, and radio
- [x] Personal, public, collaborative, and Spotify-imported playlists
- [x] Profile with background, frames, and draggable showcase mosaic
- [x] Jam and multi-device listening, tested against a real Postgres database
- [x] Downloads for offline listening
- [x] Push notifications while the app is closed, on phone and desktop
- [x] iOS lock screen with transport controls (custom Swift module in `modules/`)
- [x] Installable PWA and desktop app with auto-updates
- [x] Custom icon, clean `tsc --noEmit`, and clean `eslint`

Pending:

- [ ] Publish to the App Store — the EAS build is ready; upload is still pending
- [ ] macOS desktop support: auto-updates require Apple signing and notarization
- [ ] True remote control across devices (pause another device without taking over its music); the modal currently only offers handoff
- [ ] Real device names (“Nihuel's iPhone”); they are currently generic

## License

Private. Personal use only.
