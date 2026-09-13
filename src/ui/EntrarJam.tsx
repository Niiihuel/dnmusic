import { EntradaTexto } from './EntradaTexto'
import { useState } from 'react'
import { Text, useWindowDimensions, View , type StyleProp, type ViewStyle} from 'react-native'
import { useRouter } from 'expo-router'
import { codigoDeJam } from '../lib/invitarJam'
import { AccionSocial } from './Social'

/**
 * Entrar a un Jam de otro sin depender del link.
 *
 * El único camino para sumarse era abrir `dnmusic-app.vercel.app/jam/CODIGO`
 * —un universal link o el QR—: si el link no abría la app, o llegaba por un
 * lado sin poder tocarlo, no había forma de entrar desde adentro. Este botón
 * pide el código (o el link pegado, que también sirve) y cae en la misma
 * puerta de siempre (`app/jam/[code]`), donde se elige dónde escuchar y se
 * entra. Vive en el estado vacío del Jam, al lado de «Iniciar».
 */
export function EntrarConCodigo({ compacta = false, style }: { compacta?: boolean; style?: StyleProp<ViewStyle> }) {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const densa = compacta && width >= 780
  const [abierto, setAbierto] = useState(false)
  const [valor, setValor] = useState('')
  const [error, setError] = useState(false)

  function entrar() {
    const code = codigoDeJam(valor)
    if (!code) {
      setError(true)
      return
    }
    setAbierto(false)
    setValor('')
    setError(false)
    router.push(`/jam/${code}`)
  }

  if (!abierto) {
    return <AccionSocial label="Entrar con un código" compacta={compacta} secundaria style={style} onPress={() => setAbierto(true)} />
  }

  return (
    <View className="w-full gap-2.5">
      {/*
       * El código se escribe en grande y separado: son seis caracteres que
       * alguien te dictó o te pasó por chat, y espaciados se leen de un vistazo
       * para comparar contra lo que te mandaron. Mayúsculas siempre — así los
       * genera el servidor— y el campo acepta también el link entero pegado.
       */}
      <EntradaTexto
        value={valor}
        onChangeText={(v) => {
          setValor(v)
          setError(false)
        }}
        onSubmitEditing={entrar}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        placeholder="ABC123"
        placeholderTextColor="#6A6A6A"
        returnKeyType="go"
        accessibilityLabel="Código o link del Jam"
        style={{ minHeight: densa ? 40 : 48, borderRadius: densa ? 10 : 16, paddingVertical: densa ? 8 : 14, fontSize: densa ? 15 : 17 }}
        className="text-foreground bg-card px-4 text-center font-semibold"
      />
      <Text
        className={`text-center text-footnote leading-5 ${
          error ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        {error
          ? 'Ese código no parece válido. Fijate el link que te pasaron.'
          : 'Pegá el link o escribí el código que te pasaron.'}
      </Text>
      <View className="flex-row items-center gap-2">
        <View style={{ flex: 1 }}><AccionSocial label="Cancelar" secundaria onPress={() => {
          setAbierto(false); setValor(''); setError(false)
        }} /></View>
        <View style={{ flex: 1 }}><AccionSocial label="Entrar al Jam" onPress={entrar} disabled={!valor.trim()} /></View>
      </View>
    </View>
  )
}
