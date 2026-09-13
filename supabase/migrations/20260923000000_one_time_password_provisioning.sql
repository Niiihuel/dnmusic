-- Permiso de un solo uso para provisionar una cuenta password mediante Auth
-- Admin. Sólo postgres puede crear el grant; los clientes no pueden leerlo. El
-- hook comprueba el hash y el trigger lo consume en la misma transacción que
-- crea auth.users, por lo que un fallo restaura el grant y un éxito lo invalida.
create table app_private.password_provisioning_grants (
  email_hash text primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null
);
alter table app_private.password_provisioning_grants enable row level security;
revoke all on app_private.password_provisioning_grants from public,anon,authenticated,app_pending,service_role;

create or replace function app_private.enforce_google_signup() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare consumed text;
begin
  if coalesce(new.is_anonymous,false) then
    raise exception 'google_signup_required' using errcode='42501';
  end if;
  if coalesce(new.raw_app_meta_data->>'provider','')='google' then
    return new;
  end if;
  if coalesce(new.raw_app_meta_data->>'provider','')='email' then
    delete from app_private.password_provisioning_grants g
    where g.email_hash=encode(extensions.digest(lower(new.email),'sha256'),'hex')
      and g.expires_at>now()
    returning g.email_hash into consumed;
    if consumed is not null then return new; end if;
  end if;
  raise exception 'google_signup_required' using errcode='42501';
end;
$$;
revoke all on function app_private.enforce_google_signup() from public;

create or replace function public.before_user_created_google(event jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  provider text := coalesce(event->'user'->'app_metadata'->>'provider','');
  email text := lower(coalesce(event->'user'->>'email',''));
  anonymous boolean := coalesce((event->'user'->>'is_anonymous')::boolean,false);
begin
  if not anonymous and provider='google' then return '{}'::jsonb; end if;
  if not anonymous and provider='email' and exists (
    select 1 from app_private.password_provisioning_grants g
    where g.email_hash=encode(extensions.digest(email,'sha256'),'hex')
      and g.expires_at>now()
  ) then return '{}'::jsonb; end if;
  return '{"error":{"http_code":403,"message":"google_signup_required"}}'::jsonb;
end;
$$;
revoke all on function public.before_user_created_google(jsonb) from public,anon,authenticated,app_pending,service_role;
grant execute on function public.before_user_created_google(jsonb) to supabase_auth_admin;
