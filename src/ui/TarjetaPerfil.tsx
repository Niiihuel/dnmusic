import { useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { Profile } from '../services/profile'
import { esDiscord } from '../services/discordCatalogo'
import { Avatar } from './Avatar'
import { Marco } from './Marco'
import { PlacaDeNombre } from './Placas'
import { FondoPerfil, Identidad } from './PerfilPublico'
import { EfectoPerfil } from './DecoracionImagen'
import { DiscordEfecto, MarcoContenidoDiscord } from './DiscordCosmeticos'
import { FuentePerfil, TextoPerfil as Text } from './FuentePerfil'

/** Preview Tarjeta: conserva el formato vertical original de los cosméticos. */
export function TarjetaPerfil({ perfil, animado = true }: { perfil: Profile; animado?: boolean }) {
  const [alto, setAlto] = useState(340)
  const nombre = perfil.displayName?.trim() || perfil.username
  return (
    <FuentePerfil fuente={perfil.fuente}>
      <MarcoContenidoDiscord id={perfil.marcoPerfil} animado={animado}>
        <View
          testID="tarjeta-perfil"
          onLayout={(e) => setAlto(e.nativeEvent.layout.height)}
          style={{ borderRadius: 16, backgroundColor: '#181818', overflow: 'hidden' }}
        >
          <View style={{ height: 126, overflow: 'hidden', backgroundColor: '#242424' }}>
            <FondoPerfil bannerPath={perfil.bannerPath} encuadre={perfil.bannerEncuadre} animado={animado} />
          </View>
          <View style={{ paddingHorizontal: 22, paddingBottom: 24, marginTop: -42 }}>
            <View style={{ width: 92, height: 92, padding: 4, borderRadius: 50, backgroundColor: '#181818', marginBottom: 16 }}>
              <Avatar name={nombre} path={perfil.avatarPath} encuadre={perfil.avatarEncuadre} size={84} />
              <View pointerEvents="none" style={{ position: 'absolute', top: 4, left: 4 }}>
                <Marco marco={perfil.marco} size={84} animado={animado} />
              </View>
            </View>
            <PlacaDeNombre id={perfil.placa} animado={animado}>
              <Text style={{ color: '#fff', fontSize: 23, fontWeight: '700' }} numberOfLines={1}>{nombre}</Text>
              <Text style={{ color: '#ccc', fontSize: 13, marginTop: 4 }} numberOfLines={1}>@{perfil.username}</Text>
            </PlacaDeNombre>
            {perfil.bio ? <Text style={{ color: '#e4e4e4', fontSize: 14, lineHeight: 21, marginTop: 18 }}>{perfil.bio}</Text> : null}
          </View>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <EfectoPerfil id={perfil.efecto} alto={alto} animado={animado} />
          </View>
        </View>
      </MarcoContenidoDiscord>
    </FuentePerfil>
  )
}

/** La identidad mantiene la banda amplia; nunca sustituye el perfil por una tarjeta. */
export function CabeceraPerfil({ perfil, banda = false, centrado = false, accion, animado = true }: {
  perfil: Profile; banda?: boolean; centrado?: boolean; accion?: ReactNode; animado?: boolean
}) {
  const [ancho, setAncho] = useState(0)
  const horizontal = banda && ancho >= 720
  return <FuentePerfil fuente={perfil.fuente}>
    <View onLayout={e => setAncho(e.nativeEvent.layout.width)} style={{ width: '100%', gap: 20 }}>
      <Identidad nombre={perfil.displayName?.trim() || perfil.username} usuario={perfil.username}
        avatarPath={perfil.avatarPath} encuadre={perfil.avatarEncuadre} marco={perfil.marco} placa={perfil.placa}
        bio={perfil.bio ?? ''} banda={horizontal} centrado={centrado || (banda && !horizontal)}
        accion={horizontal ? accion : undefined} animado={animado} />
      {!horizontal && accion ? <View style={{ alignSelf: centrado || banda ? 'center' : 'flex-start', maxWidth: '100%' }}>{accion}</View> : null}
    </View>
  </FuentePerfil>
}

/** Fondo continuo del panel: hermano del ScrollView, nunca del contenido largo. */
export function FondoEstiloPerfil({ perfil, animado = true }: { perfil?: Profile | null; animado?: boolean }) {
  const [alto, setAlto] = useState(0)
  return <View testID="fondo-estilo-perfil" pointerEvents="none" accessible={false}
    onLayout={e => setAlto(e.nativeEvent.layout.height)} style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
    <FondoPerfil bannerPath={perfil?.bannerPath ?? null} encuadre={perfil?.bannerEncuadre}
      efecto={esDiscord(perfil?.efecto) ? null : perfil?.efecto} animado={animado} />
    {esDiscord(perfil?.efecto) && alto > 0 ? <>
      <DiscordEfecto id={perfil?.efecto} alto={alto} animado={animado} ajuste="cover" />
      <LinearGradient colors={['rgba(18,18,18,0.22)', 'rgba(18,18,18,0.08)', 'rgba(18,18,18,0.35)']}
        locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
    </> : null}
  </View>
}

/** Sólo distribuye el contenido; fondo y efectos pertenecen al panel exterior. */
export function SuperficiePerfil({ perfil, children, anchoContenido, minHeight = 360 }: {
  perfil: Profile; children: ReactNode; anchoContenido?: number; minHeight?: number
}) {
  return <FuentePerfil fuente={perfil.fuente}>
    <View testID="superficie-perfil" style={{ width: '100%', minHeight }}>
      <View testID="contenido-perfil" style={{ width: '100%', maxWidth: anchoContenido, alignSelf: 'center', gap: 28 }}>{children}</View>
    </View>
  </FuentePerfil>
}
