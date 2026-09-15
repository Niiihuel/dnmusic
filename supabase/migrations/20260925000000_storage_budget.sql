/*
 * Presupuesto preventivo para Storage.
 *
 * Auth comparte la restricción de Fair Use con Storage. En el plan Free, que
 * el caché llegue a la cuota puede dejar sin Google login a toda la app. Esta
 * función reserva más de 80 MB por debajo del GB y se usa tanto desde los
 * clientes como en policies: una subida se rechaza antes de poner en riesgo
 * el inicio de sesión.
 */
create or replace function public.storage_upload_allowed(
  p_size bigint,
  p_exclude uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select app_private.is_approved()
     and coalesce((
       select sum(
         case
           when coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$'
             then (o.metadata ->> 'size')::bigint
           else 0
         end
       )
       from storage.objects o
       where o.id is distinct from p_exclude
     ), 0) + greatest(coalesce(p_size, 0), 0) <= 875 * 1024 * 1024;
$$;

revoke all on function public.storage_upload_allowed(bigint, uuid)
  from public, anon, authenticated, app_pending, service_role;
grant execute on function public.storage_upload_allowed(bigint, uuid)
  to authenticated, service_role;

/*
 * Segunda barrera para `.upload()`: aunque un cliente olvide llamar el RPC,
 * Storage vuelve a evaluar el total. Las URLs firmadas se chequean desde la
 * app antes de crearlas porque el token de subida ya es una autorización.
 */
drop policy if exists storage_budget_insert_guard on storage.objects;
create policy storage_budget_insert_guard
  on storage.objects as restrictive
  for insert to authenticated
  with check (
    public.storage_upload_allowed(
      case
        when coalesce(metadata ->> 'size', '') ~ '^[0-9]+$'
          then (metadata ->> 'size')::bigint
        else 0
      end,
      id
    )
  );

drop policy if exists storage_budget_update_guard on storage.objects;
create policy storage_budget_update_guard
  on storage.objects as restrictive
  for update to authenticated
  using (true)
  with check (
    public.storage_upload_allowed(
      case
        when coalesce(metadata ->> 'size', '') ~ '^[0-9]+$'
          then (metadata ->> 'size')::bigint
        else 0
      end,
      id
    )
  );
