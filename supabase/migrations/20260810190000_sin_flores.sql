-- Los mensajes dejan de ser flores.
--
-- La app arrancó como mensajería con flores 3D: cada mensaje elegía un tipo y
-- una variante, y al abrirlo florecía. Eso quedó atrás — hoy un mensaje es
-- texto y, si querés, un fragmento de canción. Las dos columnas ya no las
-- escribe nadie, y dejarlas obligaría a inventar un valor en cada insert solo
-- para cumplir con un `not null` que no significa nada.
--
-- Se reemplaza primero el trigger, que las nombra: si se soltaran las columnas
-- antes, el próximo UPDATE reventaría al resolver el cuerpo de la función.

create or replace function public.enforce_message_immutability()
returns trigger
language plpgsql
as $$
begin
  if new.id         is distinct from old.id
  or new.pair_id    is distinct from old.pair_id
  or new.sender_id  is distinct from old.sender_id
  or new.text       is distinct from old.text
  or new.song       is distinct from old.song
  or new.created_at is distinct from old.created_at then
    raise exception 'Solo se pueden modificar opened_at y read_at';
  end if;

  -- Un mensaje se abre y se lee una sola vez; y la hora la pone el servidor.
  if new.opened_at is distinct from old.opened_at then
    if old.opened_at is not null then
      raise exception 'opened_at ya estaba fijado';
    end if;
    new.opened_at := now();
  end if;

  if new.read_at is distinct from old.read_at then
    if old.read_at is not null then
      raise exception 'read_at ya estaba fijado';
    end if;
    new.read_at := now();
  end if;

  return new;
end;
$$;

alter table public.messages drop column if exists flower_type;
alter table public.messages drop column if exists flower_variant;
