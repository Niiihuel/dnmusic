/*
 * El tercer tamaño del mosaico: grande.
 *
 * Con dos tamaños el mosaico compone solo, pero no deja destacar: no hay forma
 * de decir «esta imagen es LA imagen». El modelo es el de los widgets de iOS —
 * chico (1×1), mediano (2×1), grande (2×2)— que es también el de las piezas de
 * Airbuds: tres tamaños cerrados que siempre componen, en vez de tamaños
 * libres que piden trabajar cada perfil para que cierre.
 *
 * En la columna `ancho`: `mitad` es el chico, `entero` el mediano y `grande`
 * el 2×2 — ocupa la fila entera y el doble de presencia vertical. La fila y el
 * apareado los sigue derivando el cliente al dibujar; acá solo se acepta el
 * valor nuevo.
 */
alter table public.profile_showcases
  drop constraint if exists profile_showcases_ancho_check;
alter table public.profile_showcases
  add constraint profile_showcases_ancho_check
  check (ancho in ('entero', 'mitad', 'grande'));
