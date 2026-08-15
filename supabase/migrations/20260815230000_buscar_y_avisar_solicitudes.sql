/*
 * Buscar contactos sin poder listarlos, y avisar cuando alguien te quiere sumar.
 *
 * Dos cosas que no tienen que ver entre sí salvo por el momento de agregar a
 * alguien, que es donde las dos se notan.
 */

-- ── 1. Buscar es buscar, no navegar el directorio ───────────────────────────
--
-- `search_contacts` tenía dos agujeros que juntos daban la lista de cuentas de
-- la app a cualquiera con sesión:
--
--   · con la consulta **vacía** devolvía gente igual, hasta 30. Abrir la
--     pantalla de agregar contacto era ver desconocidos sin haber buscado nada.
--   · buscaba por **substring** (`%a%`), así que una sola letra alcanzaba para
--     ir sacando la base de a treinta.
--
-- Ahora se busca **por el principio del nombre** y hacen falta al menos tres
-- letras.
--
-- Tres no es un número elegido a ojo: es el largo mínimo de un usuario en esta
-- app (`is_valid_username` pide `^[a-z0-9_]{3,20}$`). O sea que **nadie queda
-- fuera de alcance por ser corto** —el usuario más corto que existe se puede
-- escribir entero— y al mismo tiempo es justo el punto donde «buscar» deja de
-- ser «pasear»: con dos letras, «ma», «jo» o «ni» siguen barriendo una parte
-- enorme de una base de ciento y pico.
--
-- Lo que **no** cambia: seguís encontrando a quien buscás. Esto no esconde
-- cuentas, saca la posibilidad de pasearse por ellas.

create or replace function public.search_contacts(
  p_query text default '',
  p_limit integer default 20
)
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_path  text,
  pair_id      uuid,
  solicitud    text
)
language sql
security definer
stable
set search_path = public, auth, pg_temp
as $$
  with consulta as (select btrim(coalesce(p_query, '')) as q)
  select
    profile.user_id,
    profile.username,
    profile.display_name,
    profile.avatar_path,
    (
      select mine.pair_id
      from public.pair_members mine
      join public.pair_members other on other.pair_id = mine.pair_id
      where mine.user_id = auth.uid()
        and other.user_id = profile.user_id
      limit 1
    ) as pair_id,
    case
      when exists (
        select 1 from public.contact_requests r
        where r.from_user = auth.uid() and r.to_user = profile.user_id
      ) then 'enviada'
      when exists (
        select 1 from public.contact_requests r
        where r.from_user = profile.user_id and r.to_user = auth.uid()
      ) then 'recibida'
    end as solicitud
  from public.profiles profile, consulta
  where auth.uid() is not null
    and profile.user_id <> auth.uid()
    -- Bloqueado en cualquier dirección: como si la cuenta no existiera.
    and not public.hay_bloqueo(auth.uid(), profile.user_id)
    -- Sin nada escrito no hay nada que mostrar. Antes acá decía `q = '' or …`,
    -- que es exactamente lo contrario.
    and length(consulta.q) >= 3
    and (
      profile.username ilike consulta.q || '%'
      or coalesce(profile.display_name, '') ilike consulta.q || '%'
    )
  order by
    -- Primero por usuario, después por nombre visible: quien escribió el
    -- usuario exacto espera verlo arriba de todo.
    case when lower(profile.username) = lower(consulta.q) then 0
         when profile.username ilike consulta.q || '%' then 1
         else 2 end,
    profile.username
  limit greatest(1, least(coalesce(p_limit, 20), 30));
$$;

revoke all on function public.search_contacts(text, integer) from public;
grant execute on function public.search_contacts(text, integer) to authenticated;

-- ── 2. El aviso de «alguien te quiere agregar» ──────────────────────────────
--
-- Hasta acá una solicitud solo se veía **con la app abierta**: un cartelito al
-- refrescar la bandeja. Con la app cerrada no pasaba nada y te enterabas la
-- próxima vez que entrabas, que puede ser al otro día.
--
-- Se monta sobre el mismo circuito que los mensajes —trigger → pg_net →
-- `/push` → Expo— y por las mismas razones: el aviso viaja **sin contenido**,
-- solo quién y a quién, y el servidor relee el nombre con la llave de servicio.
-- Así ningún nombre visible queda escrito en los logs de pg_net.

-- Se pide por las dos puntas y no por un id porque `contact_requests` **no
-- tiene** id: su clave primaria es (from_user, to_user), que es lo correcto
-- —una solicitud de A hacia B es una sola cosa— pero obliga a que el aviso
-- viaje con el par en vez de con un uuid suelto.
create or replace function public.datos_push_solicitud(p_from uuid, p_to uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'quien', coalesce(nullif(trim(p.display_name), ''), '@' || p.username, 'Alguien'),
    'username', p.username,
    'tokens', coalesce(
      (
        select jsonb_agg(t.token)
        from public.push_tokens t
        where t.user_id = r.to_user
      ),
      '[]'::jsonb
    )
  )
  from public.contact_requests r
  left join public.profiles p on p.user_id = r.from_user
  where r.from_user = p_from and r.to_user = p_to
$$;

revoke execute on function public.datos_push_solicitud(uuid, uuid) from public, anon, authenticated;
grant execute on function public.datos_push_solicitud(uuid, uuid) to service_role;

create or replace function private.avisar_push_solicitud()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  relay private.push_relay%rowtype;
begin
  select * into relay from private.push_relay limit 1;
  if not found then
    return new;
  end if;

  perform net.http_post(
    url := relay.url || '/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Push-Secret', relay.secret
    ),
    body := jsonb_build_object('solicitudDe', new.from_user, 'solicitudPara', new.to_user)
  );
  return new;
exception when others then
  -- Igual que con los mensajes: avisar no puede romper la solicitud.
  return new;
end;
$$;

drop trigger if exists solicitudes_push on public.contact_requests;
create trigger solicitudes_push
  after insert on public.contact_requests
  for each row execute function private.avisar_push_solicitud();
