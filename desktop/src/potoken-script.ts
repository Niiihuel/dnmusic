import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** La misma librería instalada en el escritorio, empaquetada para Chromium. */
export function scriptTokens(): string {
  const dist = dirname(dirname(require.resolve('bgutils-js/utils')))
  const archivos = [
    'utils/constants.js', 'utils/EventEmitterLike.js', 'utils/helpers.js',
    'core/BotGuardClient.js', 'core/ChallengeFetcher.js', 'core/WebPoMinter.js',
  ]
  const biblioteca = archivos.map((archivo) => readFileSync(join(dist, archivo), 'utf8')
    .replace(/^import\s[^;]*;\s*$/gm, '')
    .replace(/^export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/gm, '')
    .replace(/^export\s*\{\s*\};?\s*$/gm, '')
    .replace(/^\/\/# sourceMappingURL=.*$/gm, '')).join('\n')
  if (/^\s*(import|export)\b/m.test(biblioteca)) throw new Error('Formato de bgutils-js no compatible')

  return `(function () {
    ${biblioteca}
    const key = 'O43z0dpjhgX20SCx4KAo';
    let cached = null;
    let pending = null;
    async function createMinter() {
      const challenge = await getChallenge({ requestKey: key, fetchFunction: fetch });
      const code = challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
      if (!code) throw new Error('BotGuard no devolvió intérprete');
      const script = document.createElement('script');
      script.textContent = code;
      document.head.appendChild(script);
      script.remove();
      const bg = await BotGuardClient.create({
        program: challenge.program, globalName: challenge.globalName, globalObject: window
      });
      const signals = [];
      const snapshot = await bg.snapshot({ webPoSignalOutput: signals });
      const res = await fetch(buildURL('GenerateIT'), {
        method: 'POST', headers: getHeaders(), body: JSON.stringify([key, snapshot])
      });
      if (!res.ok) throw new Error('GenerateIT respondió ' + res.status);
      const [integrityToken, ttl, , fallback] = await res.json();
      if (!integrityToken) throw new Error('No se obtuvo integrity token');
      if (fallback) throw new Error('YouTube no pudo verificar el navegador (BotGuard)');
      const minter = await WebPoMinter.create({ integrityToken }, signals);
      const lifetime = Number.isFinite(ttl) && ttl > 0 ? ttl * 1000 : 43200000;
      cached = { minter, expires: Date.now() + Math.max(0, lifetime - Math.min(300000, lifetime / 10)) };
      return minter;
    }
    window.__dnmusicMint = async function (binding) {
      if (cached && Date.now() < cached.expires) return cached.minter.mintAsWebsafeString(binding);
      if (!pending) pending = createMinter().finally(() => { pending = null; });
      return (await pending).mintAsWebsafeString(binding);
    };
    return true;
  })()`
}
