set role authenticated;
set test.uid='00000000-0000-0000-0000-000000000001';
select public.edit_message('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000100','  Edited  ','Original');
select public.assert_true(text='Edited' and edited_at is not null and song->>'path'='private/audio' and created_at='2026-09-01'::timestamptz and read_at is null,'author edit preserves attachment, creation and receipts') from public.messages where id='00000000-0000-0000-0000-000000000100';
-- Repeat response/transport retry is idempotent even with the original expected text.
select public.assert_true((public.edit_message('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000100','Edited','Original')).edited_at=edited_at,'idempotent edit') from public.messages where id='00000000-0000-0000-0000-000000000100';
select public.expect_error($q$select public.edit_message('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000100','Stale overwrite','Original')$q$,'40001');
select public.expect_error($q$select public.edit_message('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000101','  ','Solo texto')$q$,'22023');
select public.expect_error($q$select public.edit_message('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000101',repeat('x',2001),'Solo texto')$q$,'22023');
-- Direct table writes remain receiver-only, including the author's read flags.
update public.messages set text='Direct forged edit',read_at=now() where id='00000000-0000-0000-0000-000000000100';
select public.assert_true(text='Edited' and read_at is null,'no direct author UPDATE privilege') from public.messages where id='00000000-0000-0000-0000-000000000100';
set test.uid='00000000-0000-0000-0000-000000000002';
select public.expect_error($q$select public.delete_message('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000100')$q$,'42501');
select public.expect_error($q$select public.edit_message('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000100','Forged','Edited')$q$,'42501');
select public.expect_error($q$update public.messages set text='Forged' where id='00000000-0000-0000-0000-000000000100'$q$,'42501');
select public.expect_error($q$update public.messages set deleted_at=now() where id='00000000-0000-0000-0000-000000000100'$q$,'42501');
update public.messages set opened_at='2000-01-01',read_at='2000-01-01' where id='00000000-0000-0000-0000-000000000100';
select public.assert_true(read_at>'2000-01-01' and opened_at>'2000-01-01','receiver receipts use server time') from public.messages where id='00000000-0000-0000-0000-000000000100';
-- An authenticated outsider, revoked approval, and a forged pair all fail.
set test.uid='00000000-0000-0000-0000-000000000003';
select public.expect_error($q$select public.delete_message('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000100')$q$,'42501');
set test.uid='00000000-0000-0000-0000-000000000001';
set test.approved='no';
select public.expect_error($q$select public.delete_message('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000100')$q$,'42501');
set test.approved='yes';
select public.expect_error($q$select public.delete_message('00000000-0000-0000-0000-000000000099','00000000-0000-0000-0000-000000000100')$q$,'42501');
select public.expect_error($q$insert into public.messages(id,pair_id,sender_id,text,deleted_at) values('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','Forged',now())$q$,'42501');
select public.expect_error($q$insert into public.messages(id,pair_id,sender_id,text,opened_at,read_at) values('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','Forged receipts',now(),now())$q$,'42501');
select public.delete_message('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000100');
select public.assert_true(text='Mensaje eliminado' and song is null and deleted_at is not null and read_at is not null and created_at='2026-09-01'::timestamptz,'deletion scrubs text, audio, artwork and lyrics; preserves dates') from public.messages where id='00000000-0000-0000-0000-000000000100';
select public.assert_true((public.delete_message('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000100')).deleted_at=deleted_at,'idempotent deletion') from public.messages where id='00000000-0000-0000-0000-000000000100';
select public.expect_error($q$select public.edit_message('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000100','Resurrect','Mensaje eliminado')$q$,'55000');
set test.uid='00000000-0000-0000-0000-000000000002';
select public.assert_true(text='Mensaje eliminado' and song is null,'recipient sees only scrubbed tombstone') from public.messages where id='00000000-0000-0000-0000-000000000100';
reset role;
select public.assert_true(not has_function_privilege('anon','public.delete_message(uuid,uuid)','execute') and not has_function_privilege('app_pending','public.edit_message(uuid,uuid,text,text)','execute'),'anonymous and pending users cannot call actions');
