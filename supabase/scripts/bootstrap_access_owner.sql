-- Run as postgres with a UUID independently verified in Auth (never resolve a username here):
-- psql ... -v owner_uuid=THE_CONFIRMED_AUTH_UUID -f supabase/scripts/bootstrap_access_owner.sql
\if :{?owner_uuid}
  begin;
  select app_private.bootstrap_access_owner(:'owner_uuid'::uuid);
  commit;
\else
  \echo 'Required: -v owner_uuid=<confirmed existing approved auth UUID>'
  \quit 3
\endif
