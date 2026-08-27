/**
 * En la web no hay motor de a bordo, y este archivo es cómo se dice eso sin
 * arrastrar nada al bundle.
 *
 * Metro resuelve `.web.tsx` antes que `.tsx`. Sin esto entran igual —Metro
 * sigue los imports leyendo el código— los 19 KB de bgutils aplanado y
 * `react-native-webview`, para un motor que la web no puede usar: la app corre
 * *dentro* de un navegador, y CORS es justamente lo que impide hablar con
 * InnerTube desde una página. Ver `resolutorABordo.web.ts`, que hace lo mismo
 * con youtubei.js por el mismo motivo.
 */

export function hayMotor(): boolean {
  return false
}

export function acunar(): Promise<string> {
  return Promise.reject(new Error('El navegador no tiene motor de a bordo.'))
}

export function evaluar(): Promise<Record<string, unknown>> {
  return Promise.reject(new Error('El navegador no tiene motor de a bordo.'))
}

export function MotorWebView() {
  return null
}
