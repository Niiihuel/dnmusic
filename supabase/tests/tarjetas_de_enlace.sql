-- Execute AFTER 20260920000000_tarjetas_de_enlace.sql, inside a transaction that
-- the runner rolls back. Creates its own playlist and song rows; never edits an
-- account, a profile's visibility or the pinned owner.
create function pg_temp.card_check(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.card_denied(sql text,code text default '42501') returns void language plpgsql as $$
begin
  begin execute sql;
  exception when others then if sqlstate=code then return; end if; raise; end;
  raise exception 'Unexpected access/success: %',sql;
end $$;
create function pg_temp.card_as(id uuid,role_name text) returns void language sql as $$
  select set_config('request.jwt.claims',
    jsonb_build_object('sub',id,'role',role_name)::text,true);
$$;

select set_config('test.card_owner',(select user_id::text from app_private.access_owner),true);
select pg_temp.card_check(nullif(current_setting('test.card_owner'),'') is not null,'requires pinned owner');

-- Fixtures: one private playlist, one public playlist with a track.
insert into public.playlists (id,owner_id,name,visibilidad) values
  ('11111111-1111-4111-8111-111111111111',current_setting('test.card_owner')::uuid,'Privada de prueba','privada'),
  ('22222222-2222-4222-8222-222222222222',current_setting('test.card_owner')::uuid,'Publica de prueba','publica');
insert into public.playlist_tracks (playlist_id,position,video_id,title,artist,artwork_url,audio_path,duration_ms)
values ('22222222-2222-4222-8222-222222222222',0,'abcdefghijk','Tema','Artista','https://lh3.googleusercontent.com/x','songs/x.m4a',180000);

-- ── Publishing is for approved accounts only ────────────────────────────────
-- The publisher never reads the table back: it has no client grants, so every
-- assertion about stored rows runs outside the role, after `reset role`.
set local role authenticated;
select pg_temp.card_as(current_setting('test.card_owner')::uuid,'authenticated');
select public.publicar_cancion('abcdefghijk','Tema','Artista',null,'https://lh3.googleusercontent.com/x',180000);
-- Re-publishing refreshes without duplicating and without reassigning the row.
select public.publicar_cancion('abcdefghijk','Tema remasterizado','Artista','arte/abc.jpg','',180000);
select pg_temp.card_denied($q$select public.publicar_cancion('no valido!!','x','y',null,'',0)$q$,'23514');
select pg_temp.card_denied('select * from public.canciones_compartidas');
reset role;
select pg_temp.card_check((select count(*)=1 from public.canciones_compartidas),'publish inserts exactly one row, re-publish does not duplicate');
select pg_temp.card_check((select shared_by from public.canciones_compartidas where video_id='abcdefghijk')=current_setting('test.card_owner')::uuid,'publish attributes to caller');
select pg_temp.card_check((select title from public.canciones_compartidas where video_id='abcdefghijk')='Tema remasterizado','re-publish refreshes the title');
select pg_temp.card_check((select artwork_url from public.canciones_compartidas where video_id='abcdefghijk')='https://lh3.googleusercontent.com/x','empty artwork_url never erases the stored one');

set local role app_pending;
select pg_temp.card_as('00000000-0000-4000-8000-00000000bb19','app_pending');
select pg_temp.card_denied($q$select public.publicar_cancion('zzzzzzzzzzz','x','y',null,'',0)$q$);
select pg_temp.card_denied('select * from public.canciones_compartidas');
reset role;

-- ── The card is the only thing anon can reach ───────────────────────────────
set local role anon;
select pg_temp.card_as(null,'anon');
select set_config('request.path','/rpc/tarjeta_enlace',true);
select public.check_app_access();

select pg_temp.card_check(public.tarjeta_enlace('cancion','abcdefghijk')->>'titulo'='Tema remasterizado','anon reads a published song card');
select pg_temp.card_check(public.tarjeta_enlace('cancion','abcdefghijk')->>'tapa'='artwork/arte/abc.jpg','stored cover wins over the CDN url');
select pg_temp.card_check(public.tarjeta_enlace('cancion','no-publicada-nunca') is null,'unpublished song has no card');
select pg_temp.card_check(public.tarjeta_enlace('lista','22222222-2222-4222-8222-222222222222')->>'titulo'='Publica de prueba','anon reads a public playlist card');
select pg_temp.card_check(public.tarjeta_enlace('lista','11111111-1111-4111-8111-111111111111') is null,'private playlist has no card');
select pg_temp.card_check(public.tarjeta_enlace('lista','no-es-un-uuid') is null,'a malformed id is not an error');
select pg_temp.card_check(public.tarjeta_enlace('cualquier-cosa','abcdefghijk') is null,'an unknown kind has no card');
select pg_temp.card_check(public.tarjeta_enlace('cancion','') is null,'an empty id has no card');
select pg_temp.card_check(public.tarjeta_enlace('cancion',repeat('x',201)) is null,'an oversized id has no card');

-- Nothing in a card is an account: no uuid, no e-mail, no owner.
select pg_temp.card_check(
  (public.tarjeta_enlace('lista','22222222-2222-4222-8222-222222222222'))::text
    !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  or (public.tarjeta_enlace('lista','22222222-2222-4222-8222-222222222222'))->>'id'
     ='22222222-2222-4222-8222-222222222222',
  'a card carries no uuid other than the requested id');

-- The gate is not open anywhere else.
select set_config('request.path','/rpc/get_my_profile',true);
select pg_temp.card_denied('select public.check_app_access()');
select set_config('request.path','/rpc/tarjeta_enlace/extra',true);
select pg_temp.card_denied('select public.check_app_access()');
select pg_temp.card_denied('select * from public.canciones_compartidas');
select pg_temp.card_denied('select * from public.playlists');
select pg_temp.card_denied($q$select public.publicar_cancion('yyyyyyyyyyy','x','y',null,'',0)$q$);
reset role;

select 'tarjetas_de_enlace OK' as resultado;
