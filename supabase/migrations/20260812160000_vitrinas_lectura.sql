-- ═══════════════════════════════════════════════════════════════════════════
-- Arregla la lectura de vitrinas: la policy consultaba `profiles` como el rol
-- que llama, y `profiles` está revocada para `authenticated` a propósito (todo
-- pasa por funciones). El EXISTS moría con «permission denied» y PostgREST lo
-- devolvía como 403 — las vitrinas de CUALQUIER perfil, incluso las propias,
-- llegaban como error y la pantalla las mostraba vacías.
--
-- El arreglo es el patrón que ya usa el Jam (`is_jam_member`): la pregunta
-- «¿este perfil es público?» se responde con una función SECURITY DEFINER, que
-- mira `profiles` con permisos propios y solo deja salir un booleano.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.perfil_es_publico(quien uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = quien and p.visibility = 'publico'
  );
$$;

revoke all on function public.perfil_es_publico(uuid) from public;
grant execute on function public.perfil_es_publico(uuid) to authenticated;

drop policy if exists "las vitrinas se miran si el perfil es público" on public.profile_showcases;
create policy "las vitrinas se miran si el perfil es público"
  on public.profile_showcases for select to authenticated
  using (owner_id = auth.uid() or public.perfil_es_publico(owner_id));
