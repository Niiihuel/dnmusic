import { useLayoutEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Box, Column, DropdownMenu, DropdownMenuItem, HorizontalDivider, IconButton, Text } from '@expo/ui/jetpack-compose'
import { size, width } from '@expo/ui/jetpack-compose/modifiers'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { AndroidHost, androidAccessibility } from './AndroidHost'
import { AndroidIcon } from './AndroidIcon'
import type { MenuNativoProps } from './MenuNativo.types'
import type { MenuItem } from './Menu'
import { llevaCorte, repartirMenu } from './menuReparto'
import { copiarAlPortapapeles } from '../lib/portapapeles'
import { avisar } from '../state/aviso'

export const HAY_MENU_NATIVO = true

/** Native popup owns focus, back dismissal and scroll; rows keep their RN layout. */
export function MenuNativo({ items, label = 'Opciones', symbol = 'ellipsis', size: iconSize = 20,
  children, longPress = false, fullWidth = false, disabled = false, preview, onPreviewPress }: MenuNativoProps) {
  const [stack, setStack] = useState<MenuItem[][]>([])
  const active = useRef(false)
  if (disabled && stack.length) setStack([])
  useLayoutEffect(() => {
    active.current = !disabled && stack.length > 0
    return () => { active.current = false }
  }, [disabled, stack])
  const open = () => { if (disabled || !items.length) return; setStack([items]) }
  const close = () => { active.current = false; setStack([]) }
  const choose = (item: MenuItem) => {
    if (disabled || item.disabled || !active.current) return
    if (item.items?.length) { setStack(previous => [...previous, item.items!]); return }
    close()
    if (item.onPress) item.onPress()
    else if (item.copyText !== undefined) void copiarAlPortapapeles(item.copyText).then(ok => {
      avisar(ok ? 'Copiado' : 'No se pudo copiar. Podés volver a intentarlo.', !ok)
    })
  }
  const current = stack.at(-1) ?? []
  const { rapidas, lista } = repartirMenu(current, true)
  const entries = [...rapidas, ...lista]
  const gesture = Gesture.LongPress().enabled(longPress && !disabled && items.length > 0)
    .minDuration(500).maxDistance(10).shouldCancelWhenOutside(true).runOnJS(true).onStart(() => { open() })
  return <View collapsable={false} style={fullWidth ? { width: '100%' } : undefined}>
    {longPress ? <GestureDetector gesture={gesture}><View collapsable={false}>{children}</View></GestureDetector> :
      children ? <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={open}>
        <View pointerEvents="none">{children}</View></Pressable> : null}
    <AndroidHost pointerEvents={children || longPress ? 'box-none' : 'auto'}
      style={children || longPress ? [StyleSheet.absoluteFill, { width: 48, height: 48 }] : { width: 48, height: 48 }}>
      <DropdownMenu expanded={!disabled && stack.length > 0} onDismissRequest={close} color="#242426">
        <DropdownMenu.Trigger>{children || longPress ? <Box modifiers={[size(1, 1)]} /> :
          <IconButton enabled={!disabled && items.length > 0} onClick={open}
            modifiers={[size(48, 48), androidAccessibility(label)]}>
            <AndroidIcon symbol={symbol} size={iconSize} color="#B3B3B3" />
          </IconButton>}
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          {stack.length > 1 ? <DropdownMenuItem enabled={!disabled} onClick={() => { if (!disabled && active.current) setStack(previous => previous.slice(0, -1)) }}>
            <DropdownMenuItem.LeadingIcon><AndroidIcon symbol="chevron.left" /></DropdownMenuItem.LeadingIcon>
            <DropdownMenuItem.Text><Text color="#FFFFFF">Volver</Text></DropdownMenuItem.Text>
          </DropdownMenuItem> : preview ? <DropdownMenuItem enabled={!disabled && !!onPreviewPress} onClick={() => { if (disabled || !active.current || !onPreviewPress) return; close(); onPreviewPress() }}>
            <DropdownMenuItem.Text><Column modifiers={[width(240)]}>
              <Text color="#FFFFFF" style={{ fontWeight: '600' }}>{preview.title}</Text>
              {preview.subtitle ? <Text color="#B3B3B3">{preview.subtitle}</Text> : null}
            </Column></DropdownMenuItem.Text>
          </DropdownMenuItem> : null}
          {entries.map((item, index) => <Column key={`${index}:${item.label}`}>
            {llevaCorte(entries, index) ? <HorizontalDivider color="#414145" /> : null}
            <DropdownMenuItem enabled={!disabled && !item.disabled} onClick={() => choose(item)}
              elementColors={{ textColor: item.destructive ? '#FF6961' : '#FFFFFF', disabledTextColor: '#777777' }}
              modifiers={[androidAccessibility(item.subtitle ? `${item.label}, ${item.subtitle}` : item.label, item.selected ? 'Seleccionado' : undefined)]}>
              {item.sfSymbol ? <DropdownMenuItem.LeadingIcon><AndroidIcon symbol={item.sfSymbol} color={item.destructive ? '#FF6961' : '#FFFFFF'} /></DropdownMenuItem.LeadingIcon> : null}
              <DropdownMenuItem.Text><Column modifiers={[width(220)]}>
                <Text color={item.disabled ? '#777777' : item.destructive ? '#FF6961' : '#FFFFFF'}>{item.label}</Text>
                {item.subtitle ? <Text color="#B3B3B3" style={{ fontSize: 12 }}>{item.subtitle}</Text> : null}
              </Column></DropdownMenuItem.Text>
              {item.items?.length || item.selected ? <DropdownMenuItem.TrailingIcon><AndroidIcon symbol={item.items?.length ? 'chevron.right' : 'checkmark'} size={18} /></DropdownMenuItem.TrailingIcon> : null}
            </DropdownMenuItem>
          </Column>)}
        </DropdownMenu.Items>
      </DropdownMenu>
    </AndroidHost>
  </View>
}
