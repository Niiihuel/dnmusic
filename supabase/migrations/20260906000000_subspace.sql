/*
 * El sub-space: una pieza del mosaico que adentro tiene otro mosaico.
 *
 * Es la pieza paga del Space de Airbuds — acá es una más. En el perfil se ve
 * como una tarjeta con un título y las tapas de lo que tiene adentro, y al
 * tocarla se abre a pantalla completa un mosaico propio: las mismas piezas,
 * los mismos temas, el mismo orden y el mismo modo de edición que el
 * principal. Es lo que le da **capítulos con puerta** a un perfil: «Lo que
 * escuchaba en 2019» puede ser una sola pieza en vez de veinte.
 *
 * **Es la misma tabla, con un padre.** Las piezas de adentro son vitrinas
 * comunes —una canción, un artista, un texto— y hacerles una tabla aparte
 * sería duplicar el tipo, el payload, el estilo, las policies y las
 * reacciones para guardar exactamente lo mismo. Lo único que cambia es a qué
 * mosaico pertenecen, y eso es una columna: `parent_id` en null es el mosaico
 * principal; con un id, el de esa pieza.
 *
 * `position` pasa a contar **dentro del padre**: el orden del mosaico
 * principal y el de cada sub-space son secuencias independientes, así que las
 * lecturas y el conteo al agregar filtran por `(owner_id, parent_id)`, y el
 * índice acompaña.
 *
 * **Un solo nivel.** Un sub-space no puede tener padre: un mosaico dentro de
 * una pieza dentro de una pieza es un laberinto, no un perfil, y la pantalla
 * que lo muestra —una apilada sobre el perfil— no tendría dónde ponerlo. Lo
 * dice un check y no la app, porque es una regla del dato y no de una
 * pantalla.
 *
 * Borrar un sub-space borra lo que tiene adentro (`on delete cascade`): sin
 * su puerta, esas piezas no se verían desde ningún lado. La app avisa cuántas
 * se van antes de confirmar.
 *
 * Las policies existentes cubren todo: se sigue leyendo lo del perfil público
 * y escribiendo lo propio, sea de qué mosaico sea.
 */

alter table public.profile_showcases
  add column if not exists parent_id uuid null
    references public.profile_showcases(id) on delete cascade;

create index if not exists profile_showcases_padre_idx
  on public.profile_showcases (owner_id, parent_id, position);

alter table public.profile_showcases drop constraint if exists profile_showcases_kind_check;
alter table public.profile_showcases
  add constraint profile_showcases_kind_check
  check (kind in (
    'cancion', 'fragmento', 'lista', 'texto', 'imagen', 'ilustracion',
    'artista', 'album', 'letra', 'encabezado', 'espaciador', 'subspace'
  ));

/* Un solo nivel: un sub-space vive siempre en el mosaico principal. */
alter table public.profile_showcases drop constraint if exists profile_showcases_un_solo_nivel;
alter table public.profile_showcases
  add constraint profile_showcases_un_solo_nivel
  check (kind <> 'subspace' or parent_id is null);

/*
 * El padre tiene que ser un sub-space **del mismo dueño**.
 *
 * Un check no puede mirar otra fila, así que va como trigger. Sin esto una
 * pieza podría colgarse de una canción —que no tiene pantalla donde
 * mostrarla— o del sub-space de otra persona, y quedaría invisible para todo
 * el mundo. Corre con permisos propios porque desde el rol que escribe la
 * lectura de la tabla pasa por la RLS, y acá solo se quiere saber si el padre
 * existe y de quién es.
 */
create or replace function public.profile_showcases_padre_valido()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  padre record;
begin
  if new.parent_id is null then
    return new;
  end if;
  select kind, owner_id into padre
  from public.profile_showcases
  where id = new.parent_id;
  if padre is null or padre.kind <> 'subspace' or padre.owner_id <> new.owner_id then
    raise exception 'El padre de una pieza tiene que ser un sub-space propio'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.profile_showcases_padre_valido() from public;

drop trigger if exists profile_showcases_padre_valido on public.profile_showcases;
create trigger profile_showcases_padre_valido
  before insert or update of parent_id, owner_id on public.profile_showcases
  for each row execute function public.profile_showcases_padre_valido();
