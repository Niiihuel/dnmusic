import { createContext, useContext, type ReactNode } from 'react'
import { Text, type TextProps } from 'react-native'
import { fuenteDe } from '../lib/fuentes'

const FuenteContext = createContext<string | null>(null)
export function FuentePerfil({
  fuente,
  children,
}: {
  fuente?: string | null
  children: ReactNode
}) {
  return <FuenteContext.Provider value={fuente ?? null}>{children}</FuenteContext.Provider>
}
export function TextoPerfil({ style, ...props }: TextProps & { className?: string }) {
  const fuente = fuenteDe(useContext(FuenteContext))
  return (
    <Text
      {...props}
      style={[style, fuente ? { fontFamily: fuente.familia, fontWeight: 'normal' } : null]}
    />
  )
}
