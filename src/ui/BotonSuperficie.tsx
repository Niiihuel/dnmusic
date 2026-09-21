import { estadoControlWeb } from './estadoControl'
import { Pressable, type PressableProps } from 'react-native'

/** Superficies con portada/contenido propio: UIButton en iOS, Pressable en web. */
export function BotonSuperficie(props: PressableProps) { return <Pressable {...estadoControlWeb('surface')} {...props} /> }
