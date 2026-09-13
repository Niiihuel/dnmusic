import { useEffect, useState } from 'react'
import { Button, Host, HStack, Image, Label, List, ProgressView, RNHostView, Section, Spacer, Text } from '@expo/ui/swift-ui'
import { accessibilityLabel, font, foregroundStyle, listRowBackground, listStyle, scrollContentBackground } from '@expo/ui/swift-ui/modifiers'
import { usePlaybackTrack } from '../state/playback'
import { usePendientesChats } from '../state/session'
import { listPlaylists, type Playlist } from '../services/playlists'
import { Avatar } from './Avatar'
import type { AppDrawerProps } from './AppDrawer.types'

/** La animación exterior conserva el drawer; su contenido es una lista nativa. */
export function AppDrawer({ name, avatarPath, onProfile, onPlaylists, onChats, onNowPlaying, onNewPlaylist, onOpenPlaylist, onAjustes }: AppDrawerProps) {
  const sonando = usePlaybackTrack()
  const pendientes = usePendientesChats()
  const [listas, setListas] = useState<Playlist[] | null>(null)
  const [error, setError] = useState(false)
  const [intento, setIntento] = useState(0)
  useEffect(() => {
    let vigente = true
    listPlaylists().then(r => { if (vigente) setListas(r) }).catch(() => { if (vigente) setError(true) })
    return () => { vigente = false }
  }, [intento])
  const fila = [listRowBackground('#121212'), foregroundStyle('#FFFFFF')]
  return <Host style={{ flex: 1 }} useViewportSizeMeasurement colorScheme="dark" seedColor="#FFFFFF">
    <List modifiers={[listStyle('insetGrouped'), scrollContentBackground('hidden'), accessibilityLabel('Menú de dnmusic')]}>
      <Section title="dnmusic">
        <Button onPress={onProfile} modifiers={[...fila, accessibilityLabel('Ver tu perfil')]}>
          <HStack spacing={12}>
            <RNHostView matchContents><Avatar name={name} path={avatarPath} size={40} /></RNHostView>
            <Text modifiers={[font({ textStyle: 'headline' })]}>{name}</Text>
            <Spacer /><Image systemName="chevron.right" color="#B3B3B3" size={13} />
          </HStack>
        </Button>
        <Button label="Tus listas" systemImage="music.note.list" onPress={onPlaylists} modifiers={fila} />
        <Button onPress={onChats} modifiers={[...fila, accessibilityLabel(pendientes ? `Conversaciones, ${pendientes} sin ver` : 'Conversaciones')]}>
          <HStack><Label title="Conversaciones" systemImage="bubble.left.and.bubble.right" /><Spacer />
            {pendientes > 0 ? <Text>{String(pendientes)}</Text> : null}
          </HStack>
        </Button>
        {sonando ? <Button label="Lo que suena" systemImage="waveform" onPress={onNowPlaying} modifiers={fila} /> : null}
        <Button label="Configuración" systemImage="gearshape" onPress={onAjustes} modifiers={fila} />
      </Section>
      <Section title="Tus listas">
        <Button label="Nueva lista" systemImage="plus" onPress={onNewPlaylist} modifiers={fila} />
        {error ? <Button label="No se pudieron cargar · Reintentar" onPress={() => { setError(false); setIntento(n => n + 1) }} modifiers={fila} /> : listas === null ? <ProgressView modifiers={fila} /> :
          listas.map(lista => <Button key={lista.id} label={lista.name} systemImage="music.note.list" onPress={() => onOpenPlaylist(lista.id)} modifiers={fila} />)}
        <Button label="Todas tus listas" onPress={onPlaylists} modifiers={fila} />
      </Section>
    </List>
  </Host>
}
