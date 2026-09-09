-- Only the approved owner may remove another DMusic account.
-- The owner is pinned by UUID and remains impossible to delete from the app.
create function public.delete_access_account(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare
  removed integer;
begin
  if not app_private.is_admin() then
    raise exception 'access_admin_required' using errcode='42501';
  end if;
  if p_user_id is null then
    raise exception 'access_account_required' using errcode='22004';
  end if;
  if exists(select 1 from app_private.access_owner where user_id=p_user_id) then
    raise exception 'access_owner_protected' using errcode='42501';
  end if;
  if not exists(select 1 from auth.users where id=p_user_id) then
    raise exception 'access_account_not_found' using errcode='P0002';
  end if;

  -- A direct-message pair has no useful shape with only one participant.
  -- Removing the pair also removes its messages before the auth FK is checked.
  delete from public.pairs
  where id in (
    select pair_id from public.pair_members where user_id=p_user_id
  );

  -- Tracks added to somebody else's active Jam otherwise retain a mandatory FK.
  delete from public.jam_queue where added_by=p_user_id;

  -- The remaining profile, playlists, likes, sessions and memberships use
  -- ON DELETE CASCADE/SET NULL and are removed atomically with the auth account.
  delete from auth.users where id=p_user_id;
  get diagnostics removed = row_count;
  if removed<>1 then
    raise exception 'access_account_not_found' using errcode='P0002';
  end if;

  return jsonb_build_object('user_id',p_user_id,'deleted',true);
end;
$$;

revoke all on function public.delete_access_account(uuid) from public,anon,app_pending;
grant execute on function public.delete_access_account(uuid) to authenticated;

notify pgrst,'reload schema';
