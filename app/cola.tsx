import { SafeAreaView } from 'react-native-safe-area-context'
import { ColaBody } from '../src/ui/ColaBody'
import { Hoja } from '../src/ui/Hoja'

/**
 * La cola como pantalla, para el teléfono.
 *
 * El cuerpo vive en `ColaBody`, que es el mismo que se muestra en el panel
 * derecho de escritorio: acá solo se lo envuelve en la cáscara de sheet — el
 * formSheet del sistema en iOS, `Hoja` en la web angosta. En una ventana
 * ancha esta ruta casi no se visita: «Ver la cola» abre el panel de al lado.
 */
export default function Cola() {
  return (
    /* Como hoja no llega nunca al reloj: en iOS el grabber y el gesto los
       pone el formSheet del sistema, y en web los pone `Hoja` — la subida, el
       velo y el cierre tocando afuera. Ninguna de las dos necesita flecha. */
    <Hoja>
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <ColaBody />
      </SafeAreaView>
    </Hoja>
  )
}
