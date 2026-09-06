/*
 * Decoraciones propias: el marco y el efecto pueden ser un archivo tuyo.
 *
 * El id de una decoración propia es `imagen:<ruta en showcases>` —la carpeta
 * es tu uuid más un nombre de archivo— y no entra en los 40 caracteres que
 * el marco tenía por nombre corto. El tope sube a 200 en las dos columnas:
 * sigue siendo un nombre, no un texto, y una ruta de Storage no pasa de ahí.
 */
alter table public.profiles drop constraint if exists profiles_marco_check;
alter table public.profiles
  add constraint profiles_marco_check
  check (marco is null or length(marco) between 1 and 200);

alter table public.profiles drop constraint if exists profiles_efecto_check;
alter table public.profiles
  add constraint profiles_efecto_check
  check (efecto is null or length(efecto) between 1 and 200);
