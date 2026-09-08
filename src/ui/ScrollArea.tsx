import { forwardRef, useContext } from 'react'
import { ScrollView, type ScrollViewProps } from 'react-native'
import { ScrollAreaTecho } from './ScrollAreaContext'

type ScrollAreaProps = ScrollViewProps & { stableIndicator?: boolean; contentKey?: string | number }


/** ScrollView nativo. En web, Metro selecciona la barra superpuesta de .web.tsx. */
export const ScrollArea = forwardRef<ScrollView, ScrollAreaProps>(function ScrollArea({ stableIndicator: _stableIndicator, contentKey: _contentKey, ...props }, ref) {
  const top = useContext(ScrollAreaTecho)
  if (props.horizontal) return <ScrollView {...props} ref={ref} />
  return <ScrollAreaTecho.Provider value={0}>
    <ScrollView {...props} scrollIndicatorInsets={{ top, ...props.scrollIndicatorInsets }} ref={ref} />
  </ScrollAreaTecho.Provider>
})
