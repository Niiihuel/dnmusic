import { useEffect, useState, type ReactNode } from 'react'
import { Image as RNImage, useWindowDimensions, View } from 'react-native'
import { Button, Form, Host, HStack, Image, Label, NavigationDestination, NavigationLink, NavigationStack, ProgressView, RNHostView, Section, Spacer, Text, TextField, Toggle, Toolbar, VStack, useNativeState } from '@expo/ui/swift-ui'
import { accessibilityLabel, autocorrectionDisabled, background, disabled, font, foregroundStyle, frame, lineLimit, listRowBackground, listRowSeparator, navigationTitle, padding, scrollContentBackground, scrollDismissesKeyboard, submitLabel, textContentType, textFieldStyle, textInputAutocapitalization, tint, toggleStyle } from '@expo/ui/swift-ui/modifiers'
import type { SFSymbol } from 'sf-symbols-typescript'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BarraCambiosPerfil } from './BarraCambiosPerfil'
import { Avatar } from './Avatar'
import { Marco } from './Marco'
import { TarjetaPerfil } from './TarjetaPerfil'
import { FondoPerfil } from './PerfilPublico'
import { TITULO_CAMPO, type EditorCampoPerfil } from './EditorDeCampo'
import { normalizeUsername } from '../models/username'
import { proxiedImage } from '../services/music'
import { SearchField } from './SearchField'
import type { BusquedaPerfilNativoProps, CampoPerfilNativoProps, EditorPerfilNativoProps } from './EditorPerfilNativo.types'

const FONDO = '#111111'
const FILA = '#1C1C1E'
const SECUNDARIO = '#AEAEB2'
const fila = [listRowBackground(FILA)]
const descripciones = [
  { id: 'fondo', titulo: 'Fondo', detalle: 'Imagen, GIF o video', symbol: 'photo' },
  { id: 'estilo', titulo: 'Apariencia', detalle: 'Tipografía y decoraciones', symbol: 'paintpalette' },
  { id: 'privacidad', titulo: 'Quién lo ve', detalle: 'Perfil y actividad de música', symbol: 'lock' },
  { id: 'mosaico', titulo: 'Mosaico', detalle: 'Tus piezas y su distribución', symbol: 'square.grid.2x2' },
] as const

/**
 * Una sola jerarquía SwiftUI mide y desplaza el formulario, sus campos y su
 * barra de navegación. El borrador y las operaciones siguen en el controlador
 * compartido. Sólo el arte del perfil cruza a RNHostView para conservar sus
 * GIF, encuadres y decoraciones personalizadas.
 */
