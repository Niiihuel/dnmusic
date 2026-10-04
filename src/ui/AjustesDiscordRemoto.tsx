import { cancelarDiscordRemoto, configurarDiscordRemoto, useDiscordRemoto } from '../state/discordRemoto'
import { FilaAccion, FilaDato, GrupoAjustes } from './Ajustes'
import { DiscordIcon } from './DiscordIcon'
import { ESTADOS_DISCORD } from './discordEtiquetas'

export function AjustesDiscordRemoto() {
  const datos = useDiscordRemoto()
  return <ContenidoDiscordRemoto {...datos} onCambiar={(deviceId, enabled) => void configurarDiscordRemoto(deviceId, enabled)} onCancelar={cancelarDiscordRemoto} />
}

export function ContenidoDiscordRemoto({ dispositivos, conexion, pendiente, error, onCambiar, onCancelar }: ReturnType<typeof useDiscordRemoto> & {
  onCambiar: (deviceId: string, enabled: boolean) => void
  onCancelar: () => void
}) {
  const disponible = conexion === 'conectado'
  return <>
    <GrupoAjustes titulo="Discord · mediante tu PC"
      pie="Conectá Discord en una computadora con tu misma cuenta de DMusic. Podés seguir escuchando en el teléfono: esa PC muestra tu música en Discord mientras ambas apps están abiertas."
      error={error}>
      <FilaDato rotulo="Conexión con tus dispositivos" valor={conexion === 'conectando' ? 'Conectando…' : disponible ? 'Disponible' : 'Sin conexión'} ultima />
    </GrupoAjustes>
    {disponible && dispositivos.length ? dispositivos.map(({ deviceId, nombre, estado }) => {
      const ocupado = pendiente === deviceId
      const bloqueado = pendiente !== null
      const conectado = estado.status === 'ready' || estado.status === 'published'
      const conectando = estado.status === 'connecting'
      return <GrupoAjustes key={deviceId} titulo={nombre} error={estado.error}>
        <FilaDato rotulo="Discord" valor={ESTADOS_DISCORD[estado.status]} />
        {!conectado ? <FilaAccion
          rotulo={ocupado ? 'Aplicando cambio…' : conectando ? 'Conectando con Discord…' : estado.enabled ? 'Reintentar conexión' : 'Conectar Discord'}
          icono={<DiscordIcon size={20} />} iconoPlano destacada
          busy={ocupado || conectando} disabled={bloqueado} onPress={() => onCambiar(deviceId, true)} ultima={!estado.enabled && !ocupado} /> : null}
        {ocupado ? <FilaAccion rotulo="Cancelar solicitud" onPress={onCancelar} ultima /> : estado.enabled ? <FilaAccion
          rotulo={conectando ? 'Cancelar conexión' : 'Desconectar Discord'}
          icono={<DiscordIcon size={20} />} iconoPlano disabled={bloqueado} onPress={() => onCambiar(deviceId, false)} ultima /> : null}
      </GrupoAjustes>
    }) : <GrupoAjustes titulo="Prepará tu computadora"
      pie="Si no aparece, actualizá DMusic en la PC. La conexión directa a Discord desde el teléfono todavía no está disponible.">
      <FilaDato rotulo="1. DMusic" valor="Abierto con tu misma cuenta" />
      <FilaDato rotulo="2. Discord" valor="Abierto y con sesión iniciada" />
      <FilaDato rotulo="3. Conectar" valor="Elegí la PC cuando aparezca" ultima />
    </GrupoAjustes>}
    <GrupoAjustes pie="Conectar usa la cuenta abierta en Discord en esa PC. Solo compartís después de elegir Conectar. Al pausar se retira la canción; al desconectar o cerrar sesión se deja de compartir.">
      <FilaDato rotulo="Cómo se comparte" valor="A través de tu computadora" ultima />
    </GrupoAjustes>
  </>
}
