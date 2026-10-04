# dnmusic

A music app for listening together: playlists, chat, song sharing, profiles,
and synchronized Jams. One Expo/React Native codebase runs on iOS, Android,
the web, and the Windows/Linux Electron app.

Sign-in uses Google. New accounts need approval; existing accounts can link
Google from Settings. See [access and authentication](docs/ACCESO-GOOGLE.md).

## Stack and structure

- Expo SDK 57, React Native 0.86, React 19, TypeScript 6 and expo-router.
- NativeWind 4/Tailwind 3.4, Reanimated 4, platform controls through Expo UI
  and local Swift/Kotlin modules.
- expo-audio with maintained patches for DSP and native transitions.
- Supabase: PostgreSQL, Auth, Realtime, Storage and RLS.
- Railway serves the web app and music API; Electron packages the web export.

```text
app/                     Expo Router routes
src/ui/                  Shared and platform-specific components; MotorAudio
src/services/            Music, playlists, messages, profiles and synchronization
src/services/motor/      The phone's audio resolver
src/state/               Shared application stores
src/lib/                 Common helpers and desktop bridges
server/                  Node music service: resolution, cache and analysis
desktop/                Electron shell, resolver, IPC and auto-updates
modules/                 Local Expo modules in Swift and Kotlin
supabase/migrations/     Database schema, permissions, triggers and RPCs
supabase/tests/           Transactional database tests
tests/                   App and integration tests
scripts/                 Development, export and CI helpers
docs/                    Setup, product behavior and technical decisions
```

[The documentation index](docs/README.md) links to each subsystem.
[The design system](docs/DESIGN.md) governs UI changes.

## Local development

Use Node 22 and npm. Docker is required for local Supabase and the music service.
Install the Supabase CLI and start a development stack:

```bash
npm ci
npx supabase start
cp .env.example .env.local
```

Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in
`.env.local` to the local values printed by `supabase status`. The template
already points the music API to port 8787 and shared links to port 8081.
For Docker Compose, create a separate untracked `.env` with the local
`SUPABASE_SERVICE_ROLE_KEY`; see the comments in [.env.example](.env.example).
That key belongs only to the service, never to an `EXPO_PUBLIC_*` variable.

```bash
docker compose up --build music
npm run web
```

The web dev server runs on port 8081. Local Google login also requires your own
OAuth credentials and callback configuration; the local provider is disabled
by default. See [Google setup](docs/ACCESO-GOOGLE.md).

Native clients require a development build because Expo Go does not include
the local modules. Follow [iOS builds](docs/BUILD-IOS.md),
[Android development](docs/ANDROID.md), or [desktop setup](docs/ESCRITORIO.md).

## Validation

Install all three dependency sets when checking the whole repository:

```bash
npm ci
npm --prefix server ci
npm --prefix desktop ci --ignore-scripts
npm run check
npm run build:web
```

`npm run check` runs `typecheck:all`, `test:all`, then lint.
`npm test` tests the app; `npm run test:all` also tests the service and desktop.

Portable DSP tests need a C compiler. Local runs can skip them when one is
unavailable; CI sets `REQUIRE_EQ_DSP_TEST=1` so a missing compiler fails the gate.

Server tests build `server/dist` before importing it; they run before the root
lint, which also resolves service imports. Desktop tests compile the shell and
do not need to launch Electron; `--ignore-scripts` skips its binary download.
A web export checks the JavaScript bundle, not Swift/Kotlin compilation or
playback on a physical device.

Database tests in `supabase/tests/` run against PostgreSQL and roll back their
changes. For example, against the local Supabase database:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/jam.sql
```

The separate message-permissions runner creates and removes an ephemeral
PostgreSQL 17 container:

```bash
docker pull postgres:17
RUN_MESSAGE_DB_TESTS=1 node --test tests/message-actions-db.test.mjs
```

To require both DSP and database tests in the complete check, with a C compiler
and Docker available:

```bash
REQUIRE_EQ_DSP_TEST=1 RUN_MESSAGE_DB_TESTS=1 npm run check
```

On NixOS, the equivalent supplies GCC without changing the system:

```bash
nix shell nixpkgs#gcc --command env REQUIRE_EQ_DSP_TEST=1 RUN_MESSAGE_DB_TESTS=1 npm run check
```

[CI Checks](.github/workflows/ci-checks.yml) defines the production gate.
Use the checks required for the changed subsystem and complete native/device
QA when changing modules, audio, gestures or accessibility.

## Deployment and releases

Production web/API: `https://dnmusic-production-c3f4.up.railway.app`.
Supabase gateway: `https://envoy-production-2fb6.up.railway.app`.
Keep private credentials in the service's secret store.

The Railway service uses the root [Dockerfile](Dockerfile) and
[railway.toml](railway.toml), with `/live` as its healthcheck. Its Git source
is `Niiihuel/dnmusic`, branch `production`, but the deployment trigger is not
configured. Start and verify deployments manually until automation has been
implemented and verified. Protect `production` with the **Types & lint**
check. [Repository maintenance](docs/REPOSITORIO.md) covers migrations,
commit verification, health checks and the retired Vercel configuration.

Schema changes are separate from code deployment. Apply compatible migrations
to the intended database before releasing code that requires them; a code
rollback does not undo a migration.

- iOS: `npm run ios:build` compiles with EAS Cloud;
  `npm run ios:release` also submits. The manual
  [GitHub workflow](docs/BUILD-IOS-GITHUB.md) offers EAS local builds and an
  optional TestFlight submission.
- Android: [GitHub builds](docs/BUILD-ANDROID-GITHUB.md) produce a signed APK
  or AAB. The workflow does not publish to Google Play.
- Desktop: the [release workflow](docs/ESCRITORIO.md#publicar-una-versión)
  builds Windows and Linux. Manual runs default to no publication; pushing
  an `escritorio-v<version>` tag publishes after both builds succeed.

## Audio and sharing

The global audio engine owns playback, queue, repeat, shuffle and device
handoff. Native iOS transitions can start a prepared next track before JS
receives the event; this still requires preparing subsequent tracks in JS.
See [continuous playback](docs/REPRODUCCION-CONTINUA.md) and
[audio patches](patches/README.md) for behavior and device validation.

Desktop and phone resolvers can contribute validated audio to the shared
cache when server resolution fails. Uploads go directly to a quarantine path
in Storage; the service validates and remuxes them before publishing the
canonical audio. See [desktop](docs/ESCRITORIO.md) and
[phone resolver](docs/MOTOR-TELEFONO.md).

The music card adapts Spell UI's visual for chat, sharing and song links.
Audio controls adapt AudioCN's layout to the existing engine and native
controls. They do not create another playback session. Sharing uses native
clipboard APIs on Electron and iOS/Android, with browser fallbacks on web.
See [sharing](docs/COMPARTIR.md) and [audio components](docs/AUDIO_COMPONENTS.md).

## Security and license

Approved sessions, RLS, server guards and RPC checks enforce access. Message
edits and deletions use authorized RPCs; direct updates do not gain those
permissions. Shared public cards contain metadata, not public audio access.
See [message permissions](docs/CHAT-MENSAJES.md) and
[access approval](docs/ACCESO-GOOGLE.md).

Personal project, personal use only. Third-party notices are preserved in
[docs/licenses/](docs/licenses/).
