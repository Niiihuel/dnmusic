import { readFileSync } from 'node:fs'
import ts from 'typescript'

const exports = {}
const source = ts.transpileModule(readFileSync('src/ui/androidDesign.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
new Function('exports', 'require', source)(exports, name => {
  if (name === './android-design.json') return JSON.parse(readFileSync('src/ui/android-design.json', 'utf8'))
  throw Error(name)
})
export default exports
