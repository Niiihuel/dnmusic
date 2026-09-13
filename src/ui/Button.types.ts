export type PrimaryButtonProps = {
  label: string
  onPress: () => void
  disabled?: boolean
  busy?: boolean
}
export type GhostButtonProps = Omit<PrimaryButtonProps, 'busy'>
