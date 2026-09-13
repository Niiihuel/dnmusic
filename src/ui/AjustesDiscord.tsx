import { configurarDiscord, DISCORD_APPLICATION_ID, useDiscord, type EstadoDiscord } from '../state/discord'
import { FilaAccion, FilaDato, GrupoAjustes } from './Ajustes'
import { DiscordIcon } from './DiscordIcon'

const ESTADOS: Record<EstadoDiscord['status'], string> = {
  disabled: 'No conectado', unconfigured: 'Conexión sin configurar',
  disconnected: 'Discord no está disponible', connecting: 'Buscando Discord…',
  ready: 'Conectado · esperando música', published: 'Mostrando tu música', error: 'No se pudo conectar',
}
export function AjustesDiscord() {
  const { estado, cargado, guardando, error } = useDiscord()
  return <ContenidoDiscord estado={estado} cargado={cargado} guardando={guardando} error={error}
    onCambiar={enabled => void configurarDiscord({ enabled, applicationId: DISCORD_APPLICATION_ID })} />
}

export function ContenidoDiscord({ estado, cargado, guardando, error, onCambiar }: ReturnType<typeof useDiscord> & { onCambiar: (enabled: boolean) => void }) {
  const conectando = estado.status === 'connecting'
  const conectado = estado.status === 'ready' || estado.status === 'published'
  return <>
    <GrupoAjustes titulo="Conexión con Discord"
      pie="Abrí la app de Discord e iniciá sesión en esta computadora. Al conectar, compartís la canción que escuchás en tu actividad de Discord. DMusic se conecta a esa sesión automáticamente."
      error={error || estado.error}>
      <FilaDato rotulo="Estado" valor={cargado ? ESTADOS[estado.status] : 'Cargando…'} />
      {!conectado ? <FilaAccion rotulo={conectando ? 'Conectando con Discord…' : estado.enabled ? 'Reintentar conexión' : 'Conectar Discord'}
        icono={<DiscordIcon size={20} />} iconoPlano destacada
        busy={guardando || conectando} disabled={!cargado} onPress={() => onCambiar(true)} ultima={!estado.enabled} /> : null}
      {estado.enabled ? <FilaAccion rotulo={conectando ? 'Cancelar conexión' : 'Desconectar Discord'}
        disabled={!cargado || guardando} onPress={() => onCambiar(false)} ultima /> : null}
    </GrupoAjustes>
    <GrupoAjustes titulo="Tu música en Discord"
      pie="Podés escuchar en esta PC o en tu iPhone con la misma cuenta de DMusic. Mantené DMusic y Discord abiertos en la PC. Al pausar se retira la canción; al desconectar o cerrar sesión se deja de compartir. Si la actividad no aparece en tu perfil, revisá la privacidad de actividad en Discord.">
      <FilaDato rotulo="Compartir música" valor={estado.enabled ? 'Activado' : 'Desactivado'} ultima />
    </GrupoAjustes>
  </>
}
