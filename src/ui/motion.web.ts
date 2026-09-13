/** Movimiento compartido en PC: superficies, confirmaciones y foco. */
export const SPRING_LAYOUT = { type: 'spring', stiffness: 360, damping: 32, mass: 0.6 } as const
export const SPRING_SWAP = { type: 'spring', stiffness: 460, damping: 30, mass: 0.55 } as const

/** beUI morphing-modal: panel compacto con resorte amortiguado. */
export const SPRING_PANEL = { type: 'spring', stiffness: 420, damping: 40, mass: 0.5 } as const
export const EASE_OUT = [0.16, 1, 0.3, 1] as const
