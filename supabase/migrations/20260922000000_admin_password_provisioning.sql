-- Las altas normales siguen siendo exclusivamente Google. Una cuenta legacy con
-- contraseña sólo puede ser provisionada por Auth Admin, porque
-- legacy_provisioned vive en app_metadata y un cliente no puede escribirlo.
create or replace function app_private.enforce_google_signup() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if coalesce(new.is_anonymous,false) then
    raise exception 'google_signup_required' using errcode='42501';
  end if;
  if coalesce(new.raw_app_meta_data->>'provider','')='google' then
    return new;
  end if;
  if coalesce(new.raw_app_meta_data->>'provider','')='email'
     and coalesce(new.raw_app_meta_data->>'legacy_provisioned','false')='true' then
    return new;
  end if;
  raise exception 'google_signup_required' using errcode='42501';
end;
$$;
revoke all on function app_private.enforce_google_signup() from public;

create or replace function public.before_user_created_google(event jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  provider text := coalesce(event->'user'->'app_metadata'->>'provider','');
  provisioned boolean := coalesce(event->'user'->'app_metadata'->>'legacy_provisioned','false')='true';
  anonymous boolean := coalesce((event->'user'->>'is_anonymous')::boolean,false);
begin
  if not anonymous and (provider='google' or (provider='email' and provisioned)) then
    return '{}'::jsonb;
  end if;
  return '{"error":{"http_code":403,"message":"google_signup_required"}}'::jsonb;
end;
$$;
revoke all on function public.before_user_created_google(jsonb) from public,anon,authenticated,app_pending,service_role;
grant execute on function public.before_user_created_google(jsonb) to supabase_auth_admin;
