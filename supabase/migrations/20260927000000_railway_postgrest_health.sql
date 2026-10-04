-- Envoy comprueba PostgREST directamente por su raíz interna (`GET /`).
-- El gateway público protege `/rest/v1/` con su propia clave administrativa,
-- por lo que esta excepción no abre tablas ni RPC a clientes anónimos.
create or replace function public.check_app_access() returns void
language plpgsql stable security definer set search_path=pg_catalog as $$
declare path text:=coalesce(current_setting('request.path',true),'');
begin
  if path='/' then return; end if;
  if auth.role()='service_role' then return; end if;
  if path='/rpc/auth_email_for_username' then return; end if;
  if path='/rpc/tarjeta_enlace' then return; end if;
  if path='/rpc/access_status' and auth.uid() is not null then return; end if;
  perform app_private.require_approved();
end;
$$;

revoke all on function public.check_app_access() from public;
grant execute on function public.check_app_access() to anon,authenticated,app_pending,service_role;
notify pgrst,'reload schema';
