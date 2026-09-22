import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const code=ts.transpileModule(readFileSync('src/services/actividadEscucha.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const api={};new Function('exports','require',code)(api,()=>({VIGENCIA_ESCUCHA_MS:65000}))
const ahora=1760000000000
const track={id:'private-id',videoId:'abcdefghijk',title:'Tema\n bonito\u0000',artist:'Artista',durationMs:180000,audioPath:'user/private.m4a',artworkPath:'private-cover',artworkUrl:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',token:'secret'}
const entrada={track,sonando:true,autorizada:true,actualizadoEn:ahora-20000,posicionMs:24000,ahora}

test('payload compartido excluye secretos, normaliza texto y distingue posición de fecha del latido',()=>{
 const result=api.actividadParaCompartir(entrada)
 assert.deepEqual(result,{title:'Tema bonito',artist:'Artista',durationMs:180000,positionMs:24000,updatedAt:ahora-20000,sampledAt:ahora,expiresAt:ahora+45000,trackUrl:'https://music.youtube.com/watch?v=abcdefghijk',artworkUrl:track.artworkUrl})
 assert.doesNotMatch(JSON.stringify(result),/private|secret|audioPath|artworkPath/)
})
test('sin permiso explícito, audio real, fecha válida o con canción terminada devuelve null',()=>{
 for(const patch of [{autorizada:false},{autorizada:'yes'},{sonando:false},{actualizadoEn:null},{actualizadoEn:NaN},{actualizadoEn:ahora-65000},{actualizadoEn:ahora+66000},{posicionMs:180000},{track:{title:' '}}])assert.equal(api.actividadParaCompartir({...entrada,...patch}),null)
})
test('carátulas privadas/firmadas/locales y URLs con credenciales nunca cruzan al puente',()=>{
 for(const artworkUrl of ['file:///tmp/audio','http://i.ytimg.com/a','https://evil.test/a','https://user:pass@i.ytimg.com/a','https://i.ytimg.com/a?token=secret','https://project.supabase.co/storage/v1/object/sign/artwork/a?token=secret','https://project.supabase.co/storage/v1/object/public/audio/a']){
  const result=api.actividadParaCompartir({...entrada,track:{...track,videoId:'upload:private',artworkUrl}})
  assert.equal(result.artworkUrl,undefined);assert.equal(result.trackUrl,undefined)
 }
 assert.ok(api.actividadParaCompartir({...entrada,track:{...track,artworkUrl:'https://project.supabase.co/storage/v1/object/public/artwork/a.jpg'}}).artworkUrl)
 const railway='https://envoy-production-2fb6.up.railway.app/storage/v1/object/public/artwork/a.jpg'
 assert.equal(api.actividadParaCompartir({...entrada,track:{...track,artworkUrl:railway}}).artworkUrl,railway)
 for(const artworkUrl of [railway.replace('envoy-production-2fb6','another'),railway.replace('/public/','/sign/'),railway+'?token=private']) assert.equal(api.actividadParaCompartir({...entrada,track:{...track,artworkUrl}}).artworkUrl,undefined)
})


test('la actividad vence al terminar la canción aunque el próximo sondeo no llegue',()=>{
 const result=api.actividadParaCompartir({...entrada,posicionMs:178000})
 assert.equal(result.expiresAt,ahora+2000)
 const unknown=api.actividadParaCompartir({...entrada,track:{...track,durationMs:0}})
 assert.equal(unknown.expiresAt,ahora+45000)
})
