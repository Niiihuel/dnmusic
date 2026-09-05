import { runInNewContext } from 'node:vm'

/** El timeout cubre tanto la creación como la invocación de la función. */
export function evaluarPlayer(
  data: { output: string }, env: Record<string, unknown>, timeout = 10_000,
): unknown {
  const nombres = Object.keys(env)
  return runInNewContext(
    `(function(${nombres.join(',')}) {\n${data.output}\n})(...__argumentos)`,
    { __argumentos: nombres.map((nombre) => env[nombre]) },
    { timeout },
  )
}
