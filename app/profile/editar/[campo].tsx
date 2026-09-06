import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FormError } from '../../../src/ui/Button'
import { BotonConfirmar, BotonHoja, EncabezadoHoja } from '../../../src/ui/EncabezadoHoja'
import { TITULO_CAMPO, useEditorDeCampo, type CampoPerfil } from '../../../src/ui/EditorDeCampo'
import { Panel } from '../../../src/ui/Panel'
import { usePiso } from '../../../src/state/shell'
import { volver } from '../../../src/lib/volver'

const MAX_W = 520

/**
 * Editar **un** campo del perfil, en su propia pantalla.
 *
 * Es la contraparte de las filas de `GrupoAjustes`: en Ajustes de iOS, tocar
 * una fila empuja una pantalla que hace una sola cosa, con su título y su
 * camino de vuelta. Acá igual: volver a la izquierda, el título en el medio y
 * **guardar a la derecha** como marca, que es donde iOS pone el «Guardar» de
 * una pantalla apilada. En la compu este campo no llega a ser pantalla: vive
 * adentro del detalle de «Editar perfil» (ver `CampoEnLinea`).
 *
 * El campo, su validación y su guardado están en `useEditorDeCampo`: acá solo
 * se decide dónde va el botón.
 */
export default function EditarCampo() {
  /* El campo llega por la ruta —`/profile/editar/usuario`— y no por query:
     así cada uno tiene su URL propia, que es lo que hace que el botón de
     atrás del navegador funcione como uno espera. */
  const { campo } = useLocalSearchParams<{ campo?: string }>()
  const cual: CampoPerfil = campo === 'usuario' ? 'usuario' : campo === 'linea' ? 'linea' : 'nombre'
  const router = useRouter()
  const piso = usePiso(24)
  const editor = useEditorDeCampo(cual, () => volver(router, '/profile/editar'))

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1">
        <EncabezadoHoja
          titulo={TITULO_CAMPO[cual]}
          izquierda={<BotonHoja tipo="volver" onPress={() => volver(router, '/profile/editar')} />}
          derecha={
            <BotonConfirmar
              label="Guardar"
              activo={editor.puedeGuardar}
              ocupado={editor.busy}
              onPress={() => void editor.guardar()}
            />
          }
        />

        <Panel className="flex-1">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className="flex-1"
          >
            <ScrollView
              contentContainerClassName="grow items-center px-6 pt-4"
              contentContainerStyle={{ paddingBottom: piso }}
              keyboardShouldPersistTaps="handled"
            >
              <View className="w-full gap-5" style={{ maxWidth: MAX_W }}>
                {editor.campo}
                <FormError message={editor.error} />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Panel>
      </View>
    </SafeAreaView>
  )
}
