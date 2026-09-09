import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source=readFileSync('src/ui/Tooltip.tsx','utf8')
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
const exports={}
new Function('exports','require',output)(exports,id=>{
 if(id==='react/jsx-runtime')return {jsx:()=>null,jsxs:()=>null}
 if(id==='react')return {useEffect(){}}
 if(id==='react-native')return {Platform:{OS:'web'},StyleSheet:{absoluteFill:{}},Text:'Text',View:'View'}
 if(id.endsWith('/tooltip'))return {useTooltip:()=>null}
 if(id.endsWith('/SuperficieTooltip'))return {SuperficieTooltip:'SuperficieTooltip'}
 return {}
})

test('el tooltip corto conserva la punta sobre un control pegado al borde derecho',()=>{
 const tip={texto:'Me gusta',x:1970,y:400,w:44,h:44}
 const g=exports.geometriaTooltip(tip,2048,1200)
 const centroControl=tip.x+tip.w/2
 const centroPunta=g.left+g.punta+4
 assert.equal(g.ancho,76)
 assert.ok(g.left+g.ancho<=2040)
 assert.ok(Math.abs(centroPunta-centroControl)<=1)
 assert.equal(g.arriba,true)
})

test('el tooltip largo respeta el ancho máximo y cambia abajo cuando no hay lugar arriba',()=>{
 const g=exports.geometriaTooltip({texto:'Mostrar categorías de configuración',x:4,y:2,w:32,h:32},420,800)
 assert.equal(g.ancho,260)
 assert.equal(g.left,8)
 assert.equal(g.arriba,false)
 assert.ok(g.punta>=12)
})
