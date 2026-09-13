-- Los usuarios con contraseña necesitan un valor en auth.users.email, pero no
-- es una dirección de contacto. Los identificadores históricos @flora.local
-- terminaban expuestos en la pantalla de acceso y en la administración.
--
-- Se reemplazan por valores opacos en el TLD reservado .invalid. El login no
-- depende del valor: auth_email_for_username resuelve profiles.username al
-- identificador actual. Las identidades Google conservan su correo real.

update auth.users u
set email = 'legacy-' || replace(u.id::text, '-', '') || '@auth.dnmusic.invalid',
    email_change = '',
    email_change_token_new = '',
    email_change_token_current = '',
    email_change_sent_at = null,
    email_change_confirm_status = 0,
    updated_at = now()
where u.email like '%@flora.local'
  and coalesce(u.raw_app_meta_data->>'provider', 'email') = 'email';

-- GoTrue también conserva el email de la identidad password en identity_data.
-- provider_id/sub siguen siendo el UUID y no se modifican.
update auth.identities i
set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(u.email::text), true),
    updated_at = now()
from auth.users u
where i.user_id = u.id
  and i.provider = 'email'
  and i.identity_data->>'email' is distinct from u.email;

-- El sufijo dejó de ser parte del contrato. La identidad email, la contraseña
-- y la aprobación distinguen las cuentas legacy de una cuenta Google nueva sin
-- exponer correos OAuth a quien todavía no inició sesión.
create or replace function public.auth_email_for_username(p_username text) returns text
language sql stable security definer set search_path=pg_catalog as $$
  select u.email
  from auth.users u
  join public.profiles p on p.user_id = u.id
  join app_private.access_accounts a on a.user_id = u.id and a.status = 'approved'
  where p.username = lower(btrim(coalesce(p_username, '')))
    and nullif(u.encrypted_password, '') is not null
    and exists (
      select 1 from auth.identities i
      where i.user_id = u.id and i.provider = 'email'
    )
  limit 1;
$$;
revoke all on function public.auth_email_for_username(text) from public, app_pending;
grant execute on function public.auth_email_for_username(text) to anon, authenticated;

-- La administración necesita el correo real de una solicitud Google para
-- reconocerla. Para cuentas password devuelve null: su identidad es @username,
-- nunca el identificador técnico de auth.users.
create or replace function public.access_requests()
returns table(
  user_id uuid,
  email text,
  display_name text,
  username text,
  avatar_url text,
  status text,
  requested_at timestamptz,
  decided_at timestamptz
)
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
  if not app_private.is_admin() then
    raise exception 'access_admin_required' using errcode='42501';
  end if;
  return query
  select
    a.user_id,
    (
      select i.identity_data->>'email'
      from auth.identities i
      where i.user_id = a.user_id
        and i.provider = 'google'
        and nullif(i.identity_data->>'email', '') is not null
      order by i.created_at
      limit 1
    )::text,
    p.display_name,
    p.username,
    u.raw_user_meta_data->>'avatar_url',
    a.status,
    a.requested_at,
    a.decided_at
  from app_private.access_accounts a
  join auth.users u on u.id = a.user_id
  left join public.profiles p on p.user_id = a.user_id
  order by (a.status = 'pending') desc, a.requested_at, a.user_id;
end;
$$;
revoke all on function public.access_requests() from public, anon;
grant execute on function public.access_requests() to authenticated;