export function EditorPerfilNativo(props: EditorPerfilNativoProps) {
  const { perfil, ocupado, piso, onAbrir } = props
  const anchoPrevia = Math.max(180, Math.min(340, useWindowDimensions().width - 80))
  const [altoBarra, setAltoBarra] = useState(112)
  const [path, setPath] = useState<string[]>([])
  const nombre = perfil.displayName?.trim() || perfil.username
  const tieneFondo = !!perfil.bannerPath

  function pantalla(titulo: string, children: ReactNode, principal = false) {
    return <Toolbar>
      <Form modifiers={[navigationTitle(titulo), scrollContentBackground('hidden'), background(FONDO), scrollDismissesKeyboard('interactively')]}>
        {children}
        <Text modifiers={[frame({ height: piso + (props.cambiado || props.ocupado || props.error ? altoBarra + 16 : 0) }), listRowBackground('clear'), listRowSeparator('hidden')]}>{' '}</Text>
      </Form>
      <Toolbar.Content>
        {principal ? <Button label="Listo" role="cancel" onPress={props.onVolver} modifiers={[disabled(ocupado), accessibilityLabel('Volver al perfil')]} /> : null}
      </Toolbar.Content>
    </Toolbar>
  }

  return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: FONDO }}>
    <Host style={{ flex: 1 }} ignoreSafeArea="container" colorScheme="dark" seedColor="#FFFFFF">
      <NavigationStack path={path} onPathChange={setPath}>
        {pantalla('Editar perfil', <>
          <Section footer={<Text>Los cambios se muestran en la vista previa. Guardalos cuando estés conforme.</Text>}>
            <NavigationLink value="identidad" modifiers={fila}>
              <HStack spacing={16} modifiers={[padding({ vertical: 8 })]}>
                <FotoPerfil {...props} tamano={64} />
                <VStack alignment="leading" spacing={5}>
                  <Text modifiers={[font({ textStyle: 'headline' })]}>{nombre}</Text>
                  <Text modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle(SECUNDARIO)]}>@{perfil.username}</Text>
                  <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(SECUNDARIO)]}>Foto, nombre y presentación</Text>
                </VStack>
              </HStack>
            </NavigationLink>
            <NavigationLink value="previa" modifiers={fila}><Label title="Vista previa del perfil" systemImage="eye" /></NavigationLink>
          </Section>
          <Section title="Personalizar">
            {descripciones.map(item => <NavigationLink key={item.id} value={item.id} modifiers={fila}>
              <Rotulo titulo={item.titulo} detalle={item.detalle} symbol={item.symbol} />
            </NavigationLink>)}
          </Section>
        </>, true)}
        <NavigationDestination value="identidad">
          {pantalla('Identidad', <>
            <Section title="Foto del perfil" footer={<Text>Podés elegir una imagen o un GIF de hasta 8 MB.</Text>}>
              <HStack modifiers={[...fila, padding({ vertical: 12 })]}><Spacer /><FotoPerfil {...props} tamano={88} /><Spacer /></HStack>
              <Accion titulo={perfil.avatarPath ? 'Cambiar foto' : 'Elegir foto'} symbol="photo" onPress={props.onElegirFoto} ocupado={ocupado} busy={props.subiendoFoto} />
              {perfil.avatarPath ? <>
                <Accion titulo="Encuadrar foto" symbol="crop" onPress={() => onAbrir({ pathname: '/perfil/encuadrar', params: { que: 'foto' } })} ocupado={ocupado} />
                <Accion titulo="Quitar foto" symbol="trash" onPress={() => props.onQuitar('foto')} ocupado={ocupado} destructiva />
              </> : null}
            </Section>
            <Campo titulo="Nombre visible" editor={props.nombre} maxLength={40} />
            <Campo titulo="Usuario" editor={props.usuario} usuario />
            <Campo titulo="Tu línea" editor={props.linea} maxLength={180} multiline />
          </>)}
        </NavigationDestination>
        <NavigationDestination value="fondo">
          {pantalla('Fondo', <Section title="Fondo del perfil" footer={<Text>El fondo acompaña tu perfil y tus piezas. Las imágenes se pueden volver a encuadrar.</Text>}>
            {tieneFondo ? <VStack modifiers={[...fila, frame({ height: 180 })]}><RNHostView><View style={{ height: 180, width: '100%', overflow: 'hidden', borderRadius: 12 }}>
              <FondoPerfil bannerPath={perfil.bannerPath} encuadre={perfil.bannerEncuadre} efecto={perfil.efecto} />
            </View></RNHostView></VStack> : null}
            <Accion titulo={tieneFondo ? 'Cambiar fondo' : 'Elegir fondo'} symbol="photo" onPress={props.onElegirFondo} ocupado={ocupado} busy={props.subiendoFondo} />
            {props.progresoFondo !== null ? <ProgressView value={props.progresoFondo} modifiers={fila}><Text>{props.progresoFondo >= 1 ? 'Preparando vista previa…' : 'Subiendo fondo…'}</Text></ProgressView> : null}
            {tieneFondo ? <Accion titulo="Encuadrar fondo" symbol="crop" onPress={() => onAbrir({ pathname: '/perfil/encuadrar', params: { que: 'fondo' } })} ocupado={ocupado} /> : null}
            {tieneFondo ? <Accion titulo="Quitar fondo" symbol="trash" onPress={() => props.onQuitar('fondo')} ocupado={ocupado} destructiva /> : null}
          </Section>)}
        </NavigationDestination>
        <NavigationDestination value="estilo">
          {pantalla('Apariencia', <>
            <Section footer={<Text>Elegí decoraciones de Discord. El borrador conserva lo que pruebes.</Text>}>
              <Accion titulo="Personalizar perfil" detalle="Abrir el probador de decoraciones" symbol="sparkles" onPress={() => onAbrir('/profile/marco')} ocupado={ocupado} lleva />
            </Section>
            <Section title="Tu estilo">
              <Accion titulo="Tipografía" detalle={props.estilo.fuente} symbol="textformat" onPress={() => onAbrir('/profile/fuente')} ocupado={ocupado} lleva />
              <Accion titulo="Marco de la foto" detalle={props.estilo.marco} symbol="person.crop.circle" onPress={() => onAbrir({ pathname: '/profile/marco', params: { tipo: 'marco' } })} ocupado={ocupado} lleva />
              <Accion titulo="Efecto del perfil" detalle={props.estilo.efecto} symbol="sparkles" onPress={() => onAbrir({ pathname: '/profile/marco', params: { tipo: 'efecto' } })} ocupado={ocupado} lleva />
              <Accion titulo="Placa de nombre" detalle={props.estilo.placa} symbol="textformat.abc" onPress={() => onAbrir({ pathname: '/profile/marco', params: { tipo: 'placa' } })} ocupado={ocupado} lleva />
              <Accion titulo="Marco de estadísticas" detalle={props.estilo.marcoPerfil} symbol="square.grid.2x2" onPress={() => onAbrir({ pathname: '/profile/marco', params: { tipo: 'marcoPerfil' } })} ocupado={ocupado} lleva />
            </Section>
          </>)}
        </NavigationDestination>
        <NavigationDestination value="privacidad">
          {pantalla('Quién lo ve', <>
            <Section footer={<Text>{perfil.visibility === 'publico' ? 'Las personas con cuenta pueden ver tu perfil y tus vitrinas.' : 'Solo vos podés ver tu perfil, incluso si alguien tiene el enlace.'}</Text>}>
              <Toggle label="Perfil público" systemImage="person.crop.circle" isOn={perfil.visibility === 'publico'} onIsOnChange={activo => props.onCambiar({ visibility: activo ? 'publico' : 'privado' })} modifiers={[...fila, tint('#34C759'), toggleStyle('switch'), disabled(ocupado)]} />
            </Section>
            <Section footer={<Text>Si tu perfil es público, tus contactos pueden ver la canción mientras suena y dejarte reacciones.</Text>}>
              <Toggle label="Compartir lo que escucho" systemImage="music.note" isOn={perfil.compartirEscucha === true} onIsOnChange={activo => props.onCambiar({ compartirEscucha: activo })} modifiers={[...fila, tint('#34C759'), toggleStyle('switch'), disabled(ocupado)]} />
            </Section>
          </>)}
        </NavigationDestination>
        <NavigationDestination value="mosaico">
          {pantalla('Mosaico', <Section footer={<Text>Armá las piezas sobre tu perfil para ver cómo quedan junto al fondo y las demás.</Text>}>
            <Accion titulo="Tema del mosaico" detalle="Colores y acabado" symbol="paintpalette" onPress={() => onAbrir({ pathname: '/profile/tema', params: { para: 'perfil' } })} ocupado={ocupado} lleva />
            <Accion titulo="Armar el mosaico" detalle="Piezas, temas y orden" symbol="square.grid.2x2" onPress={() => onAbrir({ pathname: '/profile', params: { editar: '1' } })} ocupado={ocupado} lleva />
            <Accion titulo="Agregar música" symbol="music.note" onPress={() => onAbrir('/profile/editar/musica')} ocupado={ocupado} lleva />
          </Section>)}
        </NavigationDestination>
        <NavigationDestination value="previa">
          {pantalla('Vista previa', <Section footer={<Text>{perfil.visibility === 'publico' ? 'Así se verá tu perfil público al guardar.' : 'Tu perfil es privado. Solo vos podés verlo.'}</Text>}>
            <VStack modifiers={[listRowBackground('clear'), padding({ vertical: 8 })]}>
              <RNHostView matchContents><View style={{ width: anchoPrevia, paddingVertical: 12 }}><TarjetaPerfil perfil={perfil} /></View></RNHostView>
            </VStack>
          </Section>)}
        </NavigationDestination>
      </NavigationStack>
    </Host>
    <BarraCambiosPerfil visible={props.cambiado} ocupado={ocupado} error={props.error}
      puedeGuardar={props.puedeGuardar} onRestablecer={props.onRestablecer} onGuardar={props.onGuardar}
      abajo={piso} onAltura={setAltoBarra} />
  </SafeAreaView>
}

