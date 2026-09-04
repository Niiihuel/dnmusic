/*
 * El historial de escucha aprende dos cosas más: la tapa y de dónde venía.
 *
 * Hasta acá `plays` guardaba lo justo para sumar minutos por artista. Con el
 * inicio personalizado —«Seguir escuchando», «Volver a escuchar», «Tus
 * artistas»— el historial pasa a **dibujarse**, y una fila sin carátula es un
 * cuadrado gris; y «volver a escuchar» necesita saber qué lista o qué mix
 * estaba sonando, no solo qué canción.
 *
 * Las columnas van desnormalizadas y opcionales: lo que ya está anotado sigue
 * valiendo (sin tapa, el cliente busca la copia en Storage por el id, y sin
 * origen la fila simplemente no arma «volver a escuchar»). Es el mismo
 * criterio que el resto del historial: se anota lo que se sabe en el momento y
 * no se vuelve a preguntar.
 *
 * La lectura sigue siendo solo del dueño: nada de esto cambia quién ve qué.
 */
alter table public.plays
  add column if not exists artwork_url text,
  add column if not exists artwork_path text,
  /* La colección que sonaba: el id de una lista propia, `mix:<artista>`,
     `radio-personal`, `gustos`… Lo que `playQueue` recibe como origen. */
  add column if not exists origen_id text,
  add column if not exists origen_nombre text;

/*
 * Lo ya escuchado también tiene tapa: la copia de la carátula ya está en el
 * bucket `artwork` con el id de la canción por nombre, así que se la asigna
 * a las filas viejas. Es idempotente —solo toca las que no tienen nada— y no
 * se pierde por correrla dos veces.
 */
update public.plays p
set artwork_path = o.name
from storage.objects o
where o.bucket_id = 'artwork'
  and o.name like p.video_id || '.%'
  and p.artwork_path is null
  and p.artwork_url is null;
