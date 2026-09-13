-- Message edits/deletions are server-authorized operations. Existing clients keep
-- their receiver-only UPDATE policy for delivery receipts; no author UPDATE grant.
-- A deletion scrubs the content and emits UPDATE, so realtime can apply pair RLS.
begin;

alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;

create or replace function public.enforce_message_immutability()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if tg_op = 'INSERT' then
    if new.edited_at is not null or new.deleted_at is not null
      or new.opened_at is not null or new.read_at is not null then
      raise exception 'message_invalid_metadata' using errcode='42501';
    end if;
    return new;
  end if;
  if new.id is distinct from old.id or new.pair_id is distinct from old.pair_id
    or new.sender_id is distinct from old.sender_id or new.created_at is distinct from old.created_at then
    raise exception 'message_immutable_identity' using errcode='42501';
  end if;

  if old.sender_id = auth.uid() then
    if new.opened_at is distinct from old.opened_at or new.read_at is distinct from old.read_at then
      raise exception 'message_receiver_only_receipts' using errcode='42501';
    end if;
    if old.deleted_at is not null then
      if new.text is distinct from old.text or new.song is distinct from old.song
        or new.edited_at is distinct from old.edited_at or new.deleted_at is distinct from old.deleted_at then
        raise exception 'message_already_deleted' using errcode='55000';
      end if;
      return new;
    end if;
    if new.deleted_at is not null then
      new.text := 'Mensaje eliminado';
      new.song := null;
      new.edited_at := old.edited_at;
      new.deleted_at := clock_timestamp();
    else
      if new.song is distinct from old.song then
        raise exception 'message_immutable_attachment' using errcode='42501';
      end if;
      if new.text is distinct from old.text then
        new.edited_at := clock_timestamp();
      elsif new.edited_at is distinct from old.edited_at then
        raise exception 'message_invalid_metadata' using errcode='42501';
      end if;
    end if;
  else
    if new.text is distinct from old.text or new.song is distinct from old.song
      or new.edited_at is distinct from old.edited_at or new.deleted_at is distinct from old.deleted_at then
      raise exception 'message_author_required' using errcode='42501';
    end if;
    if new.opened_at is distinct from old.opened_at then
      if old.opened_at is not null then raise exception 'opened_at ya estaba fijado'; end if;
      new.opened_at := now();
    end if;
    if new.read_at is distinct from old.read_at then
      if old.read_at is not null then raise exception 'read_at ya estaba fijado'; end if;
      new.read_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_insert_metadata on public.messages;
create trigger messages_insert_metadata before insert on public.messages
for each row execute function public.enforce_message_immutability();

create or replace function public.edit_message(p_pair_id uuid, p_message_id uuid, p_text text, p_expected_text text)
returns public.messages language plpgsql security definer set search_path=pg_catalog as $$
declare m public.messages; clean_text text := btrim(p_text);
begin
  if auth.uid() is null or not app_private.is_approved() or not public.is_pair_member(p_pair_id) then
    raise exception 'message_author_required' using errcode='42501';
  end if;
  select * into m from public.messages where id=p_message_id and pair_id=p_pair_id and sender_id=auth.uid() for update;
  if not found then raise exception 'message_author_required' using errcode='42501'; end if;
  if m.deleted_at is not null then raise exception 'message_already_deleted' using errcode='55000'; end if;
  if clean_text is null or length(clean_text)>2000 or (length(clean_text)=0 and m.song is null) then
    raise exception 'message_invalid_text' using errcode='22023';
  end if;
  -- An identical retry does not advance the edit date. A stale editor cannot
  -- overwrite another device's newer text without explicitly reopening it.
  if m.text=clean_text then return m; end if;
  if m.text is distinct from p_expected_text then raise exception 'message_edit_conflict' using errcode='40001'; end if;
  update public.messages set text=clean_text where id=m.id returning * into m;
  return m;
end;
$$;

create or replace function public.delete_message(p_pair_id uuid, p_message_id uuid)
returns public.messages language plpgsql security definer set search_path=pg_catalog as $$
declare m public.messages;
begin
  if auth.uid() is null or not app_private.is_approved() or not public.is_pair_member(p_pair_id) then
    raise exception 'message_author_required' using errcode='42501';
  end if;
  select * into m from public.messages where id=p_message_id and pair_id=p_pair_id and sender_id=auth.uid() for update;
  if not found then raise exception 'message_author_required' using errcode='42501'; end if;
  if m.deleted_at is not null then return m; end if;
  update public.messages set deleted_at=clock_timestamp() where id=m.id returning * into m;
  return m;
end;
$$;

revoke all on function public.edit_message(uuid,uuid,text,text),public.delete_message(uuid,uuid)
  from public,anon,authenticated,app_pending,service_role;
grant execute on function public.edit_message(uuid,uuid,text,text),public.delete_message(uuid,uuid) to authenticated;

commit;
