# Música, fragmentos e inicio

## Motor y resolución

`src/ui/MotorAudio.tsx` conecta el estado global de reproducción con expo-audio.
Las colecciones, el reproductor, la card de una canción compartida y los enlaces
aprobados usan esa misma cola. Pausar durante una carga cancela la intención;
abrir otra pantalla no crea ni destruye una sesión de audio independiente.

`src/services/music.ts` pide al servicio de `server/` los metadatos, búsqueda,
resolución, carátulas y análisis. El servicio guarda audio validado en el bucket
privado `songs`; el cliente firma su ruta con una sesión aprobada al reproducir.
Si falla la resolución del servidor, los clientes nativos pueden resolver desde
su conexión y aportar el audio mediante el flujo de cuarentena y confirmación.
El navegador sigue usando el servicio por las restricciones de CORS.

- [Resolver de escritorio](ESCRITORIO.md) y [resolver del teléfono](MOTOR-TELEFONO.md)
- [Reproducción continua y precarga](REPRODUCCION-CONTINUA.md)
- [Componentes de audio](AUDIO_COMPONENTS.md) y [DSP/parches](../patches/README.md)
- [Análisis del servicio](../server/ANALYSIS.md)

## Adjuntos musicales de mensajes

`src/models/message.ts` define `SongSnippet`: `videoId`, título, artista,
carátula y ruta de audio, con `startMs` y `durationMs` para el recorte. El audio
completo vive en Storage; no se guarda una URL firmada en el mensaje. El modelo
puede incluir el pico medido, presentación de disco/letra y letra sincronizada
con tiempos de la canción completa. La reproducción aplica el inicio y el final
del fragmento; los permisos del chat y de Storage siguen comprobándose.

La canción completa compartida usa `SharedSong` en `src/models/sharedSong.ts`,
con `kind: 'track'`, metadatos y ruta, sin un recorte de fragmento. La card
conecta ese adjunto al motor global. Ver [compartir](COMPARTIR.md) y
[acciones de mensajes](CHAT-MENSAJES.md).

La [comparación inicial de proveedores](archivo/fragmentos-iniciales.md) se
conserva como decisión histórica. No describe el backend ni las dependencias
actuales: el proyecto ya no usa Firestore, expo-av ni previews de iTunes para
estos adjuntos.

## El inicio es de cada persona

La portada de YouTube Music es la misma para todo el mundo, y hasta acá era
casi todo el inicio. Ahora el inicio se arma desde **tu historial** (`plays`,
que desde la migración `escuchas_con_tapa` guarda también la tapa y la
colección que sonaba) y desde el motor de `services/recomendaciones`, con la
anatomía del «Inicio» de Apple Music en iOS 26: un título grande y estantes
—título en negrita, una fila que se desplaza—, **nunca tarjetas con borde**
(las cajas agrupadas son de los formularios, ver `docs/DESIGN.md`). En este
orden:

1. «Sugerencias destacadas para vos»: tarjetas altas (3:4) con la imagen a
   sangre y el texto encima, y cada una dice **por qué está**: «Hecho para
   vos · Tu radio · Según X, Y y Z», «Mix de artista», «Porque escuchaste X»,
   «Porque elegiste rock», y una novedad de la portada. Las que ponen algo a
   sonar llevan el redondel de reproducir; las otras abren una página.
2. «Escuchado recientemente»: las colecciones que **usaste** últimamente
   —tus listas, tus mixes, la radio, «Tus me gusta»— como tapas cuadradas
   con el tipo debajo. No son las listas que tenés sino las que sonaron;
   salen de `origenesRecientes`.
3. «Seguir escuchando»: lo último que sonó, sin repetir (`ultimasEscuchas`),
   en columnas de cuatro.
4. «Hecho para vos»: la radio y los mixes como tapas con el nombre adentro y
   el redondel, y debajo de dónde sale cada una.
5. «Recomendadas para vos»: la tanda concreta del motor, con el renglón
   «Según X, Y y Z, y lo que escucha su gente». Los nombres son tus anclas
   (`anclasPersonales`: historial, corazones, semillas y listas, de más a
   menos peso), que es exactamente con lo que se armó la tanda.
6. «Tus artistas»: los que más tiempo sonaron (`artistasRecientes`), con la
   tapa de la canción suya que más escuchaste como cara.
7. «Porque escuchaste X»: los parecidos de tu más escuchado, que publica
   YouTube en su ficha («Fans might also like»). Ninguna inferencia propia.
8. Una fila por género elegido, titulada «Rock para vos».
9. Los charts de la portada («Tendencias», numerados) y después el resto de
   la portada de YouTube Music, con «Géneros y momentos» tras la primera fila.

**Todo carga de una vez.** `useInicio` (en `src/ui/HomeFeed.tsx`) lanza los
diez pedidos en paralelo, espera a todos —con un tope de doce segundos por
pedido, después del cual esa fila va vacía— y recién entonces dibuja la
portada entera. Antes cada fila aparecía cuando llegaba y la pantalla se
armaba a saltos. Cada sección se calla si no tiene con qué: una cuenta nueva ve
el título y la portada.

**Todo tiene tapa.** Los mixes toman la carátula de tus corazones y tus
listas, y si el artista entró solo por tiempo escuchado, la del historial
(`conTapa`). Las escuchas viejas se rellenaron con la copia del bucket
`artwork` en la misma migración. Y `proxiedImage` deja pasar directo lo que no
es de Google: una tapa de nuestro Storage no necesita el proxy.
