/*
 * El historial de escuchas.
 *
 * Es lo que faltaba para poder decir «tantos minutos» o «tu artista más
 * escuchado»: hasta acá la app **no registraba una sola reproducción**. Sin esta
 * tabla, cualquier número de esos sería inventado.
 *
 * Se guarda una fila por escucha y no un contador por canción: un contador
 * responde «cuántas veces» y nada más, mientras que las filas responden también
 * «cuándo» — que es lo que hace falta para «este mes» o «esta semana», que es
 * como se mira este tipo de dato.
 *
 * `ms` es **cuánto se escuchó de verdad**, no cuánto dura el tema. Sumar
 * duraciones contaría entera una canción que saltaste a los diez segundos, y el
 * número diría más sobre cuánto tocaste el botón que sobre cuánto escuchaste.
 */
create table if not exists public.plays (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  video_id text not null,
  title text not null default '',
  artist text not null default '',
  artist_id text,
  ms integer not null check (ms >= 0),
  at timestamptz not null default now()
);

/* Las consultas son siempre «lo mío, ordenado por fecha»: el índice va así. */
create index if not exists plays_mias_idx on public.plays (owner_id, at desc);
create index if not exists plays_artista_idx on public.plays (owner_id, artist);

alter table public.plays enable row level security;
grant select, insert on public.plays to authenticated;

/*
 * **Nadie lee las escuchas de otro, ni con el perfil público.**
 *
 * Lo que se comparte son los agregados —minutos, artista más escuchado—, no la
 * lista de qué escuchaste y cuándo. Eso es otra cosa: un perfil público no
 * convierte tu historial en público, igual que en Spotify tus tops se ven pero
 * tu historial no.
 *
 * Tampoco se actualizan ni se borran: una escucha ya pasó. Sin `update` ni
 * `delete` no hay forma de reescribir la historia, ni por error.
 */
create policy "cada quien ve sus escuchas"
  on public.plays for select to authenticated
  using (owner_id = auth.uid());

create policy "cada quien anota las suyas"
  on public.plays for insert to authenticated
  with check (owner_id = auth.uid());

/*
 * Los agregados de un perfil.
 *
 * Devuelve **solo números**, nunca filas del historial, y respeta la
 * visibilidad igual que `get_profile`: si esa cuenta está en privado no
 * devuelve nada. Es `security definer` porque tiene que poder leer las escuchas
 * de otro para sumarlas, cosa que la policy de arriba prohíbe — que es
 * exactamente el motivo por el que este resumen es una función y no una
 * consulta desde la app.
 */
create or replace function public.get_profile_stats(p_user_id uuid)
returns table (
  minutos integer,
  canciones integer,
  artista_top text,
  minutos_artista_top integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with visible as (
    select 1 from public.profiles p
    where p.user_id = p_user_id
      and (p.user_id = auth.uid() or p.visibility = 'publico')
  ),
  mias as (
    select * from public.plays where owner_id = p_user_id and exists (select 1 from visible)
  ),
  top as (
    select artist, sum(ms) as ms
    from mias
    where artist <> ''
    group by artist
    order by sum(ms) desc
    limit 1
  )
  select
    (select coalesce(sum(ms), 0) / 60000 from mias)::integer,
    (select count(distinct video_id) from mias)::integer,
    (select artist from top),
    (select ms / 60000 from top)::integer;
$$;

revoke all on function public.get_profile_stats(uuid) from public;
grant execute on function public.get_profile_stats(uuid) to authenticated;