function FotoPerfil({ perfil, tamano }: Pick<EditorPerfilNativoProps, 'perfil'> & { tamano: number }) {
  return <RNHostView matchContents><View style={{ width: tamano + 16, height: tamano + 16, padding: 8 }}>
    <Avatar key={perfil.avatarPath} name={perfil.displayName?.trim() || perfil.username} path={perfil.avatarPath} size={tamano} encuadre={perfil.avatarEncuadre} />
    <View pointerEvents="none" style={{ position: 'absolute', top: 8, left: 8 }}><Marco marco={perfil.marco} size={tamano} /></View>
  </View></RNHostView>
}

function Rotulo({ titulo, detalle, symbol }: { titulo: string; detalle?: string; symbol: SFSymbol }) {
  return <HStack spacing={12} modifiers={[frame({ minHeight: 44 })]}>
    <Image systemName={symbol} size={20} modifiers={[frame({ width: 24 })]} />
    <VStack alignment="leading" spacing={3}>
      <Text>{titulo}</Text>
      {detalle ? <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(SECUNDARIO)]}>{detalle}</Text> : null}
    </VStack>
  </HStack>
}

function Accion({ titulo, detalle, symbol, onPress, ocupado, busy, destructiva, lleva }: {
  titulo: string; detalle?: string; symbol: SFSymbol; onPress: () => void; ocupado: boolean; busy?: boolean; destructiva?: boolean; lleva?: boolean
}) {
  return <Button onPress={onPress} role={destructiva ? 'destructive' : 'default'} modifiers={[...fila, disabled(ocupado)]}>
    <HStack><Rotulo titulo={titulo} detalle={detalle} symbol={symbol} /><Spacer />
      {busy ? <ProgressView /> : lleva ? <Image systemName="chevron.right" size={13} color={SECUNDARIO} /> : null}
    </HStack>
  </Button>
}

