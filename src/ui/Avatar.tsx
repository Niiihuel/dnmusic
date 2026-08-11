import { useState } from 'react'
import { Image, Text, View } from 'react-native'
import { avatarUrl, initialsFor } from '../services/profile'

/**
 * Foto de perfil, con las iniciales como respaldo.
 *
 * El respaldo no es decorativo: la mayoría de las cuentas no van a tener foto, y
 * un círculo vacío hace que todas las filas de la lista se vean iguales. Las
 * iniciales dan algo que distinguir de un vistazo.
 *
 * Si la imagen falla al cargar —ruta vieja, archivo borrado— se cae a las
 * iniciales en vez de dejar el hueco roto.
 */
export function Avatar({
  name,
  path,
  size = 40,
}: {
  /** Nombre visible o usuario; de ahí salen las iniciales. */
  name: string
  path?: string | null
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  const uri = failed ? null : avatarUrl(path)

  return (
    <View
      className="items-center justify-center overflow-hidden rounded-full bg-muted"
      style={{ width: size, height: size }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          onError={() => setFailed(true)}
          style={{ width: size, height: size }}
          accessibilityLabel={`Foto de ${name}`}
        />
      ) : (
        <Text
          className="text-foreground font-semibold uppercase"
          // El tamaño de la letra sigue al del círculo: con un valor fijo, las
          // iniciales bailan entre el avatar chico de la lista y el grande del
          // perfil.
          style={{ fontSize: Math.max(10, Math.round(size * 0.36)) }}
        >
          {initialsFor(name)}
        </Text>
      )}
    </View>
  )
}
