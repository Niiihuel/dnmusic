import { useRouter } from 'expo-router'
import { PanelDispositivos } from './SelectorDispositivos.ios'
import { volver } from '../lib/volver'

export function PantallaDispositivos() {
  const router = useRouter()
  return <PanelDispositivos onCerrar={() => volver(router, '/')} />
}
