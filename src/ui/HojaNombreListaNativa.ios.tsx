import { useEffect } from 'react'
import { BottomSheet, Button, Form, Group, Host, NavigationStack, ProgressView, Section, Text, TextField, Toolbar, useNativeState } from '@expo/ui/swift-ui'
import { accessibilityLabel, autocorrectionDisabled, disabled, foregroundStyle, interactiveDismissDisabled, navigationTitle, onSubmit, presentationDetents, presentationDragIndicator, submitLabel, textFieldStyle } from '@expo/ui/swift-ui/modifiers'
import type { EdicionNombreLista } from './RenombrarLista'

/** Un solo presentador administra material, teclado, márgenes y cierre. */
export function HojaNombreListaNativa({ editor }: { editor: EdicionNombreLista }) {
  return <Host style={{ position: 'absolute', width: 0, height: 0 }} colorScheme="dark">
    <BottomSheet isPresented={!!editor.borrador} onIsPresentedChange={visible => { if (!visible) editor.cancelar() }}>
      <Group modifiers={[presentationDetents(['medium', 'large']), presentationDragIndicator('visible'), interactiveDismissDisabled(!!editor.borrador?.ocupado)]}>
        <FormularioNombre editor={editor} />
      </Group>
    </BottomSheet>
  </Host>
}

function FormularioNombre({ editor }: { editor: EdicionNombreLista }) {
  const draft = editor.borrador
  const texto = useNativeState(draft?.valor ?? '')
  useEffect(() => { if (draft && texto.get() !== draft.valor) texto.set(draft.valor) }, [draft, texto])
  if (!draft) return null
  const guardar = () => { editor.cambiar(texto.get()); void editor.guardar() }
  return <NavigationStack>
    <Toolbar>
      <Form modifiers={[navigationTitle('Cambiar nombre')]}>
        <Section title="Nombre de la lista" footer={<Text modifiers={draft.error ? [foregroundStyle('#FF6961')] : []}>{draft.error ?? 'Hasta 60 caracteres.'}</Text>}>
          <TextField text={texto} onTextChange={editor.cambiar} maxLength={60} autoFocus
            modifiers={[textFieldStyle('plain'), accessibilityLabel('Nombre de la lista'), disabled(draft.ocupado), autocorrectionDisabled(), submitLabel('done'), onSubmit(guardar)]} />
        </Section>
        {draft.ocupado ? <Section><ProgressView><Text>Guardando…</Text></ProgressView></Section> : null}
      </Form>
      <Toolbar.Content>
        <Button label="Cancelar" role="cancel" onPress={editor.cancelar} modifiers={[disabled(draft.ocupado)]} />
        <Button label="Guardar" onPress={guardar} modifiers={[disabled(draft.ocupado || !draft.valor.trim()), accessibilityLabel('Guardar el nombre de la lista')]} />
      </Toolbar.Content>
    </Toolbar>
  </NavigationStack>
}
