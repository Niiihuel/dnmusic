/*
 * El perfil deja de ser una columna y pasa a ser un mosaico.
 *
 * Las vitrinas siempre fueron bloques ordenados —la idea de Steam— pero todos
 * del mismo ancho, uno abajo del otro. Eso alcanza para tres, y a partir de ahí
 * el perfil es una lista larga donde todo pesa lo mismo: no hay forma de decir
 * «esta canción es la que importa y estas dos son al costado».
 *
 * El ancho es lo que convierte esa columna en algo compuesto. Dos valores y no
 * una grilla libre, a propósito: con anchos arbitrarios cada perfil necesita su
 * propio criterio de qué entra en una fila, y lo que se gana en libertad se
 * pierde en que ningún perfil se ve bien sin trabajarlo. Con `entero` y `mitad`
 * cualquier combinación cierra sola.
 *
 * **`entero` es el default**, así que todos los perfiles que ya existen quedan
 * exactamente como estaban: esto no reacomoda nada de nadie.
 *
 * Y vuelve la vitrina de imagen, que se había sacado en `0d02e94` con una razón
 * que hoy ya no aplica: entonces una imagen subida **era** el fondo, y tenerla
 * además como tarjeta era la misma imagen dos veces con la tarjeta ganando
 * siempre por estar en el medio. Ahora el fondo tiene su propia primera pantalla
 * (ver `alturaDeHeroe`) y esto es otra cosa: una pieza del mosaico, que además
 * nace en media columna para no volver a competirle.
 */

alter table public.profile_showcases
  add column if not exists ancho text not null default 'entero';

alter table public.profile_showcases
  drop constraint if exists profile_showcases_ancho_check;
alter table public.profile_showcases
  add constraint profile_showcases_ancho_check
  check (ancho in ('entero', 'mitad'));

/*
 * `imagen` y no `ilustracion`: el nombre viejo quedó de cuando era «la pieza
 * grande del centro» de Steam, que es justamente lo que ya no es. Se deja el
 * valor viejo aceptado igual —hay bases donde puede haber quedado alguna— y el
 * cliente lo lee como imagen, así que nada se pierde.
 */
alter table public.profile_showcases drop constraint if exists profile_showcases_kind_check;
alter table public.profile_showcases
  add constraint profile_showcases_kind_check
  check (kind in ('cancion', 'fragmento', 'lista', 'texto', 'imagen', 'ilustracion'));
