const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { join } = require('node:path')
const { DiscordPresence, FramesDiscord, frameDiscord, actividadDiscord, rutasDiscord } = require('../dist/discord-presence')
const { registrarDiscord } = require('../dist/discord-ipc')

const ID = '123456789012345678' // Synthetic fixture; never used by production configuration.
function snapshot(now, extra = {}) {
  return { title: 'Una canción', artist: 'Artista', durationMs: 180000, positionMs: 30000, updatedAt: now, expiresAt: now + 45000, ...extra }
}
class FakeSocket extends EventEmitter {
  destroyed = false; writable = true; frames = []
  write(buffer) { this.frames.push(...new FramesDiscord().push(buffer)); return true }
  end(buffer) { if (buffer) this.write(buffer); this.writable = false; return this }
  destroy() { this.destroyed = true; this.emit('close'); return this }
  destroySoon() { return this.destroy() }
  receive(opcode, body) { this.emit('data', frameDiscord(opcode, body)) }
  commands() { return this.frames.filter(f => f.opcode === 1).map(f => JSON.parse(f.body)) }
  ready() { this.emit('connect'); this.receive(1, { cmd: 'DISPATCH', evt: 'READY', data: { v: 1 } }) }
  ack(command = this.commands().at(-1)) { this.receive(1, { cmd: 'SET_ACTIVITY', nonce: command.nonce, data: {} }) }
}
function harness() {
  let now = 1800000000000, next = 0
  const timers = new Map(), sockets = [], states = []
  const presence = new DiscordPresence(s => states.push(s), {
    now: () => now, paths: ['socket-0', 'socket-1'],
    connect: () => { const socket = new FakeSocket(); sockets.push(socket); return socket },
    later: (fn, delay) => { const id = ++next; timers.set(id, { fn, at: now + delay }); return id },
    cancel: id => timers.delete(id),
  })
  function advance(ms) {
    const target = now + ms
    for (;;) {
      const ready = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
      if (!ready) break
      const [id, timer] = ready; timers.delete(id); now = timer.at; timer.fn()
    }
    now = target
  }
  return { presence, sockets, states, advance, now: () => now, enable: () => presence.configurar({ enabled: true, applicationId: ID }) }
}

test('framing handles partial headers, joined payloads, ping bytes and bounds', () => {
  const parser = new FramesDiscord(), one = frameDiscord(1, { evt: 'READY' }), ping = frameDiscord(3, Buffer.from([0, 255, 13]))
  assert.deepEqual(parser.push(one.subarray(0, 3)), [])
  assert.deepEqual(parser.push(one.subarray(3, 9)), [])
  const frames = parser.push(Buffer.concat([one.subarray(9), ping]))
  assert.equal(JSON.parse(frames[0].body).evt, 'READY')
  assert.deepEqual(frames[1].body, Buffer.from([0, 255, 13]))
  const bad = Buffer.alloc(8); bad.writeUInt32LE(1024 * 1024, 4)
  assert.throws(() => parser.push(bad), /grande/)
  assert.equal(rutasDiscord('win32')[0], '\\\\?\\pipe\\discord-ipc-0')
  assert.equal(rutasDiscord('linux', { XDG_RUNTIME_DIR: '/run/user/1000', TMPDIR: '/bad' })[9], join('/run/user/1000', 'discord-ipc-9'))
})

test('disabled and unconfigured never connect; invalid ID rejected without changing consent', () => {
  const h = harness()
  h.presence.publicar(snapshot(h.now()))
  assert.equal(h.sockets.length, 0)
  assert.throws(() => h.presence.configurar({ enabled: true, applicationId: 'secret' }))
  assert.equal(h.presence.estado().enabled, false)
  h.presence.configurar({ enabled: true, applicationId: '' })
  h.presence.publicar(snapshot(h.now()))
  assert.equal(h.presence.estado().status, 'unconfigured')
  assert.equal(h.sockets.length, 0)
})

