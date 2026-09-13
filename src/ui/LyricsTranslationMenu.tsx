import { LYRIC_LANGS, type LyricLang } from '../services/music'
import { Popover } from './Popover'
import { ICON_COLOR, IconLanguages } from './icons'

export type LyricsTranslationMenuProps = {
  value: LyricLang
  onChange: (value: LyricLang) => void
  compact?: boolean
}

export function LyricsTranslationMenu({ value, onChange, compact = false }: LyricsTranslationMenuProps) {
  return <Popover value={value} onChange={onChange}
    options={LYRIC_LANGS.map(({ value, label }) => ({ value, label }))}
    display={compact ? '' : LYRIC_LANGS.find((lang) => lang.value === value)?.short || 'Traducir'}
    accessibilityLabel="Traducir la letra"
    icon={<IconLanguages size={18} color={value === 'off' ? ICON_COLOR.muted : ICON_COLOR.foreground} />} />
}