function Campo({ titulo, editor, maxLength, multiline = false, usuario = false }: {
  titulo: string; editor: EditorCampoPerfil; maxLength?: number; multiline?: boolean; usuario?: boolean
}) {
  const texto = useNativeState(editor.valor)
  useEffect(() => { if (texto.get() !== editor.valor) texto.set(editor.valor) }, [editor.valor, texto])
  return <Section title={titulo} footer={<Text>{editor.error ?? editor.aviso ?? (usuario ? 'Con este usuario te encuentran los demás.' : multiline ? 'Una presentación breve debajo de tu nombre.' : 'Si lo dejás vacío, se muestra tu usuario.')}</Text>}>
    <TextField text={texto} onTextChange={valor => {
      if (editor.busy) return
      const normalizado = usuario ? normalizeUsername(valor) : valor
      if (normalizado !== valor) texto.set(normalizado)
      editor.cambiar(normalizado)
    }} placeholder={editor.placeholder} maxLength={maxLength}
      axis={multiline ? 'vertical' : 'horizontal'} modifiers={[...fila, textFieldStyle('plain'), disabled(editor.busy), accessibilityLabel(titulo),
        textInputAutocapitalization(usuario ? 'never' : 'sentences'), autocorrectionDisabled(usuario), submitLabel('done'),
        ...(usuario ? [textContentType('username')] : []), ...(multiline ? [lineLimit({ min: 2, max: 5 })] : [])]} />
  </Section>
}

