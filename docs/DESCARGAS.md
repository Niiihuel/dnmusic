# Descargas para escuchar sin internet

Guardar canciones en el teléfono para que suenen sin conexión. Es la única parte
de la app donde vive un archivo local: todo lo demás está en Supabase y se pide
cuando hace falta.

## Dónde está cada cosa

| Archivo | Qué hace |
| --- | --- |
| `src/state/descargas.ts` | El módulo entero: índice, cola, progreso, borrado |
| `modules/backup-exclusion/` | Módulo nativo de 15 líneas de Swift; ver más abajo |
| `src/lib/artwork.ts` | `registerArteLocal`, el puente para dibujar la tapa bajada |
| `src/ui/MotorAudio.tsx` | Elige el archivo local en vez de firmar una URL |
| `src/ui/PlaylistView.tsx` | El botón de la cabecera, el ítem del menú y la marca de la fila |
| `app/ajustes.tsx` | Espacio ocupado y borrar todo |

## Las decisiones que importan

**Se indexa por `audioPath`, no por canción.** Una misma canción tiene un `id`
distinto en cada lista y otro más cuando llega por la radio de recomendados
(`radio:...`). Lo que no cambia nunca es el archivo en Storage —`{videoId}.m4a`—
así que esa es la clave. Bajarla una vez la deja bajada en todos lados, y quitarla
de una lista no borra el archivo que otra sigue usando.

**Documents, y fuera de la copia de iCloud.** iOS ofrece dos carpetas y ninguna
sirve sola: `Caches` está excluida del backup pero el sistema **la puede borrar**
cuando falta espacio —justo lo que no puede pasarle a algo que bajaste para el
avión—, y `Documents` no se borra pero se copia entera a iCloud, donde un par de
discos se comen los 5 GB gratis. La combinación correcta es `Documents` más el
atributo `isExcludedFromBackup`, que `expo-file-system` no expone: de ahí sale
`modules/backup-exclusion`. Se aplica a la carpeta y iOS lo hereda a lo que se
cree adentro.

**De a una por vez.** No es prudencia abstracta: la app está reproduciendo música
mientras baja. Saturar la conexión para guardar más rápido lo que vas a escuchar
después, cortando lo que estás escuchando ahora, sería trabajar en contra de lo
único que la app hace.

**El progreso avisa 5 veces por segundo, no las que llegan.** `onProgress` dispara
muchísimo y cada aviso redibuja la lista. Es la misma forma del problema que hizo
que iOS matara la app por consumo de CPU en segundo plano (ver el comentario largo
de `MotorAudio`), así que se corta de entrada.

**Terminar una descarga no puede cortar la música.** `useAudioPlayer` recrea el
reproductor cuando cambia la fuente, así que si una canción termina de bajarse
mientras suena y le cambiáramos la URL, arrancaría de cero. Lo local se consulta
**solo al conseguir la fuente**, no en un efecto que reaccione al índice: lo que ya
suena sigue por donde venía.

**El índice se contrasta contra el disco al arrancar.** Una entrada sin archivo se
descarta (prometer que algo está bajado cuando no está es peor que no ofrecerlo) y
un archivo sin entrada se borra (basura de una descarga cortada, que ocuparía
espacio para siempre sin que nadie sepa que está).

**Solo con Wi-Fi, y la cola se pausa en vez de fallar.** Prendido por defecto,
como en Spotify: un disco son decenas de megas y nadie espera que apretar
«descargar» le coma el plan de datos. Con datos móviles la cola **no falla cada
canción**, se detiene y las deja esperando; la retoma el aviso del sistema cuando
aparece el Wi-Fi, o apagar la preferencia. Frena solo cuando el sistema **dice**
que la red es celular: `UNKNOWN` cuenta como permitida, porque dejar las descargas
colgadas para siempre por no poder clasificar la conexión es peor que gastar unos
megas.

**Nada de esto existe en la web.** `expo-file-system` es un no-op ahí: cada método
imprime un aviso y devuelve vacío. `HAY_DESCARGAS` es lo que consultan las
pantallas para no dibujar controles que no podrían cumplir.

## Lo que hace falta para que ande

Tres dependencias nativas nuevas —`expo-file-system`, `expo-network` y
`modules/backup-exclusion`— así que **hay que compilar de nuevo** el development
client y el preview.

Con un binario viejo la app **arranca igual**: los dos paquetes usan
`requireNativeModule`, que lanza al importarse cuando el módulo no está, así que
`state/descargas.ts` los carga con `require` dentro de un `try` y deja
`HAY_DESCARGAS` en falso. Sin eso, sumar la dependencia convertía «esta versión no
tiene descargas» en «la app no abre» — pantalla roja al arrancar, sin nada que se
pueda hacer desde adentro. Es el mismo motivo por el que `modules/remote-commands`
y `modules/audio-route` se resuelven de forma opcional.

Si Metro tira `Unable to resolve module ./legacyWarnings from
.../expo-file-system/src/index.ts`, es su caché: el archivo existe. Se arregla con
`npx expo start -c`.

## Lo que no está

- **Una pantalla de «Descargas»** con todo lo bajado junto. Hoy se ve desde cada
  lista y el total desde Ajustes.
- **Bajar un álbum o el top de un artista.** Esas pantallas trabajan con canciones
  sin resolver (`TrackResult`), no con `PlaylistTrack`: hay que resolverlas antes,
  que es lo mismo que hace agregarlas a una lista.
