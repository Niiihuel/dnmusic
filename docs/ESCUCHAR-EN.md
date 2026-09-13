# Escuchar en: dispositivos y controles nativos

El selector distingue conexión, destino seleccionado y reproducción efectiva.
El dueño de una sesión no se presenta como «Sonando» sólo por tener su ID:
se muestra en pausa, preparando audio, desconectado o sin reproducción según
la actividad disponible. La escucha local utiliza eventos de MotorAudio; la
remota usa presencia y la fecha de la última publicación del servidor.

PC tiene un diálogo desplazable, con acceso desde el reproductor, Escape,
cierre explícito y estado de resultado. El botón de dispositivos destaca
cuando la escucha pertenece a otro aparato; su descripción y el subtítulo
indican si está en pausa, reproduciendo o fuera de conexión.

iOS presenta una hoja del sistema y una lista SwiftUI que se actualiza mientras
está abierta. Ya no utiliza una captura fija de destinos en ActionSheetIOS.
Seleccionar conserva la hoja para mostrar espera, confirmación o error.

Una transferencia mantiene canción, posición y pausa. El envío del mensaje
por el canal no significa que la reproducción cambió: se espera la publicación
del destino. Se bloquean duplicados, se informa el vencimiento del plazo y se
protege la sesión frente a respuestas y pedidos anteriores. En un Jam se usa
su propio control de dispositivos; el selector personal no cambia esa cola.
Los pedidos entre clientes actualizados incorporan revisión e identificador
para rechazar comandos antiguos y duplicados. Se conservó compatibilidad con
clientes anteriores; éstos no ofrecen esa protección completa.
No se aplicaron migraciones ni cambios remotos a la base de datos.

## Minirreproductor y pestañas iOS

El minirreproductor ahora puede dibujarse completo en SwiftUI: portada, textos,
reproducir/pausar, siguiente, dispositivos y menú contextual. Usa Liquid Glass
del sistema en iOS 26, con material de respaldo y respeto a las preferencias de
accesibilidad. La reproducción y la navegación conservan sus motores compartidos.

Las pestañas ya utilizaban UITabBar en Swift. Se retiró el desenfoque forzado
en iOS 26 para que el sistema resuelva el material y el indicador de selección.
No se sustituyó el contenedor entero por UITabBarController ni se implementaron
su búsqueda expandible y minimización por scroll. Los detalles están en
[el módulo multimedia](../modules/media-controls/README.md).

Los binarios anteriores siguen usando las vistas de respaldo. El nuevo
minirreproductor sólo se solicita cuando el módulo anuncia que lo contiene.
Es necesario compilar e instalar un binario nuevo para ver estos cambios Swift;
un bundle JavaScript no los incorpora por sí solo.

## Verificación en equipos reales pendiente

1. Abrir PC e iPhone con la misma cuenta; comprobar dueño, reproducción y pausa.
2. Transferir en ambos sentidos; verificar canción y posición sin doble audio.
3. Repetir en pausa; el destino debe continuar pausado.
4. Cerrar un destino, cortar la red y retrasar una respuesta: la UI debe mostrar
   el problema, sin confirmar un cambio que no ocurrió ni ejecutar un pedido viejo.
5. En iOS 26 probar tabs, texto grande, VoiceOver, Reducir movimiento y Reducir
   transparencia; comprobar minirreproductor, menú y cambios de portada.

Las pruebas locales simulan los bordes de red y del reproductor. El empaquetado
Expo comprueba los bundles, no compila Swift ni reemplaza las pruebas en iPhone.

Validación local de esta integración: **572 pruebas pasan**, TypeScript y
ESLint sin errores. Los exports web e iOS terminaron correctamente.
