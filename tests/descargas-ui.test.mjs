import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import vm from 'node:vm'
const jsx = (type, props) => ({ type, props })
const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n,...nodes(n.props?.children),...nodes(n.props?.ListHeaderComponent)] : []
function fixture() {
  const calls=[], exports={}
  const actions=Object.fromEntries(['descargarLista','pausarDescarga','reanudarDescarga','reintentarDescarga','quitarDescarga','cancelarDescarga'].map(name=>[name,key=>calls.push([name,key])]))
  const code=ts.transpileModule(readFileSync('src/ui/descargasControl.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  new Function('exports','require',code)(exports,()=>actions)
  return {api:exports,calls}
}
const track = (videoId,audioPath=`${videoId}.m4a`) => ({id:videoId,videoId,audioPath,title:videoId,artist:'Artista',artworkPath:null,artworkUrl:'',artistId:null,durationMs:240000,truePeak:-1})
const download = (videoId,estado='lista',temporal=false) => ({...track(videoId),estado,temporal,progreso:estado==='lista'?1:0.4,bytes:123,arte:false,track:track(videoId)})

test('pausar o cancelar pendientes nunca envía canciones terminadas a borrar', () => {
 const f=fixture(), items={a:download('a'),b:download('b','bajando'),c:download('c','pausada'),d:download('d','error')}
 const menu=f.api.menuDescargasLista(['a','b','c','d'].map(id=>track(id)),items)
 menu.find(o=>o.label==='Pausar descargas').onPress()
 assert.deepEqual(f.calls,[['pausarDescarga','b']])
 f.calls.length=0
 menu.find(o=>o.label==='Cancelar pendientes').onPress()
 assert.deepEqual(f.calls,[['cancelarDescarga','b'],['cancelarDescarga','c'],['cancelarDescarga','d']])
 assert.ok(menu.find(o=>o.label==='Quitar descargas terminadas').destructive)
 f.calls.length=0
 menu.find(o=>o.label==='Quitar descargas terminadas').onPress()
 assert.deepEqual(f.calls,[['quitarDescarga','a']])
})

test('entradas sin audio se mantienen visibles y usan su clave provisional para reintentar', () => {
 const f=fixture(), t=track('pendiente',''), d={...download('pendiente','error'),audioPath:'',track:t}
 const inventory=f.api.inventarioDescargas({'video:pendiente':d})
 assert.equal(inventory.length,1)
 assert.equal(f.api.cancionDescargada(inventory[0]),null)
 assert.equal(f.api.entradaDeTrack(t,{'video:pendiente':d}).clave,'video:pendiente')
 f.api.menuDescarga(inventory[0]).find(o=>o.label==='Reintentar descarga').onPress()
 assert.deepEqual(f.calls,[['reintentarDescarga','video:pendiente']])
 f.calls.length=0
 f.api.menuDescargasLista([t],{}).find(o=>o.label==='Descargar para escuchar sin conexión').onPress()
 assert.deepEqual(f.calls,[['descargarLista',[t]]])
})

test('caché y manual comparten inventario; promover temporal no la borra ni la duplica', () => {
 const f=fixture(), items={a:download('a','lista',true),b:download('b')}
 const inventory=f.api.inventarioDescargas(items)
 assert.equal(inventory.filter(e=>e.descarga.temporal).length,1)
 const menu=f.api.menuDescargasLista([track('a')],items)
 assert.equal(menu.length,1)
 menu[0].onPress()
 assert.deepEqual(f.calls,[['descargarLista',[track('a')]]])
})

test('buscar por título/artista ignora acentos y la cola offline conserva metadatos sin pendientes', () => {
 const f=fixture()
 const ready={...download('a'),title:'Canción',artist:'Björk',track:{...track('a'),durationMs:192000,artistId:'channel',truePeak:-2}}
 const inv=f.api.inventarioDescargas({a:ready,b:{...download('b','pausada'),title:'Canción',artist:'Björk'}},'cancion bjork')
 assert.equal(inv.length,2)
 const queue=f.api.colaDescargada(inv)
 assert.equal(queue.length,1)
 assert.equal(queue[0].track.audioPath,'a.m4a')
 assert.equal(queue[0].track.durationMs,192000)
 assert.equal(queue[0].track.artistId,'channel')
 assert.equal(queue[0].track.truePeak,-2)
 assert.equal(f.api.inventarioDescargas({a:ready},'inexistente').length,0)
 const legacy={...ready,track:undefined,durationMs:undefined,artistId:undefined,truePeak:undefined}
 assert.equal(f.api.cancionDescargada({clave:'a',descarga:legacy}).durationMs,0)
})

test('cada estado ofrece acciones apropiadas y mensajes de pausa, red y preparación', () => {
 const f=fixture()
 for (const [state,label] of [['preparando','Pausar descarga'],['espera','Pausar descarga'],['bajando','Pausar descarga'],['pausada','Reanudar descarga'],['error','Reintentar descarga']]) {
   const menu=f.api.menuDescarga({clave:'real',descarga:download('a',state)})
   assert.equal(menu[0].label,label)
   assert.equal(menu.at(-1).label,'Cancelar descarga')
 }
 const complete=f.api.menuDescarga({clave:'real',descarga:download('a')})
 assert.deepEqual(complete.map(o=>o.label),['Quitar descarga'])
 assert.equal(f.api.estadoDescarga(download('a','preparando'),false),'Preparando audio')
 assert.equal(f.api.estadoDescarga(download('a','pausada'),true),'Pausada')
 assert.equal(f.api.estadoDescarga(download('a','espera'),false,true),'Esperando conexión')
 assert.equal(f.api.estadoDescarga(download('a','espera'),true),'Esperando Wi-Fi')
 assert.equal(f.api.estadoDescarga({...download('a','error'),error:'Sin espacio'},false),'Sin espacio')
 assert.deepEqual(f.api.LIMITES_CACHE_MB,[125,250,500,1024,2048])
})

function component(path,name,globals={}) {
 const source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 const fn=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name)
 const code=ts.transpileModule(`export ${fn.getText(source).replace(/^export default /,'').replace(/^export /,'')}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
 const exports={}
 vm.runInNewContext(code,{exports,require:()=>({jsx,jsxs:jsx}),ICON_COLOR:{muted:'gray',foreground:'white'},...Object.fromEntries(['IconButton','Menu','Text','View','Pressable','IconDownloaded','IconDownload'].map(n=>[n,n])),...globals})
 return exports[name]
}
test('encabezado descarga en escritorio/nativo y abre gestión con archivos existentes, sin borrado implícito', () => {
 let presses=0
 const render=component('src/ui/PlaylistView.tsx','BotonDescarga',{HAY_DESCARGAS:true})
 const props={total:2,bajado:{listas:0,bajando:0,progreso:0},onPress:()=>presses++,opciones:[{label:'Descargar para escuchar sin conexión'}]}
 const first=render(props)
 assert.equal(first.type,'IconButton');first.props.onPress();assert.equal(presses,1)
 const options=[{label:'Pausar descargas'},{label:'Quitar descargas terminadas'}]
 const next=render({...props,bajado:{listas:1,bajando:1,progreso:0.6},opciones:options})
 assert.equal(next.type,'Menu');assert.equal(next.props.items,options)
 assert.equal(next.props.onPress,undefined)
 assert.equal(component('src/ui/PlaylistView.tsx','BotonDescarga',{HAY_DESCARGAS:false})(props),null)
})

test('fila pendiente conserva menú y desactiva reproducción; una lista permite reproducir desde el inventario', () => {
 const f=fixture();let played=0
 const render=component('app/ajustes/descargas.tsx','Fila',{
  artworkSource:()=>null,IconMusic:'IconMusic',Image:'Image',formatoBytes:()=> '1 MB',
  estadoDescarga:f.api.estadoDescarga,menuDescarga:f.api.menuDescarga,
 })
 for (const state of ['preparando','pausada','error','lista']) {
  const ui=nodes(render({item:{clave:'a',descarga:download('a',state)},esperandoWifi:false,esperandoRed:false,onPlay:()=>played++}))
  assert.ok(ui.some(n=>n.type==='Menu'))
  const play=ui.find(n=>n.type==='Pressable')
  assert.equal(play.props.disabled,state!=='lista')
  if(state==='lista')play.props.onPress()
 }
 assert.equal(played,1)
})

test('gestor reproduce la cola filtrada sin red y limpiar caché llama sólo la API temporal', () => {
 const f=fixture(), played=[], calls=[]
 let filter='', width=390, loaded=true, error=null, platform='android'
 const items={a:download('a'),b:download('b','lista',true),c:download('c','error')}
 const globals={
  ...f.api, HAY_DESCARGAS:true,
  ...Object.fromEntries(['ActivityIndicator','SafeAreaView','BotonLateral','BotonVolver','CabeceraLateral','Panel','GrupoAjustes','FilaInterruptor','ScrollView','SearchField','SectionList','Hoja','Fila','IconBack','IconDisk','IconWifi','IconMusic','IconPlay'].map(n=>[n,n])),
  Platform:{get OS(){return platform}},cargarDescargas:async()=>calls.push('cargarDescargas'),
  Stack:{Screen:'StackScreen'},useRouter:()=>({}),useAjustes:()=>({soloWifi:true,precargaAutomatica:true,precargaDatos:false}),
  useDescargas:()=>({items,esperandoWifi:false,esperandoRed:false,limiteCacheMB:250,cargado:loaded,error}),
  useMemo:fn=>fn(),useState:()=>[filter,v=>filter=v],useWindowDimensions:()=>({width}),usePiso:()=>100,usePisoHoja:()=>30,
  playQueue:(...args)=>played.push(args),formatoBytes:bytes=>`${bytes} bytes`,volver:(_router,path)=>calls.push(['volver',path]),avisar(){},
  setSoloWifi(){},setPrecargaAutomatica(){},setPrecargaDatos(){},reanudarDescargas(){},
  limpiarCache:()=>calls.push('limpiarCache'),quitarDescarga:k=>calls.push(['quitar',k]),setLimiteCacheMB:n=>calls.push(['limite',n]),
 }
 const render=component('app/ajustes/descargas.tsx','Descargas',globals)
 let ui=nodes(render())
 assert.equal(ui.find(n=>n.type==='StackScreen').props.options.presentation,'formSheet')
 for (const os of ['android','web']) {
  platform=os;ui=nodes(render())
  const back=ui.filter(n=>n.props?.label==='Volver a Ajustes')
  assert.equal(back.length,1,'una única salida visible en móvil')
  back[0].props.onPress()
  assert.deepEqual(calls.pop(),['volver','/ajustes'])
  assert.equal(ui.filter(n=>n.props?.accessibilityRole==='header'&&n.props.children==='Descargas y caché').length,1)
  assert.equal(ui.filter(n=>n.props?.label==='Reproducir disponibles sin conexión').length,1)
  const searchHeader=nodes(ui.find(n=>n.type==='SectionList').props.ListHeaderComponent)
  assert.ok(searchHeader.some(n=>n.props?.label==='Reproducir disponibles sin conexión'))
 }
 platform='android';ui=nodes(render())
 assert.equal(ui.filter(n=>n.type==='Hoja'&&n.props.titulo==='Descargas y caché').length,1)
 ui.find(n=>n.props?.label==='Reproducir disponibles sin conexión').props.onPress()
 assert.deepEqual(played[0][0].map(t=>t.videoId),['a','b'])
 assert.equal(played[0][1],0);assert.equal(played[0][2],null)
 const list=ui.find(n=>n.type==='SectionList')
 assert.equal(list.props.sections[0].data.length,2,'incluye el error pendiente')
 assert.equal(list.props.sections[1].data.length,1)
 const header=nodes(list.props.ListHeaderComponent)
 header.find(n=>n.props?.label==='Opciones de almacenamiento').props.items.find(i=>i.label==='Limpiar caché temporal').onPress()
 assert.deepEqual(calls,['limpiarCache'])
 const limits=header.find(n=>n.props?.label==='Elegir límite de caché').props.items
 assert.deepEqual(Array.from(limits,i=>i.label),['125 MB','250 MB','500 MB','1024 MB','2048 MB'])
 limits[3].onPress();assert.deepEqual(calls.at(-1),['limite',1024])
 header.find(n=>n.type==='SearchField').props.onChangeText('b')
 ui=nodes(render());ui.find(n=>n.props?.label==='Reproducir disponibles sin conexión').props.onPress()
 assert.deepEqual(played.at(-1)[0].map(t=>t.videoId),['b'])
 width=1440;platform='web';ui=nodes(render())
 assert.equal(ui.find(n=>n.type==='StackScreen').props.options.presentation,'card')
 assert.equal(ui.some(n=>n.type==='Hoja'),false)
 assert.ok(ui.some(n=>n.type==='Panel'&&n.props.tone==='lateral'))
 assert.equal(ui.filter(n=>n.props?.label==='Volver a Ajustes').length,1)
 assert.match(ui.find(n=>n.props?.rotulo==='Descargar solo con Wi-Fi').props.detalle,/red desconocida puede usar datos móviles/)
 loaded=false;error='No se pudo recuperar las descargas';ui=nodes(render())
 assert.equal(ui.some(n=>n.type==='ActivityIndicator'),false)
 ui.find(n=>n.props?.accessibilityLabel==='Reintentar lectura').props.onPress()
 assert.equal(calls.at(-1),'cargarDescargas')
 error=null;ui=nodes(render())
 assert.equal(ui.filter(n=>n.type==='ActivityIndicator').length,1)
 assert.equal(ui.some(n=>n.props?.accessibilityLabel==='Reintentar lectura'),false)
 loaded=true;ui=nodes(render())
 assert.equal(ui.some(n=>n.type==='ActivityIndicator'),false)
 assert.equal(ui.some(n=>n.props?.accessibilityLabel==='Reintentar lectura'),false)
})

test('navegador permite apagar la precarga de sesión sin ofrecer almacenamiento offline', () => {
 const f=fixture(), calls=[], ajustes={soloWifi:true,precargaAutomatica:true,precargaDatos:false}
 let width=390
 const render=component('app/ajustes/descargas.tsx','Descargas',{
  ...f.api,HAY_DESCARGAS:false,
  ...Object.fromEntries(['SafeAreaView','BotonLateral','BotonVolver','Panel','GrupoAjustes','FilaInterruptor','ScrollView','Hoja','IconBack','IconWifi'].map(n=>[n,n])),
  Platform:{OS:'web'},Stack:{Screen:'StackScreen'},useRouter:()=>({}),useAjustes:()=>ajustes,
  useDescargas:()=>({items:{},esperandoWifi:false,esperandoRed:false,limiteCacheMB:250,cargado:false,error:null}),
  useMemo:fn=>fn(),useState:()=>['',()=>{}],useWindowDimensions:()=>({width}),usePiso:()=>100,usePisoHoja:()=>30,
  volver:(_router,path)=>calls.push(['volver',path]),
  setPrecargaAutomatica:v=>ajustes.precargaAutomatica=v,setPrecargaDatos:v=>ajustes.precargaDatos=v,
  reanudarDescargas:()=>assert.fail('el navegador no debe reanudar descargas de disco'),
 })
 for (const size of [390,1440]) {
  width=size
  let ui=nodes(render())
  const switches=ui.filter(n=>n.type==='FilaInterruptor')
  assert.deepEqual(switches.map(n=>n.props.rotulo),['Precarga automática','Precargar con datos móviles'])
  assert.equal(switches[0].props.activo,ajustes.precargaAutomatica)
  assert.equal(switches[1].props.activo,ajustes.precargaDatos)
  switches[0].props.onCambiar(false);switches[1].props.onCambiar(true)
  ui=nodes(render())
  assert.equal(ui.find(n=>n.props?.rotulo==='Precarga automática').props.activo,false)
  assert.equal(ui.find(n=>n.props?.rotulo==='Precargar con datos móviles').props.activo,true)
  assert.match(ui.find(n=>n.type==='GrupoAjustes').props.pie,/temporalmente durante esta sesión/)
  assert.equal(ui.some(n=>['Menu','SectionList','ActivityIndicator'].includes(n.type)),false)
  assert.equal(ui.some(n=>n.props?.label==='Reproducir disponibles sin conexión'),false)
  const back=ui.filter(n=>n.props?.label==='Volver a Ajustes')
  assert.equal(back.length,1)
  back[0].props.onPress();assert.deepEqual(calls.pop(),['volver','/ajustes'])
  assert.equal(ui.filter(n=>n.props?.accessibilityRole==='header').length,1)
 }
})

test('Ajustes expone precarga sin soporte de descargas y reserva controles manuales para plataformas compatibles', () => {
 const path='app/ajustes/index.tsx', source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 let category
 function visit(n) {
  if(ts.isObjectLiteralExpression(n)&&n.properties.some(p=>ts.isPropertyAssignment(p)&&p.name.getText(source)==='id'&&p.initializer.getText(source)==="'descargas'")) category=n
  ts.forEachChild(n,visit)
 }
 visit(source);assert.ok(category)
 const code=ts.transpileModule(`export const categoria=${category.getText(source)}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
 for(const supported of [false,true]) {
  const f=fixture(),exports={},calls=[],ajustes={soloWifi:true,precargaAutomatica:true,precargaDatos:false}
  const globals={exports,require:()=>({jsx,jsxs:jsx}),...f.api,HAY_DESCARGAS:supported,ajustes,
   ...Object.fromEntries(['GrupoAjustes','FilaAjuste','FilaInterruptor','IconDownload','IconDisk','IconWifi'].map(n=>[n,n])),
   ICON_COLOR:{muted:'gray'},Platform:{OS:'web'},descargasManuales:0,cacheTemporal:0,items:{},espacioUsado:()=>0,formatoBytes:()=> '0 MB',router:{push(){}},setSoloWifi(){},
   setPrecargaAutomatica:v=>ajustes.precargaAutomatica=v,setPrecargaDatos:v=>ajustes.precargaDatos=v,reanudarDescargas:()=>calls.push('reanudar'),
  }
  vm.runInNewContext(code,globals)
  assert.equal(exports.categoria.visible,true)
  assert.equal(exports.categoria.titulo,supported?'Descargas y caché':'Precarga')
  let ui=nodes(exports.categoria.bloques)
  assert.equal(ui.filter(n=>n.type==='FilaAjuste').length,supported?1:0)
  assert.equal(ui.filter(n=>n.type==='FilaInterruptor').length,supported?3:2)
  ui.find(n=>n.props?.rotulo==='Precarga automática').props.onCambiar(false)
  ui.find(n=>n.props?.rotulo==='Precargar con datos móviles').props.onCambiar(true)
  vm.runInNewContext(code,{...globals});ui=nodes(exports.categoria.bloques)
  assert.equal(ui.find(n=>n.props?.rotulo==='Precarga automática').props.activo,false)
  assert.equal(ui.find(n=>n.props?.rotulo==='Precargar con datos móviles').props.activo,true)
  assert.equal(calls.length,supported?2:0)
  if(!supported) assert.match(exports.categoria.bloques.props.pie,/temporalmente durante esta sesión/)
 }
})

test('iOS: List único conserva cola filtrada, menús de pendientes, límite y limpieza sólo de caché', () => {
 const f=fixture(),played=[],calls=[];let filtro=''
 const items={a:download('a'),b:download('b','lista',true),c:download('c','error')}
 const globals={...f.api,HAY_DESCARGAS:true,Platform:{OS:'ios'},Fragment:'Fragment',
  ...Object.fromEntries(['ActivityIndicator','SafeAreaView','BotonLateral','BotonVolver','Text','View','Image','ListaAjustes','GrupoAjustes','FilaInterruptor','FilaAccion','FilaDato','FilaOpciones','FilaAjuste','SearchField','IconPlay','IconWifi','IconDisk','IconMusic','Menu'].map(n=>[n,n])),
  ICON_COLOR:{foreground:'white',muted:'gray'},artworkSource:()=>null,Stack:{Screen:'StackScreen'},useRouter:()=>({}),
  useAjustes:()=>({soloWifi:true,precargaAutomatica:true,precargaDatos:false}),useDescargas:()=>({items,esperandoWifi:false,esperandoRed:false,limiteCacheMB:250,cargado:true,error:null}),
  useMemo:fn=>fn(),useState:()=>[filtro,v=>filtro=v],useWindowDimensions:()=>({width:1024}),usePiso:()=>100,usePisoHoja:()=>30,
  playQueue:(...args)=>played.push(args),formatoBytes:bytes=>`${bytes} bytes`,volver(){},avisar(){},setSoloWifi(){},setPrecargaAutomatica(){},setPrecargaDatos(){},reanudarDescargas(){},
  limpiarCache:()=>calls.push('limpiarCache'),quitarDescarga:key=>calls.push(['quitar',key]),setLimiteCacheMB:n=>calls.push(['limite',n]),
 }
 const render=component('app/ajustes/descargas.tsx','Descargas',globals)
 let ui=nodes(render())
 assert.equal(ui.filter(n=>n.type==='ListaAjustes').length,1)
 assert.equal(ui.some(n=>n.type==='SectionList'||n.type==='ScrollView'),false)
 ui.find(n=>n.props?.rotulo==='Reproducir disponibles sin conexión').props.onPress()
 assert.deepEqual(played[0][0].map(t=>t.videoId),['a','b'])
 assert.equal(ui.find(n=>n.type==='FilaAjuste'&&n.props.rotulo==='c').props.disabled,true)
 const menu=ui.find(n=>n.type==='FilaOpciones'&&n.props.rotulo==='Opciones de c')
 menu.props.onElegir(menu.props.opciones.find(o=>o.label==='Reintentar descarga').value)
 assert.deepEqual(f.calls,[['reintentarDescarga','c']])
 ui.find(n=>n.props?.rotulo==='Limpiar caché temporal').props.onPress()
 assert.deepEqual(calls,['limpiarCache'])
 ui.find(n=>n.props?.rotulo==='Límite de caché').props.onElegir(1024)
 assert.deepEqual(calls.at(-1),['limite',1024])
 ui.find(n=>n.type==='SearchField').props.onChangeText('b')
 ui=nodes(render());ui.find(n=>n.props?.rotulo==='Reproducir disponibles sin conexión').props.onPress()
 assert.deepEqual(played.at(-1)[0].map(t=>t.videoId),['b'])
})
