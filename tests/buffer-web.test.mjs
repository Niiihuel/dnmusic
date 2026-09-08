import test from 'node:test'
import assert from 'node:assert/strict'
import { prepararBuffer, liberarBuffer } from '../src/lib/prepararBuffer.web.ts'

test('carga validada crea una fuente local y liberarla la elimina', async t => {
  t.mock.method(globalThis,'fetch', async()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'audio/mp4'}}))
  const uri=await prepararBuffer('https://example.test/song',new AbortController().signal)
  assert.match(uri,/^blob:/)
  liberarBuffer(uri)
})
test('una respuesta HTTP fallida no se ofrece como audio',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response('error',{status:403}))
  await assert.rejects(prepararBuffer('https://example.test/song',new AbortController().signal),/403/)
})
test('la cota de memoria se aplica aun sin Content-Length',async t=>{
  let cancelada=false
  t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(17*1024*1024))},cancel(){cancelada=true}})))
  await assert.rejects(prepararBuffer('https://example.test/song',new AbortController().signal),/excede/)
  assert.equal(cancelada,true)
})
test('una descarga cancelada no publica un blob tardío',async t=>{
  const abort=new AbortController()
  t.mock.method(globalThis,'fetch',async()=>{abort.abort();return new Response(new Uint8Array([1]))})
  await assert.rejects(prepararBuffer('https://example.test/song',abort.signal),/incompleta/)
})
