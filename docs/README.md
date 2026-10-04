# Documentación de dnmusic

El [README principal](../README.md) cubre instalación y validación. Las guías
de mantenimiento describen el código del repositorio; los informes fechados
conservan diagnósticos y evidencia de una revisión concreta, no el estado de
una compilación posterior.

## Desarrollo y publicación

- [Repositorio, Railway, migraciones y secretos](REPOSITORIO.md)
- [Diseño compartido](DESIGN.md) y [diseño Android](ANDROID-DESIGN.md)
- [iOS con EAS Cloud](BUILD-IOS.md) y [GitHub Actions](BUILD-IOS-GITHUB.md)
- [Android local](ANDROID.md) y [GitHub Actions](BUILD-ANDROID-GITHUB.md)
- [Escritorio y releases Windows/Linux](ESCRITORIO.md)
- [Políticas remotas de actualización](ACTUALIZACIONES-REMOTAS.md)
- [Google y aprobación de acceso](ACCESO-GOOGLE.md),
  [vinculación de cuentas](VINCULAR-GOOGLE.md)
- [Módulos nativos](../modules/README.md), [parches de audio](../patches/README.md)
  y [avisos de terceros](licenses/)

## Funciones y contratos

- [Música y fragmentos](MUSICA.md), [búsqueda y gustos](BUSQUEDA-Y-GUSTOS.md)
- [Componentes de audio](AUDIO_COMPONENTS.md),
  [reproducción continua](REPRODUCCION-CONTINUA.md),
  [resolver del teléfono](MOTOR-TELEFONO.md)
- [Listas y colaboración](LISTAS.md), [Jam](JAM.md),
  [escucha entre dispositivos](ESCUCHA.md), [salida y controles](ESCUCHAR-EN.md)
- [Descargas](DESCARGAS.md), [presupuesto de Storage](STORAGE-BUDGET.md)
- [Compartir y card musical](COMPARTIR.md), [previews externos](previews-enlaces.md),
  [compartir después de una captura](COMPARTIR-CAPTURAS.md)
- [Mensajes](CHAT-MENSAJES.md), [perfiles](PERFIL.md), [ajustes](AJUSTES.md)
- [API de actividad](API-ESCUCHA.md), [Discord en PC](PRESENCIA-DISCORD.md),
  [Discord móvil](DISCORD-MOVIL.md), [catálogo Discord](catalogo-discord.md)
- [Marca y recursos](MARCA.md)

## Decisiones, planes y diagnósticos

Estos documentos incluyen hipótesis, propuestas o resultados fechados.
Consultar las guías anteriores para setup y los workflows para los checks actuales.

- [Plan de ecualizador y mixes](PLAN_ECUALIZADOR_Y_MIXES.md)
- [Auditoría de ecualizador e interacción móvil](ECUALIZADOR-Y-AUDITORIA-MOVIL.md)
- [Migración de controles iOS](MIGRACION-IOS.md),
  [ajustes nativos posteriores](ios-native-polish.md)
- [Diagnóstico de perfil iOS](diagnostico-perfil-ios.md),
  [video de perfil iOS](diagnostico-video-perfil-ios.md)
- [Diagnóstico de YouTube](YOUTUBE-DIAGNOSTICO.md)
- [Decisión inicial sobre fragmentos, anterior al motor actual](archivo/fragmentos-iniciales.md)

`discord-presencia.md` conserva la primera integración y apunta a la guía de
[presencia vigente](PRESENCIA-DISCORD.md). Las rutas y nombres de compatibilidad
(slug EAS, marcadores HTML, esquemas y dominios heredados) no deben renombrarse
sin revisar su migración.
