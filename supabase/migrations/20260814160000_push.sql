-- ═══════════════════════════════════════════════════════════════════════════
-- Notificaciones push con la app cerrada.
--
-- Dos piezas:
--   · `push_tokens`: los tokens de Expo Push de cada aparato, uno por fila.
--     El token es la clave: un teléfono que cambia de cuenta pisa su fila en
--     vez de dejar una vieja apuntando al usuario anterior.
--   · un trigger sobre `messages` que, al llegar un mensaje, le avisa por
--     pg_net al servidor de música — que es quien tiene el secreto de servicio
--     y sabe armar y mandar la notificación por la API de Expo.
--
-- El aviso viaja **sin contenido**: solo el id del mensaje. El servidor lo
-- relee con la llave de servicio y decide título, cuerpo y carátula. Así el
-- texto de nadie queda en los logs de pg_net.
--
-- A dónde avisar vive en `private.push_relay` (una sola fila): la URL cambia
-- entre el Docker local y Railway, y el secreto no puede estar en el SQL de
-- una migración. Sin fila configurada, el trigger no hace nada y los mensajes
-- siguen andando igual.
-- ═══════════════════════════════════════════════════════════════════════════

-- pg_net: el HTTP asíncrono del trigger. En el Supabase local ya viene; en el
-- hosted hay que habilitarlo — esto lo deja igual en los dos.
create extension if not exists pg_net;

-- ── Tokens ──────────────────────────────────────────────────────────────────

create table if not exists public.push_tokens (
  token      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  platform   text not null default 'ios',
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens(user_id);

alter table public.push_tokens enable row level security;

-- Cada cuenta maneja solo sus tokens. El servidor los lee con la llave de
-- servicio, que saltea RLS.
drop policy if exists "own tokens" on public.push_tokens;
create policy "own tokens" on public.push_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── A dónde avisar ──────────────────────────────────────────────────────────

create schema if not exists private;

create table if not exists private.push_relay (
  id     boolean primary key default true check (id),
  url    text not null,
  secret text not null
);

-- Nadie más que postgres y el trigger (security definer) la tocan: sin
-- grants, el secreto no se puede leer ni con sesión de authenticated.

-- ── El trigger ──────────────────────────────────────────────────────────────

create or replace function private.avisar_push_mensaje()
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

  -- pg_net es asíncrono: encola y sigue. Un relay caído no frena el mensaje.
  perform net.http_post(
    url := relay.url || '/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Push-Secret', relay.secret
    ),
    body := jsonb_build_object('messageId', new.id)
  );
  return new;
exception when others then
  -- Avisar jamás puede romper el envío del mensaje.
  return new;
end;
$$;

drop trigger if exists mensajes_push on public.messages;
create trigger mensajes_push
  after insert on public.messages
  for each row execute function private.avisar_push_mensaje();

-- ── Lo que el servidor necesita para armar la notificación ─────────────────
--
-- En esta base las tablas no tienen grants directos —todo pasa por RPCs— y la
-- service_role no es la excepción. Estas dos funciones son su única puerta:
-- una devuelve el payload entero en un viaje (mensaje, quién lo mandó y los
-- tokens de los destinatarios) y la otra tira los tokens que Expo dio por
-- muertos. Solo la service_role puede llamarlas.

create or replace function public.datos_push(p_message uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'pairId', m.pair_id,
    'text', m.text,
    'song', m.song,
    'quien', coalesce(nullif(trim(p.display_name), ''), '@' || p.username, 'Alguien'),
    'tokens', coalesce(
      (
        select jsonb_agg(t.token)
        from public.push_tokens t
        join public.pair_members pm
          on pm.user_id = t.user_id and pm.pair_id = m.pair_id
        where t.user_id <> m.sender_id
      ),
      '[]'::jsonb
    )
  )
  from public.messages m
  left join public.profiles p on p.user_id = m.sender_id
  where m.id = p_message
$$;

revoke execute on function public.datos_push(uuid) from public, anon, authenticated;
grant execute on function public.datos_push(uuid) to service_role;

create or replace function public.borrar_tokens_push(p_tokens text[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = any(p_tokens)
$$;

revoke execute on function public.borrar_tokens_push(text[]) from public, anon, authenticated;
grant execute on function public.borrar_tokens_push(text[]) to service_role;

-- La puerta del cliente: guardar el token de **su** aparato. Por RPC como todo
-- lo demás — la tabla no tiene grants directos ni para authenticated. El
-- upsert es por token: un teléfono que cambió de cuenta pisa su fila.

create or replace function public.guardar_token_push(p_token text, p_platform text default 'ios')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        updated_at = excluded.updated_at
$$;

revoke execute on function public.guardar_token_push(text, text) from public, anon;
grant execute on function public.guardar_token_push(text, text) to authenticated;
