/** El hijo pide tokens al Chromium aislado del proceso principal. */
let proveedor: ((binding: string) => Promise<string>) | null = null

export function configurarProveedorTokens(acunar: (binding: string) => Promise<string>) {
  proveedor = acunar
}

async function acunar(binding: string): Promise<string> {
  if (!proveedor) throw new Error('El proveedor de tokens del navegador no está configurado')
  return proveedor(binding)
}

export const mintSessionToken = acunar
export const mintVideoToken = acunar
