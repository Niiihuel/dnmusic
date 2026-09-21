import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('el reproductor Android queda rectangular, de ancho completo y sin botones flotantes laterales', () => {
  const shell = readFileSync('src/ui/Cascara.tsx', 'utf8')
  const player = readFileSync('src/ui/NowPlayingBar.tsx', 'utf8')
  assert.match(shell, /const androidRecto = Platform\.OS === 'android'/)
  assert.match(shell, /androidRecto \? 0 : HAY_VIDRIO/)
  assert.match(shell, /androidRecto \? null : <Animated\.View/)
  assert.match(player, /radius=\{androidRecto \? 0/)
  assert.match(player, /androidRecto \? \{ width: '100%'/)
  assert.match(player, /androidRecto \? 'left-0 right-0'/)
})

test('el Snackbar queda pegado al piso multimedia y las tablas usan Material nativo', () => {
  const aviso = readFileSync('src/ui/Aviso.android.tsx', 'utf8')
  const ajustes = readFileSync('src/ui/Ajustes.android.tsx', 'utf8')
  assert.match(aviso, /usePiso\(4\)/)
  assert.match(aviso, /left: 8, right: 8/)
  assert.match(ajustes, /ListItem, RNHostView, Row, Surface, Switch, Text/)
  assert.match(ajustes, /<ListItem\.HeadlineContent>/)
  assert.match(ajustes, /<Switch value=\{activo\}/)
})
