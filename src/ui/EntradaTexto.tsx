import { forwardRef } from 'react'
import { TextInput, type TextInputProps } from 'react-native'

/** Campo compartido: UIKit/SwiftUI en iOS; TextInput en web y Android. */
export const EntradaTexto = forwardRef<TextInput, TextInputProps>(function EntradaTexto(props, ref) {
  return <TextInput {...props} ref={ref} />
})
