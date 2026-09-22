import test from 'node:test'
import assert from 'node:assert/strict'
import { invitacionEnTexto } from '../src/lib/invitacionJam.ts'

test('las invitaciones históricas se reconocen sin modificar el mensaje', () => {
  const texto = 'Escuchemos juntos en dnmusic 🎧 https://dnmusic-app.vercel.app/jam/abc123'
  assert.deepEqual(invitacionEnTexto(texto), { codigo: 'ABC123', texto: '' })
})
test('las invitaciones nuevas usan Railway y conservan el comentario', () => {
  assert.deepEqual(invitacionEnTexto('Escuchemos juntos en dnmusic: https://dnmusic-production-c3f4.up.railway.app/jam/abc123'), { codigo: 'ABC123', texto: '' })
  assert.deepEqual(invitacionEnTexto('Venite https://dnmusic-production-c3f4.up.railway.app/jam/ABC123'), { codigo: 'ABC123', texto: 'Venite' })
  for (const url of ['https://dnmusic-production-c3f4.up.railway.app.evil.test/jam/ABC123', 'https://another.up.railway.app/jam/ABC123']) assert.equal(invitacionEnTexto(url), null)
})
test('conserva el comentario personal junto a la invitación', () => {
  assert.deepEqual(invitacionEnTexto('Venite https://dnmusic-app.vercel.app/jam/ABC123'), {
    codigo: 'ABC123',
    texto: 'Venite',
  })
})
test('no transforma dominios ajenos ni códigos inválidos', () => {
  for (const texto of [
    'https://otro.test/jam/ABC123',
    'https://dnmusic-app.vercel.app.evil.test/jam/ABC123',
    'https://dnmusic-app.vercel.app/jam/ABC123456789',
    'https://dnmusic-app.vercel.app/jam/AB',
    'ABC123',
    'Hola',
  ]) {
    assert.equal(invitacionEnTexto(texto), null, texto)
  }
})
