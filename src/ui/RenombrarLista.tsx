import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native'
import { EntradaTexto } from './EntradaTexto'
import { HojaNombreListaNativa } from './HojaNombreListaNativa'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CollectionTitle, useAngosto } from './CollectionHeader'
import { Hoja } from './Hoja'
import { ScrollArea } from './ScrollArea'
import { AccionSocial, CabeceraSocial } from './Social'
import { FormError } from './Button'
import { estadoControlWeb } from './estadoControl'
import { ICON_COLOR, IconPencil } from './icons'

type BorradorNombre = { id: string; inicial: string; valor: string; ocupado: boolean; error: string | null }

/** La sesión conserva su lista y su borrador hasta que el guardado termina. */
export function useRenombrarLista(id: string, nombre: string, onGuardar: (nombre: string) => Promise<void>) {
  const [sesion, setSesion] = useState<BorradorNombre | null>(null)
  const actual = useRef<BorradorNombre | null>(null)
  const actualizar = (next: BorradorNombre | null) => { actual.current = next; setSesion(next) }
  const borrador = sesion?.id === id ? sesion : null
  return {
    borrador,
    abrir() {
      if (actual.current?.ocupado) return
      actualizar({ id, inicial: nombre, valor: nombre, ocupado: false, error: null })
    },
    cambiar(valor: string) {
      if (actual.current?.id !== id || actual.current.ocupado) return
      actualizar({ ...actual.current, valor, error: null })
    },
    cancelar() {
      if (actual.current?.id === id && !actual.current.ocupado) actualizar(null)
    },
    async guardar() {
      const draft = actual.current
      if (!draft || draft.id !== id || draft.ocupado) return
      const limpio = draft.valor.trim()
      if (!limpio || limpio.length > 60) {
        actualizar({ ...draft, error: !limpio ? 'Poné un nombre para la lista.' : 'Usá hasta 60 caracteres.' })
        return
      }
      if (limpio === draft.inicial) { actualizar(null); return }
      const pendiente = { ...draft, ocupado: true, error: null }
      actualizar(pendiente)
      try {
        await onGuardar(limpio)
        if (actual.current === pendiente) actualizar(null)
      } catch {
        if (actual.current === pendiente) actualizar({ ...draft, error: 'No se pudo cambiar el nombre. Intentá de nuevo.' })
      }
    },
  }
}
export type EdicionNombreLista = ReturnType<typeof useRenombrarLista>
export function useNombreInline() { return useWindowDimensions().width >= 780 && Platform.OS === 'web' }

export function TituloNombreLista({ nombre, editor }: { nombre: string; editor: EdicionNombreLista }) {
  const [over, setOver] = useState(false)
  const angosto = useAngosto()
  const inline = useNombreInline()
  const editando = inline && editor.borrador !== null
  return <View className={`flex-row items-center gap-2 ${angosto ? 'justify-center' : ''}`}>
    {/* El título original reserva exactamente su ancho y sus líneas mientras se escribe. */}
    <View className="min-w-0 flex-1">
      <Pressable {...estadoControlWeb('glass')} accessibilityRole="button" accessibilityLabel={`Cambiar el nombre de ${nombre}`}
        onPress={editor.abrir} onPointerEnter={() => setOver(true)} onPointerLeave={() => setOver(false)}
        disabled={editando} accessibilityElementsHidden={editando} importantForAccessibility={editando ? 'no-hide-descendants' : 'auto'}
        aria-hidden={editando} style={{ opacity: editando ? 0 : over ? 0.75 : 1 }}>
        <CollectionTitle>{nombre}</CollectionTitle>
      </Pressable>
      {editando ? <CampoNombreLista editor={editor} inline /> : null}
    </View>
    <View pointerEvents="none" style={{ opacity: over && !editando ? 1 : 0 }}>
      <IconPencil size={angosto ? 15 : 18} color={ICON_COLOR.muted} />
    </View>
  </View>
}

export function CampoNombreLista({ editor, inline = false }: { editor: EdicionNombreLista; inline?: boolean }) {
  const campo = useRef<TextInput>(null)
  useEffect(() => {
    if (Platform.OS === 'web') {
      // RN Web expone el nodo: enfocar sin desplazar la lista ni seleccionar todo el título.
      ;(campo.current as unknown as { focus: (options: { preventScroll: boolean }) => void } | null)?.focus({ preventScroll: true })
    }
  }, [])
  const draft = editor.borrador
  if (!draft) return null
  return <EntradaTexto ref={campo} accessibilityLabel="Nombre de la lista" value={draft.valor}
    editable={!draft.ocupado} onChangeText={editor.cambiar} maxLength={60}
    autoFocus={Platform.OS !== 'web'} autoCorrect={false} returnKeyType="done" submitBehavior="submit"
    multiline={inline} onSubmitEditing={() => { void editor.guardar() }}
    onKeyPress={e => { if (e.nativeEvent.key === 'Escape') editor.cancelar() }}
    className={inline ? 'text-foreground text-4xl font-bold' : 'text-foreground rounded-2xl bg-card px-4 py-3 text-callout'}
    style={inline ? { position: 'absolute', inset: 0, padding: 0, margin: 0, borderWidth: 0, backgroundColor: 'transparent', textAlignVertical: 'top' } : { minHeight: 48 }}
  />
}

export function AccionesNombreLista({ editor }: { editor: EdicionNombreLista }) {
  const draft = editor.borrador
  if (!draft) return null
  return <View className="flex-1 flex-row flex-wrap items-center gap-3" style={{ minHeight: 56 }}>
    <AccionSocial label="Cancelar" secundaria expandida={false} disabled={draft.ocupado} onPress={editor.cancelar} />
    <AccionSocial label="Guardar" expandida={false} busy={draft.ocupado} disabled={!draft.valor.trim()} onPress={() => { void editor.guardar() }} />
    {draft.error ? <View className="min-w-0 shrink"><FormError message={draft.error} /></View> : null}
  </View>
}

/** En iOS el sistema presenta la hoja; en web angosta Hoja aporta su portal. */
export function HojaNombreLista({ editor }: { editor: EdicionNombreLista }) {
  const inline = useNombreInline()
  if (Platform.OS === 'ios') return <HojaNombreListaNativa editor={editor} />
  if (!editor.borrador || inline) return null
  const nativo = Platform.OS !== 'web'
  const campos = <View className="gap-4 px-5 pb-5">
    <Text className="text-foreground text-subheadline">Nombre de la lista</Text>
    <CampoNombreLista editor={editor} />
    {!nativo ? <AccionesNombreLista editor={editor} /> : null}
  </View>
  const contenido = <Hoja medida="contenido" titulo="Cambiar nombre" onCerrar={editor.cancelar}>
    <SafeAreaView edges={['bottom']} className="bg-background" style={nativo ? { flex: 1, backgroundColor: '#121212' } : undefined}>
      <KeyboardAvoidingView style={nativo ? { flex: 1 } : undefined}>
        <CabeceraSocial titulo="Cambiar nombre" onCerrar={editor.cancelar} ocupado={editor.borrador.ocupado} />
        {nativo ? <ScrollArea style={{ flex: 1 }} keyboardShouldPersistTaps="handled">{campos}</ScrollArea> : campos}
        {nativo ? <View className="flex-row px-5 pb-5"><AccionesNombreLista editor={editor} /></View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Hoja>
  return Platform.OS === 'web' ? contenido : <Modal visible presentationStyle="formSheet" animationType="slide" onRequestClose={editor.cancelar}>{contenido}</Modal>
}
