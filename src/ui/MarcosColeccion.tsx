import { useId } from 'react'
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Stop } from 'react-native-svg'

export const COLECCION_MARCOS = [
  { id: 'eclipse', nombre: 'Eclipse', familia: 'cielo' },
  { id: 'astral', nombre: 'Astral', familia: 'cielo' },
  { id: 'zarza', nombre: 'Zarza de plata', familia: 'naturaleza' },
  { id: 'jardin', nombre: 'Jardín nocturno', familia: 'naturaleza' },
  { id: 'cromo', nombre: 'Cromo', familia: 'clasicos' },
  { id: 'reliquia', nombre: 'Reliquia', familia: 'realeza' },
] as const

/** Ornamentos originales: metal en capas, ramas y joyería, con el centro libre. */
export function MarcoColeccion({ id }: { id: string }) {
  const metal = useId().replace(/:/g, '')
  const botanico = id === 'zarza' || id === 'jardin'
  const oro = id === 'reliquia'
  const luna = id === 'eclipse' || id === 'astral'
  const luz = oro ? '#f0dfb5' : id === 'jardin' ? '#d4e3d0' : luna ? '#deddf5' : '#e4e8ed'
  const medio = oro ? '#9d8050' : id === 'jardin' ? '#647d68' : luna ? '#8889a7' : '#919ca9'
  const oscuro = oro ? '#40382a' : '#333d49'
  const pintura = `url(#${metal})`
  return (
    <Svg width="100%" height="100%" viewBox="0 0 160 160" fill="none">
      <Defs>
        <LinearGradient id={metal} x1="15%" y1="0%" x2="90%" y2="100%">
          <Stop offset="0" stopColor={oscuro} />
          <Stop offset=".22" stopColor={luz} />
          <Stop offset=".42" stopColor={medio} />
          <Stop offset=".55" stopColor={luz} />
          <Stop offset=".72" stopColor={oscuro} />
          <Stop offset="1" stopColor={medio} />
        </LinearGradient>
      </Defs>
      <Circle cx="80" cy="80" r="62" stroke={oscuro} strokeWidth="4" />
      <Circle cx="80" cy="80" r="62" stroke={pintura} strokeWidth="2" />
      <Circle cx="80" cy="80" r="66" stroke={medio} strokeWidth=".6" opacity=".5" />
      {botanico ? (
        <>
          {[false, true].map((m) => (
            <G key={String(m)} transform={m ? 'translate(160 0) scale(-1 1)' : undefined}>
              <Path
                d="M76 145 C40 139 15 119 16 80 C16 50 31 28 50 18 M18 82 C6 64 9 43 23 34 M22 107 C9 99 5 87 7 73 M31 128 C17 126 9 119 8 110"
                stroke={pintura}
                strokeWidth="2"
                strokeLinecap="round"
              />
              {[0, 1, 2, 3, 4].map((i) => (
                <G
                  key={i}
                  transform={`translate(${19 + i * i * 1.65} ${102 - i * 17}) rotate(${-30 + i * 12})`}
                >
                  <Path
                    d="M0 0 C-17 -3 -18 -15 -15 -21 C-3 -16 2 -8 0 0Z"
                    fill={pintura}
                    stroke={luz}
                    strokeWidth=".35"
                  />
                  <Path d="M-1 -1 L-12 -16" stroke={oscuro} strokeWidth=".65" />
                  <Path d="M1 0 L10 -13 L7 -1" fill={pintura} />
                </G>
              ))}
              {id === 'jardin' ? (
                [0, 1, 2].map((i) => (
                  <G key={i} transform={`translate(${23 + i * 8} ${57 + i * 30})`}>
                    {[0, 60, 120].map((r) => (
                      <Ellipse
                        key={r}
                        rx="2.5"
                        ry="7"
                        fill={luz}
                        transform={`rotate(${r})`}
                        opacity=".9"
                      />
                    ))}
                    <Circle r="1.6" fill="#b5a785" />
                  </G>
                ))
              ) : (
                <Path
                  d="M40 25 L37 9 L46 20 M17 58 L3 50 L14 68 M34 127 L22 143 L39 134"
                  fill={pintura}
                />
              )}
            </G>
          ))}
        </>
      ) : luna ? (
        <>
          <Path
            d="M42 21 C5 40 4 101 34 127 C20 93 18 52 42 21Z"
            fill={pintura}
            stroke={luz}
            strokeWidth=".6"
          />
          <Path
            d="M121 23 C153 50 151 101 126 124"
            stroke={pintura}
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          {[
            [-1, 0],
            [1, 0],
          ].map(([side], i) => (
            <G key={i} transform={`translate(${80 + side * 44} 132)`}>
              <Path d="M0 -10 L5 0 L0 12 L-5 0Z" fill={pintura} stroke={luz} strokeWidth=".5" />
              <Path d="M0 -9 V10" stroke={luz} strokeWidth=".4" />
            </G>
          ))}
          <Path
            d="M80 2 L84 12 L94 16 L84 20 L80 30 L76 20 L66 16 L76 12Z"
            fill={pintura}
            stroke={luz}
            strokeWidth=".6"
          />
          {id === 'astral' ? (
            <>
              <Ellipse
                cx="80"
                cy="80"
                rx="74"
                ry="24"
                transform="rotate(-35 80 80)"
                stroke={medio}
                strokeWidth="1"
                strokeDasharray="120 220"
              />
              <Circle cx="141" cy="36" r="3" fill={luz} />
              <Path d="M13 125 h10 m-5 -5 v10" stroke={luz} />
            </>
          ) : (
            <Path
              d="M70 145 Q80 157 90 145 M76 148 L80 158 L84 148"
              stroke={pintura}
              strokeWidth="1.5"
            />
          )}
        </>
      ) : (
        <>
          {[0, 90, 180, 270].map((r) => (
            <G key={r} transform={`rotate(${r} 80 80)`}>
              <Path
                d={
                  oro
                    ? 'M55 20 Q66 8 74 14 L80 4 L86 14 Q94 8 105 20 L91 24 L80 16 L69 24Z'
                    : 'M46 25 L57 14 L103 14 L114 25 L101 21 L59 21Z'
                }
                fill={pintura}
                stroke={luz}
                strokeWidth=".5"
              />
              <Path d="M64 16 H72 M88 16 H96" stroke={oscuro} strokeWidth="1" />
              {oro ? (
                <Path
                  d="M80 7 L84 14 L80 20 L76 14Z"
                  fill="#4b4e5e"
                  stroke={luz}
                  strokeWidth=".7"
                />
              ) : (
                <Path d="M77 14 V20 M80 14 V20 M83 14 V20" stroke={oscuro} strokeWidth=".65" />
              )}
            </G>
          ))}
          <Circle
            cx="80"
            cy="80"
            r="69"
            stroke={pintura}
            strokeWidth="1.2"
            strokeDasharray="38 70"
            transform="rotate(29 80 80)"
          />
        </>
      )}
    </Svg>
  )
}
