begin;
insert into auth.users(id,email) values
('00000000-0000-4000-8000-0000000000e1','reaccion_owner@example.test'),
('00000000-0000-4000-8000-0000000000e2','reaccion_autor@example.test'),
('00000000-0000-4000-8000-0000000000e3','reaccion_visitante@example.test');
update public.profiles set visibility='publico',username='reaccion_owner' where user_id='00000000-0000-4000-8000-0000000000e1';
update public.profiles set username='reaccion_autor' where user_id='00000000-0000-4000-8000-0000000000e2';
insert into public.profile_showcases(id,owner_id,kind,payload,position) values
('00000000-0000-4000-8000-0000000000e4','00000000-0000-4000-8000-0000000000e1','texto','{"texto":"Prueba"}',0);
insert into public.reacciones_vitrina(showcase_id,de,emoji) values
('00000000-0000-4000-8000-0000000000e4','00000000-0000-4000-8000-0000000000e2','🔥');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000e3","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if (select username from public.autores_reaccion_vitrina('00000000-0000-4000-8000-0000000000e4','🔥')) is distinct from 'reaccion_autor' then
  raise exception 'No muestra el autor autorizado'; end if;
 if exists(select 1 from public.autores_reaccion_vitrina('00000000-0000-4000-8000-0000000000e4','💜')) then raise exception 'No filtró por emoji'; end if;
 if exists(select 1 from public.autores_reaccion_vitrina('00000000-0000-4000-8000-0000000000e4','🔥',50)) then raise exception 'No paginó'; end if;
 if has_function_privilege('anon','public.autores_reaccion_vitrina(uuid,text,integer)','EXECUTE') then raise exception 'Acceso anónimo'; end if;
end $$;
reset role;
insert into public.blocks(blocker,blocked) values ('00000000-0000-4000-8000-0000000000e3','00000000-0000-4000-8000-0000000000e2');
set local role authenticated;
do $$ begin
 if exists(select 1 from public.autores_reaccion_vitrina('00000000-0000-4000-8000-0000000000e4','🔥')) then raise exception 'Expone cuenta bloqueada'; end if;
end $$;
reset role;
delete from public.blocks where blocker='00000000-0000-4000-8000-0000000000e3';
update public.profiles set visibility='privado' where user_id='00000000-0000-4000-8000-0000000000e1';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.autores_reaccion_vitrina('00000000-0000-4000-8000-0000000000e4','🔥')) then raise exception 'Expone pieza privada'; end if;
end $$;
rollback;
