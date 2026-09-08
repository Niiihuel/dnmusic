-- Verifica permisos sobre una lista existente; no deja datos de prueba.
begin;
insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-4000-8000-0000000000c1','lista_owner@example.test', '{"provider":"google"}'),
 ('00000000-0000-4000-8000-0000000000c2','lista_guest@example.test', '{"provider":"google"}');
-- Trusted SQL fixture setup: real Google signups remain pending until approved.
update app_private.access_accounts set status='approved' where user_id in (
 '00000000-0000-4000-8000-0000000000c1',
 '00000000-0000-4000-8000-0000000000c2');
insert into public.playlists(id,owner_id,name) values
 ('00000000-0000-4000-8000-0000000000c3','00000000-0000-4000-8000-0000000000c1','Lista existente');
insert into public.playlist_tracks(playlist_id,position,video_id,title,artist,audio_path) values
 ('00000000-0000-4000-8000-0000000000c3',0,'prueba','Tema original','Artista','prueba.m4a');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}',true);
set local role authenticated;
do $$ declare n integer; begin
 update public.playlists set colaborativa=true where id='00000000-0000-4000-8000-0000000000c3';
 get diagnostics n = row_count;
 if n <> 0 then raise exception 'Un visitante cambió la lista'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}',true);
do $$ declare p record; begin
 update public.playlists set colaborativa=true where id='00000000-0000-4000-8000-0000000000c3' returning * into p;
 if p.colaborativa is distinct from true or p.visibilidad <> 'privada' or p.name <> 'Lista existente' then
  raise exception 'La conversión cambió contenido o visibilidad';
 end if;
 if (select count(*) from public.playlist_tracks where playlist_id=p.id) <> 1 then raise exception 'Perdió canciones'; end if;
 perform public.add_playlist_collaborator(p.id,'00000000-0000-4000-8000-0000000000c2');
 if (select count(*) from public.list_playlist_collaborators(p.id)) <> 2 then raise exception 'Falta el dueño o el colaborador'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}',true);
do $$ declare n integer; begin
 update public.playlists set colaborativa=false where id='00000000-0000-4000-8000-0000000000c3';
 get diagnostics n = row_count;
 if n <> 0 then raise exception 'Un colaborador cambió permisos de la lista'; end if;
 if not public.puede_editar_lista('00000000-0000-4000-8000-0000000000c3') then raise exception 'La invitación no permite editar'; end if;
end $$;
rollback;