test('only matching SET_ACTIVITY acknowledgement marks published; metadata uses listening and Unix seconds', () => {
  const h = harness(); h.enable()
  h.presence.publicar(snapshot(h.now(), { updatedAt: h.now() - 10000 }))
  const socket = h.sockets[0]; socket.ready()
  assert.equal(JSON.parse(socket.frames[0].body).client_id, ID)
  assert.equal(h.presence.estado().status, 'ready')
  const cmd = socket.commands()[0]
  assert.equal(cmd.cmd, 'SET_ACTIVITY'); assert.equal(cmd.args.pid, process.pid)
  assert.equal(cmd.args.activity.type, 2)
  assert.equal(cmd.args.activity.timestamps.start, Math.floor((h.now() - 30000) / 1000))
  socket.receive(1, { cmd: 'SET_ACTIVITY', nonce: 'stale' })
  assert.equal(h.presence.estado().status, 'ready')
  socket.ack(cmd)
  assert.equal(h.presence.estado().status, 'published')
  socket.receive(3, Buffer.from([0, 255]))
  assert.equal(socket.frames.at(-1).opcode, 4)
  assert.deepEqual(socket.frames.at(-1).body, Buffer.from([0, 255]))
  h.presence.limpiar()
})

test('latest activity coalesces while waiting for ack and rate interval; pause clears immediately', () => {
  const h = harness(); h.enable(); h.presence.publicar(snapshot(h.now()))
  const socket = h.sockets[0]; socket.ready()
  h.presence.publicar(snapshot(h.now(), { title: 'Segunda' }))
  h.presence.publicar(snapshot(h.now(), { title: 'Última' }))
  assert.equal(socket.commands().length, 1)
  socket.ack(); h.advance(4999)
  assert.equal(socket.commands().length, 1)
  h.advance(1)
  assert.equal(socket.commands().at(-1).args.activity.details, 'Última')
  const pending = socket.commands().at(-1)
  h.presence.publicar(null)
  assert.equal(socket.commands().at(-1).args.activity, null)
  assert.equal(socket.destroyed, false)
  socket.ack(pending) // An old track ACK must not confirm the clear.
  socket.ack(); h.advance(45000)
  assert.equal(h.presence.estado().status, 'ready')
  assert.equal(h.sockets.length, 1)
})

test('heartbeat expiry clears published presence and no stale replay follows connection restart', () => {
  const h = harness(); h.enable(); h.presence.publicar(snapshot(h.now(), { expiresAt: h.now() + 20000 }))
  const socket = h.sockets[0]; socket.ready(); socket.ack()
  h.advance(20000)
  assert.equal(socket.commands().at(-1).args.activity, null)
  socket.ack()
  assert.equal(h.presence.estado().status, 'ready')
  h.advance(60000)
  assert.equal(h.sockets.length, 1)
})

test('connection errors scan the known sockets; reconnect uses latest fresh state, opt-out cancels retry', () => {
  const h = harness(); h.enable(); h.presence.publicar(snapshot(h.now()))
  h.sockets[0].emit('error', new Error('absent'))
  assert.equal(h.sockets.length, 2)
  const socket = h.sockets[1]; socket.ready(); socket.ack(); socket.destroy()
  h.presence.publicar(snapshot(h.now(), { title: 'Reconexion' }))
  h.advance(15000)
  const newer = h.sockets[2]; newer.ready(); newer.ack()
  assert.equal(newer.commands()[0].args.activity.details, 'Reconexion')
  newer.destroy()
  h.presence.configurar({ enabled: false, applicationId: ID })
  h.advance(45000)
  assert.equal(h.sockets.length, 3)
  assert.equal(h.presence.estado().status, 'disabled')
})

test('Discord rejection and missing acknowledgement are surfaced, never mistaken for publication', () => {
  const h = harness(); h.enable(); h.presence.publicar(snapshot(h.now()))
  const socket = h.sockets[0]; socket.ready()
  socket.receive(1, { cmd: 'SET_ACTIVITY', evt: 'ERROR', nonce: socket.commands()[0].nonce, data: { message: 'secret payload' } })
  assert.equal(h.presence.estado().status, 'error')
  assert.ok(!h.presence.estado().error.includes('secret payload'))
  h.advance(15000); h.sockets[1].ready(); h.advance(10000)
  assert.equal(h.presence.estado().status, 'error')
  assert.match(h.presence.estado().error, /confirmó/)
  h.presence.limpiar()
})

