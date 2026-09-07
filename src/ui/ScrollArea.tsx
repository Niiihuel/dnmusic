import { forwardRef } from 'react'
import { ScrollView, type ScrollViewProps } from 'react-native'

/** ScrollView nativo. En web, Metro selecciona la barra superpuesta de .web.tsx. */
export const ScrollArea = forwardRef<ScrollView, ScrollViewProps>(function ScrollArea(props, ref) {
  return <ScrollView {...props} ref={ref} />
})
