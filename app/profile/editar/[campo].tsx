import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useIniciarPerfilEdicion } from '../../../src/state/perfilEdicion'
import { CabeceraEdicionPerfil, TITULO_CAMPO, useEditorDeCampo, type CampoPerfil } from '../../../src/ui/EditorDeCampo'
import { Panel } from '../../../src/ui/Panel'
import { TarjetaPerfil } from '../../../src/ui/TarjetaPerfil'
import { useKeyboardH, usePiso } from '../../../src/state/shell'

/** Un campo por pantalla, con borrador, acciones persistentes y vista previa del perfil. */
export default function EditarCampo() {
  const { campo } = useLocalSearchParams<{ campo?: string }>()
  const cual: CampoPerfil = campo === 'usuario' ? 'usuario' : campo === 'linea' ? 'linea' : 'nombre'
  // Cambiar la ruta inicia un borrador independiente, incluso si el navegador reutiliza la pantalla.
  return <EditorCampo key={cual} cual={cual} />
}

function EditorCampo({ cual }: { cual: CampoPerfil }) {
  const router = useRouter()
  const piso = usePiso(24)
  const teclado = useKeyboardH()
  const pisoVisible = teclado > 0 ? 24 : piso
  const [ancho, setAncho] = useState(0)
  useIniciarPerfilEdicion()
  const editor = useEditorDeCampo(cual)
  const columnas = ancho >= 740

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1" onLayout={(e) => setAncho(e.nativeEvent.layout.width)}>
        <CabeceraEdicionPerfil
          titulo={TITULO_CAMPO[cual]}
          ocupado={editor.busy}
          onCancelar={() => router.dismissTo('/profile/editar')}
          rotuloVolver="Listo"
        />
        <Panel className="flex-1">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
            <ScrollView
              contentContainerClassName="grow items-center px-5 pt-5"
              contentContainerStyle={{ paddingBottom: pisoVisible }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={{ width: '100%', maxWidth: columnas ? 900 : 520, flexDirection: columnas ? 'row' : 'column', gap: 28 }}>
                <View style={{ flex: columnas ? 1 : undefined, minWidth: 0, gap: 16 }}>
                  {editor.campo}
                </View>
                <View style={{ width: columnas ? 340 : '100%', maxWidth: 380, alignSelf: columnas ? 'flex-start' : 'center', gap: 8 }}>
                  <Text className="text-foreground text-[17px] font-semibold">Vista previa</Text>
                  <View style={{ paddingHorizontal: 16, paddingVertical: 24 }}>
                    {editor.perfilVistaPrevia ? <TarjetaPerfil perfil={editor.perfilVistaPrevia} animado={false} /> : (
                      <Text className="text-muted-foreground text-[15px]">Cargando tu perfil…</Text>
                    )}
                  </View>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Panel>
      </View>
    </SafeAreaView>
  )
}