/** Mantiene los enlaces directos a un campo dentro del mismo formulario nativo. */
export function CampoPerfilNativo({ cual, editor, piso, onVolver }: CampoPerfilNativoProps) {
  const anchoPrevia = Math.max(180, Math.min(340, useWindowDimensions().width - 80))
  return <Host style={{ flex: 1 }} useViewportSizeMeasurement colorScheme="dark" seedColor="#FFFFFF">
    <NavigationStack>
      <Toolbar>
        <Form modifiers={[navigationTitle(TITULO_CAMPO[cual]), scrollContentBackground('hidden'), background(FONDO), scrollDismissesKeyboard('interactively')]}>
          <Campo titulo={TITULO_CAMPO[cual]} editor={editor} usuario={cual === 'usuario'} multiline={cual === 'linea'} maxLength={cual === 'nombre' ? 40 : cual === 'linea' ? 180 : undefined} />
          <Section title="Vista previa" footer={<Text>El cambio queda en el borrador hasta que guardes el perfil.</Text>}>
            {editor.perfilVistaPrevia ? <VStack modifiers={[listRowBackground('clear')]}><RNHostView matchContents><View style={{ width: anchoPrevia, paddingVertical: 12 }}><TarjetaPerfil perfil={editor.perfilVistaPrevia} animado={false} /></View></RNHostView></VStack> : <ProgressView />}
          </Section>
          <Text modifiers={[frame({ height: piso }), listRowBackground('clear'), listRowSeparator('hidden')]}>{' '}</Text>
        </Form>
        <Toolbar.Content><Button label="Listo" role="cancel" onPress={onVolver} modifiers={[disabled(editor.busy), accessibilityLabel('Volver a editar perfil')]} /></Toolbar.Content>
      </Toolbar>
    </NavigationStack>
  </Host>
}

/** El buscador del editor posee su campo; no compite con la barra de pestañas. */
export function BusquedaPerfilNativa({ termino, resultados, cargando, error, piso, onCambiar, onElegir, onVolver }: BusquedaPerfilNativoProps) {
  return <Host style={{ flex: 1 }} useViewportSizeMeasurement colorScheme="dark" seedColor="#FFFFFF">
    <NavigationStack>
      <Toolbar>
        <Form modifiers={[navigationTitle('Agregar música'), scrollContentBackground('hidden'), background(FONDO), scrollDismissesKeyboard('interactively')]}>
          <Section>
            <VStack modifiers={[listRowBackground('clear'), listRowSeparator('hidden'), frame({ height: 56, maxWidth: Infinity })]}>
              <RNHostView>
                <View style={{ width: '100%', paddingVertical: 4 }}>
                  <SearchField value={termino} onChangeText={onCambiar} placeholder="Canción o artista"
                    accessibilityLabel="Buscar música para el perfil" autoFocus loading={cargando} />
                </View>
              </RNHostView>
            </VStack>
          </Section>
          <Section title={termino.trim() ? 'Canciones' : undefined} footer={<Text>Tocá una canción y elegí si querés fijarla completa o compartir un fragmento.</Text>}>
            {error ? <Text modifiers={fila}>{error}</Text> : !termino.trim() ? <Text modifiers={[...fila, foregroundStyle(SECUNDARIO)]}>Buscá una canción para agregar a tu perfil.</Text> : null}
            {resultados.map(track => <Button key={track.videoId} onPress={() => onElegir(track)} modifiers={[...fila, accessibilityLabel(`Agregar ${track.title}, de ${track.artist}`)]}>
              <HStack spacing={12} modifiers={[frame({ minHeight: 64 })]}>
                <RNHostView matchContents><RNImage source={{ uri: proxiedImage(track.artworkUrl) }} style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: FILA }} /></RNHostView>
                <VStack alignment="leading" spacing={4}>
                  <Text modifiers={[font({ textStyle: 'body', weight: 'semibold' }), lineLimit(2)]}>{track.title}</Text>
                  <Text modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle(SECUNDARIO), lineLimit(2)]}>{track.artist}</Text>
                </VStack>
                <Spacer /><Image systemName="chevron.right" size={13} color={SECUNDARIO} />
              </HStack>
            </Button>)}
          </Section>
          <Text modifiers={[frame({ height: piso }), listRowBackground('clear'), listRowSeparator('hidden')]}>{' '}</Text>
        </Form>
        <Toolbar.Content><Button label="Listo" role="cancel" onPress={onVolver} modifiers={[accessibilityLabel('Volver a editar perfil')]} /></Toolbar.Content>
      </Toolbar>
    </NavigationStack>
  </Host>
}