test('activity validation enforces freshness and public-only assets with no arbitrary properties', () => {
  const now = 1800000000000
  assert.equal(actividadDiscord(snapshot(now, { updatedAt: now - 65000 }), now), null)
  assert.equal(actividadDiscord(snapshot(now, { expiresAt: now }), now), null)
  assert.equal(actividadDiscord(snapshot(now, { positionMs: NaN }), now), null)
  assert.equal(actividadDiscord(snapshot(now, { positionMs: 180000 }), now), null)
  assert.equal(actividadDiscord(snapshot(now, { artist: '' }), now).activity.state, 'Artista desconocido')
  const trackUrl = 'https://music.youtube.com/watch?v=dQw4w9WgXcQ'
  assert.equal(actividadDiscord(snapshot(now, { trackUrl }), now).activity.buttons[0].url, trackUrl)
  assert.equal(actividadDiscord(snapshot(now, { trackUrl: trackUrl + '&token=secret' }), now).activity.buttons, undefined)
  const artworkUrl = 'https://project.supabase.co/storage/v1/object/public/artwork/test.jpg'
  assert.equal(actividadDiscord(snapshot(now, { artworkUrl }), now).activity.assets.large_image, artworkUrl)
  const railway = artworkUrl.replace('project.supabase.co', 'envoy-production-2fb6.up.railway.app')
  assert.equal(actividadDiscord(snapshot(now, { artworkUrl: railway }), now).activity.assets.large_image, railway)
  for (const invalid of [railway.replace('envoy-production-2fb6', 'another'), railway.replace('/public/', '/sign/'), railway + '?token=private']) {
    assert.equal(actividadDiscord(snapshot(now, { artworkUrl: invalid }), now).activity.assets, undefined)
  }
  assert.equal(actividadDiscord(snapshot(now, { artworkUrl: artworkUrl.replace('/public/', '/sign/') }), now).activity.assets, undefined)
  assert.equal(actividadDiscord(snapshot(now, { artworkUrl: artworkUrl + 'x'.repeat(300) }), now).activity.assets, undefined)
  const result = actividadDiscord(snapshot(now, { audioUrl: 'https://secret', userId: 'private', artworkUrl: 'https://i.ytimg.com/image?token=secret', trackUrl: 'file:///audio.mp3', expiresAt: now + 999999 }), now)
  assert.equal(result.expiresAt, now + 65000)
  assert.equal(result.activity.assets, undefined); assert.equal(result.activity.buttons, undefined)
  assert.deepEqual(Object.keys(result.activity).sort(), ['details', 'state', 'status_display_type', 'timestamps', 'type'])
  assert.equal(actividadDiscord(snapshot(now, { artworkUrl: 'https://i.ytimg.com/vi/id/hqdefault.jpg' }), now).activity.assets.large_image, 'https://i.ytimg.com/vi/id/hqdefault.jpg')
})

test('Electron bridge only accepts main app frame and forwards the limited methods', async () => {
  const handlers = new Map(), calls = []
  const frame = { url: 'app://dnmusic/index.html' }, contents = { mainFrame: frame, isDestroyed: () => false }
  registrarDiscord({ handle: (name, fn) => handlers.set(name, fn) }, {
    estado: () => ({ status: 'disabled' }), configurar: value => calls.push(['configurar', value]), publicar: value => calls.push(['publicar', value]),
  }, () => contents)
  const allowed = { sender: contents, senderFrame: frame }
  assert.deepEqual(handlers.get('discord:estado')(allowed), { status: 'disabled' })
  handlers.get('discord:publicar')(allowed, null)
  assert.deepEqual(calls, [['publicar', null]])
  for (const method of ['estado', 'configurar', 'publicar']) {
    assert.throws(() => handlers.get(`discord:${method}`)({ ...allowed, senderFrame: { url: frame.url } }), /Emisor/)
    frame.url = 'https://dnmusic.app/'
    assert.throws(() => handlers.get(`discord:${method}`)(allowed), /Emisor/)
    frame.url = 'app://dnmusic/index.html'
  }
})


