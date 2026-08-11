-- ═══════════════════════════════════════════════════════════════════════════
-- El login deja de depender de que el email siga al usuario.
--
-- Hasta acá el email de auth ERA el usuario (`dany` → `dany@flora.local`) y el
-- cliente hacía esa cuenta sin consultar nada. Eso funciona mientras el nombre
-- no cambie; en cuanto se permite cambiarlo, hay que mover el email también, y
-- GoTrue no deja: un cambio de email queda pendiente de confirmación y a un
-- dominio reservado no llega correo, así que la confirmación no llega nunca.
-- Resultado medido: el perfil pasaba a `renombrado`, el email seguía siendo
-- `probando@flora.local` y la cuenta quedaba inaccesible con su nombre nuevo.
--
-- Ahora el email es un identificador interno que no se toca más, y el usuario
-- vive solo en `profiles`. Para entrar se traduce con esta función.
-- ═══════════════════════════════════════════════════════════════════════════

/*
 * Traduce el usuario actual al email interno con el que entrar.
 *
 * Tiene que poder llamarse sin sesión —es justo lo que hace falta para iniciar
 * sesión—, así que confirma la existencia de un usuario. No agrega exposición:
 * `username_available` ya responde lo mismo, y el email que devuelve es
 * sintético (`algo@flora.local`), nunca una dirección real de nadie.
 */
create or replace function public.auth_email_for_username(p_username text)
returns text
language sql
security definer
stable
set search_path = public, auth, pg_temp
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.user_id
  where p.username = lower(btrim(coalesce(p_username, '')))
  limit 1;
$$;

revoke all on function public.auth_email_for_username(text) from public;
grant execute on function public.auth_email_for_username(text) to anon, authenticated;

/*
 * Cambios de email que quedaron a medio hacer.
 *
 * El intento anterior dejó cuentas con un cambio pendiente que nunca se va a
 * confirmar. Se cancela: el email interno es el bueno y no se toca más.
 */
update auth.users
set email_change = '',
    email_change_token_new = '',
    email_change_token_current = '',
    email_change_sent_at = null,
    email_change_confirm_status = 0
where coalesce(email_change, '') <> '';
