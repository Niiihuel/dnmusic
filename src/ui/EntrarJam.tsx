import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
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
export function EntrarConCodigo() {
  const router = useRouter()
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
    return <AccionSocial label="Entrar con un código" secundaria onPress={() => setAbierto(true)} />
  }

  return (
    <View className="w-full gap-2.5">
      {/*
       * El código se escribe en grande y separado: son seis caracteres que
       * alguien te dictó o te pasó por chat, y espaciados se leen de un vistazo
       * para comparar contra lo que te mandaron. Mayúsculas siempre — así los
       * genera el servidor— y el campo acepta también el link entero pegado.
       */}
      <TextInput
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
        className="text-foreground rounded-2xl bg-card px-4 py-3.5 text-center text-[17px] font-semibold"
      />
      <Text
        className={`text-center text-[13px] leading-5 ${
          error ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        {error
          ? 'Ese código no parece válido. Fijate el link que te pasaron.'
          : 'Pegá el link o escribí el código que te pasaron.'}
      </Text>
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setAbierto(false)
            setValor('')
            setError(false)
          }}
          className="min-h-11 justify-center rounded-2xl bg-muted px-4 py-3 active:opacity-80"
        >
          <Text className="text-foreground text-[15px] font-semibold">Cancelar</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Entrar al Jam"
          onPress={entrar}
          disabled={!valor.trim()}
          className={`min-h-11 flex-1 justify-center rounded-2xl px-5 py-3 ${
            valor.trim() ? 'bg-primary active:opacity-80' : 'bg-muted'
          }`}
        >
          <Text
            className={`text-center text-[15px] font-semibold ${
              valor.trim() ? 'text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            Entrar
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
