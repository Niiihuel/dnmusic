-- Expone a cada miembro únicamente la identidad de la otra cuenta de su par.
-- auth.users no se publica mediante la API; esta función evita crear un
-- directorio de usuarios y conserva el acceso privado de a dos.
create or replace function public.get_pair_contact(p_pair_id uuid)
returns table (user_id uuid, username text)
language sql
security definer
stable
set search_path = public, auth, pg_temp
as $$
  select
    pm.user_id,
    case
      when u.email like '%@flora.local'
        then left(u.email, length(u.email) - length('@flora.local'))
      else split_part(u.email, '@', 1)
    end as username
  from public.pair_members pm
  join auth.users u on u.id = pm.user_id
  where pm.pair_id = p_pair_id
    and pm.user_id <> auth.uid()
    and public.is_pair_member(p_pair_id)
  limit 1;
$$;

revoke all on function public.get_pair_contact(uuid) from public;
grant execute on function public.get_pair_contact(uuid) to authenticated;
