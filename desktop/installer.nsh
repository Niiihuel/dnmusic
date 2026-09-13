# Lo que Windows muestra en el globito del acceso directo.
#
# electron-builder le pasa a `CreateShortCut` —el del escritorio y el del menú
# de inicio— la descripción del package.json como comentario del .lnk, y esa
# descripción es texto del repositorio: «dnmusic para Windows y Linux». Aparecía
# en un globito amarillo al pasar el mouse por el ícono, contándole a quien ya
# tiene la app instalada en qué sistemas operativos existe.
#
# Se vacía acá y no en el package.json porque ese mismo texto es también la
# descripción del propio instalador —lo que Windows muestra en las propiedades
# del .exe y en el diálogo de elevación—, y ahí sí tiene sentido que diga algo.
#
# El `!ifdef` no es decorativo: el instalador se compila con `-WX`, así que
# cualquier aviso de makensis corta el build, y `!undef` sobre algo que no está
# definido es un aviso.
!ifdef APP_DESCRIPTION
  !undef APP_DESCRIPTION
!endif
!define APP_DESCRIPTION ""
