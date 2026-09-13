-- Local regression: run with psql -v ON_ERROR_STOP=1. All fixtures roll back.
-- Requires access_approval and two approved fixture accounts; does not alter accounts.
begin;
create function pg_temp.check_publicacion(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
select set_config('test.publicacion_owner', (select user_id::text from app_private.access_owner), true);
select set_config('test.publicacion_reader', (select user_id::text from app_private.access_accounts
  where status='approved' and user_id<>current_setting('test.publicacion_owner')::uuid limit 1), true);
select pg_temp.check_publicacion(nullif(current_setting('test.publicacion_reader'),'') is not null, 'requires approved reader');
insert into public.playlists(id,owner_id,name,visibilidad) values
  ('a1100000-1111-4111-8111-111111111111',current_setting('test.publicacion_owner')::uuid,'Publicacion regression','privada');
insert into public.playlist_tracks(playlist_id,position,video_id,title,artist,artwork_url,audio_path,duration_ms)
values ('a1100000-1111-4111-8111-111111111111',0,'abcdef12345','Tema','Artista','https://example.test/cover','songs/test.m4a',120000);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.publicacion_owner'),'role','authenticated')::text,true);
select pg_temp.check_publicacion((select count(*)=0 from public.list_public_playlists(current_setting('test.publicacion_owner')::uuid)
  where id='a1100000-1111-4111-8111-111111111111'),'private not listed');
-- Same UPDATE RETURNING contract used by the client before reporting success.
with changed as (update public.playlists set visibilidad='publica'
  where id='a1100000-1111-4111-8111-111111111111' returning id,owner_id,visibilidad)
select pg_temp.check_publicacion((select count(*)=1 and bool_and(visibilidad='publica') from changed),'owner publication confirmed');
select pg_temp.check_publicacion((select count(*)=1 and bool_and(tracks=1 and total_ms=120000)
  from public.list_public_playlists(current_setting('test.publicacion_owner')::uuid)
  where id='a1100000-1111-4111-8111-111111111111'),'own profile returns published list and track totals');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.publicacion_reader'),'role','authenticated')::text,true);
select pg_temp.check_publicacion((select count(*)=1 from public.list_public_playlists(current_setting('test.publicacion_owner')::uuid)
  where id='a1100000-1111-4111-8111-111111111111'),'approved visitor sees public list');
with changed as (update public.playlists set visibilidad='privada'
  where id='a1100000-1111-4111-8111-111111111111' returning id)
select pg_temp.check_publicacion((select count(*)=0 from changed),'visitor cannot change visibility');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.publicacion_owner'),'role','authenticated')::text,true);
update public.playlists set visibilidad='privada' where id='a1100000-1111-4111-8111-111111111111';
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.publicacion_reader'),'role','authenticated')::text,true);
select pg_temp.check_publicacion((select count(*)=0 from public.list_public_playlists(current_setting('test.publicacion_owner')::uuid)
  where id='a1100000-1111-4111-8111-111111111111'),'unpublished no longer listed');
select pg_temp.check_publicacion((select count(*)=0 from public.playlist_tracks
  where playlist_id='a1100000-1111-4111-8111-111111111111'),'private tracks still protected');
rollback;
