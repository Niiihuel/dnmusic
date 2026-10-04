import { Button, Host, Label, Menu } from '@expo/ui/swift-ui'
import { accessibilityLabel, buttonStyle, frame, labelStyle, tint } from '@expo/ui/swift-ui/modifiers'
import { LYRIC_LANGS } from '../services/music'
import type { LyricsTranslationMenuProps } from './LyricsTranslationMenu'

/** Un menú de idiomas nativo que mantiene su área de toque fuera de la letra. */
export function LyricsTranslationMenu({ value, onChange, compact = false }: LyricsTranslationMenuProps) {
  return <Host ignoreSafeArea="all" matchContents={false} colorScheme="dark"
    style={{ width: compact ? 44 : 120, height: 44 }}>
    <Menu label={<Label title="Traducir" systemImage="character.bubble" />}
      modifiers={[labelStyle(compact ? 'iconOnly' : 'titleAndIcon'), buttonStyle('borderless'),
        frame({ width: compact ? 44 : 120, height: 44 }), tint(value === 'off' ? '#B3B3B3' : '#FFFFFF'), accessibilityLabel('Traducir la letra')]}>
      {LYRIC_LANGS.map((language) => <Button key={language.value} label={language.label}
        systemImage={language.value === value ? 'checkmark' : undefined}
        onPress={() => onChange(language.value)} />)}
    </Menu>
  </Host>
}