test('real local socket transports handshake, activity, acknowledgement and clear', { timeout: 4000 }, async t => {
  const { createServer } = require('node:net')
  const { mkdtemp, rm } = require('node:fs/promises')
  const { tmpdir } = require('node:os')
  const { join } = require('node:path')
  const dir = await mkdtemp(join(tmpdir(), 'dnmusic-rpc-'))
  const path = process.platform === 'win32' ? `\\\\?\\pipe\\dnmusic-rpc-test-${process.pid}` : join(dir, 'discord-ipc-0')
  const received = [], peers = []
  let cleared, published, idle
  idle = () => {}
  const clearPromise = new Promise(resolve => { cleared = resolve })
  const publishPromise = new Promise(resolve => { published = resolve })
  const server = createServer(socket => {
    peers.push(socket)
    const parser = new FramesDiscord()
    socket.on('data', chunk => {
      for (const frame of parser.push(chunk)) {
        const command = JSON.parse(frame.body); received.push(command)
        if (frame.opcode === 0) socket.write(frameDiscord(1, { cmd: 'DISPATCH', evt: 'READY', data: { v: 1 } }))
        else {
          socket.write(frameDiscord(1, { cmd: 'SET_ACTIVITY', nonce: command.nonce, data: command.args.activity }))
          if (command.args.activity === null) cleared()
        }
      }
    })
  })
  const client = new DiscordPresence(state => { if (state.status === 'published') published(); if (state.status === 'ready') idle() }, { paths: [path] })
  t.after(async () => { client.limpiar(); for (const peer of peers) peer.destroy(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }) })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(path, resolve) })
  client.configurar({ enabled: true, applicationId: ID }); client.publicar(snapshot(Date.now()))
  await publishPromise
  assert.equal(received[0].client_id, ID)
  assert.equal(received[1].args.activity.type, 2)
  const clearedState = new Promise(resolve => { idle = resolve })
  client.publicar(null); await clearPromise; await clearedState
  assert.equal(client.estado().status, 'ready')
})

test('preload exposes only typed Discord operations and strips privileged event arguments', async () => {
  const { readFileSync } = require('node:fs'), { runInNewContext } = require('node:vm')
  const ipc = new EventEmitter(), calls = [], states = []
  ipc.invoke = async (...args) => { calls.push(args); return {} }
  let bridge
  runInNewContext(readFileSync(require.resolve('../dist/preload'), 'utf8'), { process: { platform: process.platform }, exports: {}, require: name => {
    assert.equal(name, 'electron')
    return { contextBridge: { exposeInMainWorld: (_name, api) => { bridge = api } }, ipcRenderer: ipc }
  } })
  assert.deepEqual(Object.keys(bridge.discord), ['estado', 'configurar', 'publicar', 'alCambiar'])
  const off = bridge.discord.alCambiar(state => states.push(state))
  const state = { status: 'ready' }
  ipc.emit('discord:estado', { sender: 'privileged' }, state)
  off(); ipc.emit('discord:estado', {}, state)
  assert.deepEqual(states, [state]); assert.equal(ipc.listenerCount('discord:estado'), 0)
  await bridge.discord.estado(); await bridge.discord.configurar({ enabled: false, applicationId: '' }); await bridge.discord.publicar(null)
  assert.deepEqual(calls.map(args => args[0]), ['discord:estado', 'discord:configurar', 'discord:publicar'])
})


test('track end bounds freshness; disable during handshake destroys without unframed commands', () => {
  const h = harness(); h.enable()
  h.presence.publicar(snapshot(h.now(), { durationMs: 31000, positionMs: 30000 }))
  const socket = h.sockets[0]; socket.ready(); socket.ack()
  h.advance(1000)
  assert.equal(socket.commands().at(-1).args.activity, null)
  socket.ack()
  h.presence.limpiar()
  h.presence.publicar(snapshot(h.now()))
  const waiting = h.sockets[1]
  h.presence.configurar({ enabled: false, applicationId: ID })
  assert.equal(waiting.destroyed, true)
  assert.equal(waiting.commands().length, 0)
  waiting.emit('connect'); waiting.ready()
  assert.equal(waiting.frames.length, 0)
})


test('explicit connection verifies READY without playing; idle pause keeps the same socket', () => {
  const h = harness(); h.enable()
  assert.equal(h.presence.estado().status, 'connecting')
  const socket = h.sockets[0]
  socket.ready()
  assert.equal(h.presence.estado().status, 'ready')
  assert.equal(socket.commands().length, 0, 'connecting must not fabricate music')
  h.presence.publicar(null); h.advance(60000)
  assert.equal(h.sockets.length, 1); assert.equal(socket.destroyed, false)
  h.presence.publicar(snapshot(h.now())); socket.ack()
  assert.equal(h.presence.estado().status, 'published')
  h.presence.publicar(null); const clear = socket.commands().at(-1)
  assert.equal(clear.args.activity, null); socket.ack(clear)
  assert.equal(h.presence.estado().status, 'ready')
  h.presence.publicar(snapshot(h.now(), { title: 'Otra canción' })); socket.ack()
  assert.equal(h.presence.estado().status, 'published')
  assert.equal(h.sockets.length, 1)
  h.presence.configurar({ enabled: false, applicationId: ID }); h.advance(60000)
  assert.equal(socket.destroyed, true); assert.equal(h.sockets.length, 1)
  assert.equal(h.presence.estado().status, 'disabled')
})

