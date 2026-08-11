/**
 * Saltar a un punto, sin que un salto perdido rompa nada.
 *
 * `seekTo` devuelve una promesa, y en iOS **un salto que queda a mitad de camino
 * la rechaza**: AVPlayer avisa que no terminó cuando llega otro salto y cancela
 * al anterior. Eso pasa todo el tiempo a propósito — los tres reproductores de
 * la app reintentan el salto inicial cada 600ms hasta que la posición entra en
 * la ventana del fragmento, así que cada reintento cancela al de antes.
 *
 * Estaba escrito `void player.seekTo(...)`, y `void` descarta **el valor**, no
 * el rechazo: cada salto cancelado quedaba como una promesa rechazada sin
 * dueño. Lo que se veía era `Uncaught (in promise) Object {"message": ""}`, sin
 * stack y sin relación aparente con lo que estabas haciendo — el mensaje viene
 * vacío porque lo arma el módulo nativo, no nuestro código.
 *
 * Tragarse el rechazo es lo correcto y no una alfombra: acá el salto es
 * **el mejor esfuerzo**. Si no llegó, el mismo bucle que lo pidió lo vuelve a
 * pedir en el cuadro siguiente; no hay nada que informar ni que reintentar a
 * mano, y no existe un caso en que al usuario le sirva enterarse.
 */
export function saltar(player: { seekTo: (segundos: number) => Promise<unknown> }, segundos: number) {
  player.seekTo(segundos).catch(() => undefined)
}
