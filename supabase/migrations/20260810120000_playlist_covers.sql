-- ═══════════════════════════════════════════════════════════════════════════
-- Portada propia para las listas.
--
-- Hasta acá la portada era siempre el mosaico de las primeras carátulas. Sigue
-- siendo el default —una lista recién hecha ya se ve como algo— pero ahora se
-- puede poner una foto, que es lo que convierte "mis canciones guardadas" en
-- algo de uno. Cuando hay foto, gana la foto.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.playlists
  add column if not exists cover_path text;

/*
 * Bucket público, igual que `avatars` y `artwork`.
 *
 * Público quiere decir que la URL no vence, no que cualquiera pueda escribir:
 * de eso se ocupan las policies de abajo. Es lo que hace que la portada se
 * pueda cachear en el navegador como cualquier imagen.
 */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "las portadas son públicas" on storage.objects;
create policy "las portadas son públicas"
  on storage.objects for select
  using (bucket_id = 'covers');

/*
 * Cada cuenta escribe únicamente dentro de la carpeta que lleva su uuid, el
 * mismo criterio que con los avatares. Sin esto, cualquiera con sesión podría
 * pisar la portada de una lista ajena.
 */
drop policy if exists "cada cuenta escribe sus portadas" on storage.objects;
create policy "cada cuenta escribe sus portadas"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "cada cuenta reemplaza sus portadas" on storage.objects;
create policy "cada cuenta reemplaza sus portadas"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "cada cuenta borra sus portadas" on storage.objects;
create policy "cada cuenta borra sus portadas"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

/**
 * Las listas, ahora con su portada y su duración total.
 *
 * Se recrea entera porque cambia el tipo de retorno y Postgres no deja
 * reemplazar una función agregándole columnas.
 *
 * La duración se suma acá y no en el cliente por lo mismo que el conteo: para
 * no traerse las canciones de cada lista solo para sumarlas.
 */
drop function if exists public.list_my_playlists();
create function public.list_my_playlists()
returns table (
  id         uuid,
  name       text,
  tracks     bigint,
  updated_at timestamptz,
  /** Carátulas de las primeras canciones, para el mosaico de la portada. */
  covers     text[],
  /** Portada propia, si se puso una. Gana sobre el mosaico. */
  cover_path text,
  total_ms   bigint
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.name,
    (select count(*) from public.playlist_tracks t where t.playlist_id = p.id),
    p.updated_at,
    (
      select array_agg(c order by c_pos)
      from (
        select coalesce(t.artwork_path, t.artwork_url) as c, t.position as c_pos
        from public.playlist_tracks t
        where t.playlist_id = p.id
        order by t.position
        limit 4
      ) first_four
    ),
    p.cover_path,
    (select coalesce(sum(t.duration_ms), 0) from public.playlist_tracks t where t.playlist_id = p.id)
  from public.playlists p
  where p.owner_id = auth.uid()
  order by p.updated_at desc;
$$;

revoke all on function public.list_my_playlists() from public;
grant execute on function public.list_my_playlists() to authenticated;
