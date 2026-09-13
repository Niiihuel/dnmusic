import { Dialogo } from './Dialogo'
import { EncabezadoHoja, BotonHoja } from './EncabezadoHoja'
import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { editMessage, deleteMessage } from '../services/messages'
import { refreshConversations } from '../state/session'
import { avisar } from '../state/aviso'
import { mensajeError } from '../lib/mensajeError'
import { CampoMensaje } from './CampoMensaje'
import { PrimaryButton, GhostButton } from './Button'
import { Confirmar } from './Confirmar'
import { canEditMessage, canModifyMessage, validMessageText, type MessageActionTarget } from './messageActions'

/** A separate draft: editing never destroys an unsent message or its attachment. */
export function MessageActionDialog({ target, onClose }: { target: MessageActionTarget; onClose: () => void }) {
  const [text, setText] = useState(target.message.text)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(true)
  const pending = useRef(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const editable = canEditMessage(target.message, target.userId)
  const close = () => { if (!pending.current) onClose() }

  const submit = async () => {
    if (pending.current || !canModifyMessage(target.message, target.userId)) return
    if (target.kind === 'edit' && (!editable || !validMessageText(target.message, text))) return
    pending.current = true
    setBusy(true)
    setError(null)
    try {
      if (target.kind === 'delete') {
        setConfirming(false)
        await deleteMessage(target.pairId, target.message.id)
      } else {
        await editMessage(target.pairId, target.message.id, text, target.message.text)
      }
      // Realtime handles the thread; refreshing also updates its inbox preview.
      void refreshConversations().catch(() => {})
      if (alive.current) {
        avisar(target.kind === 'delete' ? 'Mensaje eliminado' : 'Mensaje editado')
        onClose()
      }
    } catch (e) {
      if (!alive.current) return
      if (target.kind === 'delete') {
        avisar(mensajeError(e), true)
        onClose()
      } else setError(mensajeError(e))
    } finally {
      pending.current = false
      if (alive.current) setBusy(false)
    }
  }

  if (target.kind === 'delete') return <Confirmar visible={confirming}
    titulo="¿Eliminar este mensaje?" mensaje="Se eliminarán el texto y la música adjunta para las dos personas. No se puede deshacer."
    rotulo="Eliminar para todos" onCancelar={close} onConfirmar={() => { void submit() }} />

  const ios = Platform.OS === 'ios'
  const song = target.message.song ?? target.message.sharedSong
  const contenido = (<>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 12 }}>
            {song ? <Text className="text-muted-foreground text-footnote">{song.title} — {song.artist}</Text> : null}
            <CampoMensaje value={text} onChangeText={setText} placeholder="Mensaje" accessibilityLabel="Texto del mensaje"
              autoFocus editable={!busy && editable} expandido maxLength={2000} className="min-h-28 rounded-2xl bg-muted p-3 text-foreground" />
            {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" className="text-destructive text-footnote">{error}</Text> : null}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><GhostButton label="Cancelar" disabled={busy} onPress={close} /></View>
            <View style={{ flex: 1 }}><PrimaryButton label="Guardar cambios" busy={busy}
              disabled={!editable || !validMessageText(target.message, text) || text.trim() === target.message.text}
              onPress={() => { void submit() }} /></View>
          </View>
  </>)
  return <Dialogo titulo="Editar mensaje" ancho={520} contenidoPC={<><EncabezadoHoja titulo="Editar mensaje" izquierda={<BotonHoja onPress={close} disabled={busy} />} /><View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 16, flexShrink: 1 }}>{contenido}</View></>} visible transparent={!ios} presentationStyle={ios ? 'pageSheet' : 'overFullScreen'}
    animationType={ios ? 'slide' : 'fade'} onRequestClose={close}>
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: ios ? '#121212' : 'rgba(0,0,0,0.6)' }}>
      <KeyboardAvoidingView behavior={ios ? 'padding' : undefined} style={{ flex: 1, justifyContent: ios ? 'flex-start' : 'center', alignItems: 'center', padding: 20 }}>
        <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 520, maxHeight: '100%', borderRadius: ios ? 0 : 24, backgroundColor: '#181818', padding: 20, gap: 16 }}>
          <Text accessibilityRole="header" className="text-foreground text-title3 font-semibold">Editar mensaje</Text>
          {contenido}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Dialogo>
}