test('retry works without music and opt-out cancels retries and late handshakes', () => {
  const h = harness(); h.enable()
  h.sockets[0].emit('error', new Error('absent')); h.sockets[1].emit('error', new Error('absent'))
  assert.equal(h.presence.estado().status, 'disconnected')
  h.enable() // Manual retry does not wait for the scheduled reconnection.
  assert.equal(h.sockets.length, 3)
  h.sockets[2].ready(); assert.equal(h.presence.estado().status, 'ready')
  h.sockets[2].destroy(); h.advance(15000)
  const pending = h.sockets[3]
  h.presence.configurar({ enabled: false, applicationId: ID })
  pending.ready(); h.advance(60000)
  assert.equal(pending.frames.length, 0); assert.equal(h.sockets.length, 4)
  assert.equal(h.presence.estado().status, 'disabled')
})


test('retry renews a READY pipe and identifies the active Discord account locally', () => {
  const h = harness(); h.enable()
  const old = h.sockets[0]
  old.emit('connect'); old.receive(1, { cmd: 'DISPATCH', evt: 'READY', data: { user: { username: 'friend', id: 'private-id', email: 'private-email' } } })
  assert.equal(h.presence.estado().account, 'friend')
  assert.ok(!JSON.stringify(h.presence.estado()).includes('private-'))
  h.presence.publicar(snapshot(h.now())); old.ack()
  assert.equal(old.commands().at(-1).args.activity.status_display_type, 1)
  h.enable()
  assert.equal(old.destroyed, true)
  assert.equal(h.presence.estado().account, undefined)
  const fresh = h.sockets[1]; fresh.ready(); fresh.ack()
  assert.equal(h.presence.estado().status, 'published')
  h.presence.limpiar()
})

test('Windows access denial survives pipe scanning and a valid later pipe still wins', () => {
  const h = harness(); h.enable()
  h.sockets[0].emit('error', Object.assign(Error('private path'), { code: 'EACCES' }))
  h.sockets[1].emit('error', Object.assign(Error('missing'), { code: 'ENOENT' }))
  assert.match(h.presence.estado().error, /administrador/)
  assert.ok(!h.presence.estado().error.includes('private path'))
  h.advance(15000)
  h.sockets[2].ready()
  assert.equal(h.presence.estado().status, 'ready')
  assert.equal(h.presence.estado().error, undefined)
  h.presence.limpiar()
})

test('RPC rejection and CLOSE preserve safe numeric diagnostics, never server text', () => {
  const h = harness(); h.enable()
  h.sockets[0].receive(2, { code: 4000, message: 'secret' })
  assert.match(h.presence.estado().error, /no reconoce/)
  h.advance(15000); h.sockets[1].ready(); h.presence.publicar(snapshot(h.now()))
  h.sockets[1].receive(1, { evt: 'ERROR', nonce: h.sockets[1].commands().at(-1).nonce, data: { code: 4006, message: 'secret' } })
  assert.match(h.presence.estado().error, /no autorizó/)
  assert.ok(!h.presence.estado().error.includes('secret'))
  h.presence.limpiar()
})


test('la posición se ancla a sampledAt y no vuelve a sumar la edad del latido remoto', () => {
 const now = 1800000000000
 const sent = snapshot(now, { positionMs: 90000, updatedAt: now - 20000, sampledAt: now })
 const immediate = actividadDiscord(sent, now)
 const delayed = actividadDiscord(sent, now + 2500)
 assert.equal(immediate.activity.timestamps.start, Math.floor((now - 90000) / 1000))
 assert.deepEqual(delayed.activity.timestamps, immediate.activity.timestamps)
 assert.equal(actividadDiscord({ ...sent, sampledAt: NaN }, now), null)
 assert.equal(actividadDiscord({ ...sent, durationMs: 91000 }, now + 2500), null)
})
