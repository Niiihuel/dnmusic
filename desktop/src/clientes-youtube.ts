/** Solo clientes web: Chromium no produce atestaciones de Android o iOS. */
export const CLIENTES_RESOLVE = ['YTMUSIC', 'MWEB', 'TV', 'TV_SIMPLY', 'WEB_EMBEDDED'] as const
export type ClienteResolve = (typeof CLIENTES_RESOLVE)[number]
