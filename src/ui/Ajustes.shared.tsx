import { SharedLayoutBg } from './SharedLayoutBg'
import { superficieInteractivaWeb } from './estadoControl'
import { CopyFeedback } from './CopyFeedback'
import { createContext, useContext, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import type { SFSymbol } from 'sf-symbols-typescript'
import { Interruptor, INTERRUPTOR_PROPIO } from './Interruptor'
import { Menu } from './Menu'
import { ICON_COLOR, IconChevronDown, IconChevronRight } from './icons'

export type CategoriaAjustesNativa = {
  id: string
  titulo: string
  resumen: string
  simbolo: string
  bloques: ReactNode
}

export type AjustesNativosProps = {
  categorias: CategoriaAjustesNativa[]
  initialId?: string
  cuenta: ReactNode
  piso: number
  buscando: boolean
  busqueda: string
  onBusqueda: (value: string) => void
  onVolver: () => void
}

/** Sólo iOS la reemplaza por el NavigationStack SwiftUI. */
export function AjustesNativos(_props: AjustesNativosProps) {
  return null
}

const DensidadAjustesContext = createContext(false)

// En escritorio usa la escala de Ajustes del Sistema; en teléfono conserva
// las medidas táctiles de iOS.
export function AjustesCompactos({ children }: { children: ReactNode }) {
  return <DensidadAjustesContext.Provider value>{children}</DensidadAjustesContext.Provider>
}

export function useAjustesCompactos() {
  return useContext(DensidadAjustesContext)
}

/**
 * Las piezas de una lista agrupada, con las medidas de Configuración de iOS.
 *
 * El patrón se llama *inset grouped list*: bloques redondeados de filas, cada
 * fila con su placa de ícono a la izquierda, el rótulo, el valor actual en gris
 * a la derecha y el chevron que anuncia otra pantalla —o el interruptor, si lo
 * que hay que decidir es sí o no—. Las líneas que separan filas arrancan
 * después de la placa, y el bloque puede llevar un título arriba y una
 * explicación abajo (el *footer*), que es donde iOS pone lo que una fila no
 * puede decir sola.
 *
 * Las medidas son las del sistema y no las de la app —rótulo de 17, fila de
 * 52, placa de 30 con radio 8, bloque con radio 22— porque este es el único
 * lugar donde la app se parece a los Ajustes del teléfono a propósito: quien
 * entra a configurar algo tiene ese patrón en el dedo y cualquier desvío se
 * lee como error.
 */

/**
 * El ícono de una fila, en su placa redondeada.
 *
 * Es el detalle que hace que la lista se lea como los Ajustes de un sistema y
 * no como texto suelto: cada fila abre con una placa del mismo tamaño, y el
 * ícono descansa adentro. La placa es `muted` sobre la tarjeta `card` —una
 * superficie apenas más clara—, que es separar por luminancia como pide
 * `docs/DESIGN.md`; iOS pinta cada placa de un color y acá el sistema es
 * acromático, así que todas son del mismo gris.
 */
export function IconoAjuste({ children }: { children: ReactNode }) {
  return (
    <View className="h-[30px] w-[30px] items-center justify-center rounded-[8px] bg-muted">
      {children}
    </View>
  )
}

/**
 * Un bloque de filas, con su título y su pie opcionales.
 *
 * El pie es lo que explica al bloque —«Al terminar la lista, sigue con
 * recomendaciones.»— y va **debajo**, en gris y chico, como en iOS: una fila
 * con subtítulo se vuelve de dos alturas y la lista pierde el ritmo; la
 * explicación al pie deja las filas parejas.
 */
export function GrupoAjustes({
  titulo,
  pie,
  error,
  children,
}: {
  /** Va arriba del bloque, en gris. Opcional: la raíz de Ajustes no los lleva. */
  titulo?: string
  /** Va debajo, en gris: lo que el bloque necesita explicar. */
  pie?: string
  /**
   * Lo que salió mal, en el mismo renglón del pie y en su lugar.
   *
   * No en un cartel aparte: el error de un bloque pertenece al bloque, y
   * empujarlo a otra superficie lo separa de las filas que hay que corregir.
   * Al ser todo gris, se distingue por redacción y posición —lo dice
   * `docs/DESIGN.md`— y por el rol de alerta, que es lo que lo anuncia.
   */
  error?: string | null
  children: ReactNode
}) {
  const compacto = useAjustesCompactos()
  return (
    <View>
      {titulo ? (
        <Text className={`${compacto ? 'px-3 pb-1.5 text-footnote font-semibold uppercase' : 'px-4 pb-2 text-footnote'} text-muted-foreground`}>{titulo}</Text>
      ) : null}
      <View className={`overflow-hidden bg-card ${compacto ? 'rounded-[16px]' : 'rounded-[22px]'}`}><SharedLayoutBg targets="surfaces" className="dn-settings-rows">{children}</SharedLayoutBg></View>
      {error ? (
        <Text
          accessibilityRole="alert"
          className={`${compacto ? 'px-3 pt-1.5 text-caption1' : 'px-4 pt-2 text-footnote leading-[18px]'} text-destructive`}
        >
          {error}
        </Text>
      ) : pie ? (
        <Text className={`${compacto ? 'px-3 pt-1.5 text-caption1' : 'px-4 pt-2 text-footnote leading-[18px]'} text-muted-foreground`}>{pie}</Text>
      ) : null}
    </View>
  )
}

/** La marca numérica de una fila: cuántas cosas esperan detrás. Blanca, que es el acento. */
function Globito({ n }: { n: number }) {
  return (
    <View className="h-[22px] min-w-[22px] items-center justify-center rounded-full bg-primary px-1.5">
      <Text className="text-primary-foreground text-footnote font-semibold">{n > 99 ? '99+' : n}</Text>
    </View>
  )
}

/**
 * Una fila que abre otra pantalla.
 *
 * `valor` es lo que hay guardado hoy; si está vacío se muestra `vacio` en gris,
 * que dice qué iría ahí. Un campo sin poner no puede verse igual que uno puesto.
 * `globito` es la cuenta de lo que espera detrás —las novedades sin leer—, como
 * el «1» rojo de «iPhone sin respaldo».
 */
export function FilaAjuste({
  rotulo,
  detalle,
  valor,
  vacio = 'Sin poner',
  icono,
  iconoPlano = false,
  globito,
  onPress,
  ultima = false,
  destructivo = false,
  disabled = false,
}: {
  rotulo: string
  /** Una segunda línea, solo cuando el rótulo no alcanza. Las filas de la raíz no la llevan. */
  detalle?: string
  valor?: string | null
  vacio?: string
  icono?: ReactNode
  /** Icono directo, como en la navegación lateral del editor. */
  iconoPlano?: boolean
  globito?: number
  onPress: () => void
  /** La última del bloque no lleva la línea de separación. */
  ultima?: boolean
  /**
   * Una acción que saca algo —«Quitar el fondo»—: sin flecha, porque no
   * abre nada, y con el rótulo en el tono de lo destructivo.
   */
  destructivo?: boolean
  disabled?: boolean
}) {
  const compacto = useAjustesCompactos()
  const puesto = !!valor?.trim()

  return (
    <Pressable
      {...superficieInteractivaWeb('row')}
      accessibilityRole="button"
      accessibilityLabel={`${rotulo}${puesto ? `: ${valor}` : vacio ? `: ${vacio}` : ''}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`flex-row items-center ${disabled ? 'opacity-45' : 'active:bg-muted'} ${compacto ? 'gap-2.5 pl-3' : 'gap-3 pl-4'}`}
    >
      {icono ? compacto || iconoPlano ? icono : <IconoAjuste>{icono}</IconoAjuste> : null}

      {/* La separación va adentro y no en el contenedor: así la línea arranca
          después del ícono, como en Ajustes, en vez de cortar el bloque entero. */}
      <View
        className={`${compacto ? 'min-h-[44px] gap-2.5 py-2 pr-3' : 'min-h-[52px] gap-3 py-2.5 pr-4'} min-w-0 flex-1 flex-row items-center ${
          ultima ? '' : 'border-b border-muted'
        }`}
      >
        <View className="min-w-0 shrink">
          <Text className={`${compacto ? 'text-subheadline' : 'text-body'} ${destructivo ? 'text-destructive' : 'text-foreground'}`} numberOfLines={1}>
            {rotulo}
          </Text>
          {detalle ? (
            <Text className={`text-muted-foreground ${compacto ? 'text-caption1' : 'text-footnote leading-[18px]'}`}>{detalle}</Text>
          ) : null}
        </View>
        <Text
          className={`min-w-0 flex-1 text-right ${compacto ? 'text-subheadline' : 'text-body'} ${
            puesto ? 'text-muted-foreground' : 'text-muted-foreground/60'
          }`}
          numberOfLines={1}
        >
          {puesto ? valor : vacio}
        </Text>
        {globito ? <Globito n={globito} /> : null}
        {destructivo ? null : <IconChevronRight size={15} color={ICON_COLOR.muted} />}
      </View>
    </Pressable>
  )
}

/**
 * Una fila que **muestra** un dato, sin llevar a ningún lado.
 *
 * Es la fila de «Versión» o «Número de serie»: rótulo a la izquierda, valor en
 * gris a la derecha y nada más. Sin chevron, porque no abre nada — ponérselo
 * sería prometer una pantalla que no existe.
 */
export function FilaDato({
  rotulo,
  valor,
  icono,
  iconoPlano = false,
  ultima = false,
}: {
  rotulo: string
  valor: string
  icono?: ReactNode
  iconoPlano?: boolean
  ultima?: boolean
}) {
  const compacto = useAjustesCompactos()
  return (
    <View className={`flex-row items-center ${compacto ? 'gap-2.5 pl-3' : 'gap-3 pl-4'}`}>
      {icono ? compacto || iconoPlano ? icono : <IconoAjuste>{icono}</IconoAjuste> : null}
      <View
        className={`${compacto ? 'min-h-[44px] gap-2.5 py-2 pr-3' : 'min-h-[52px] gap-3 py-2.5 pr-4'} min-w-0 flex-1 flex-row items-center ${
          ultima ? '' : 'border-b border-muted'
        }`}
      >
        <Text className={`shrink-0 text-foreground ${compacto ? 'text-subheadline' : 'text-body'}`}>{rotulo}</Text>
        <Text
          className={`min-w-0 flex-1 text-right text-muted-foreground ${compacto ? 'text-subheadline' : 'text-body'}`}
          numberOfLines={1}
        >
          {valor}
        </Text>
      </View>
    </View>
  )
}

/**
 * Una fila donde se **escribe** un valor: el rótulo a la izquierda, lo escrito
 * a la derecha.
 *
 * Es la forma que tiene un formulario adentro de una lista agrupada, y es la
 * que usa Ajustes del Sistema para un nombre de equipo o una dirección. Lo que
 * reemplaza es el campo suelto de `Field`: una caja alta con la etiqueta
 * **encima y en versalitas**, que viene del formulario de acceso y adentro de
 * una lista rompe el ritmo —cada campo mide el doble que una fila y la etiqueta
 * gritada no se parece a nada del sistema.
 *
 * Lo que un campo necesita explicar va al `pie` del bloque, no debajo de la
 * fila: así las filas quedan parejas, que es lo que hace legible la lista.
 */
export function FilaTexto({
  rotulo,
  valor,
  onCambiar,
  marcador,
  editable = true,
  icono,
  iconoPlano = false,
  ultima = false,
  autoCapitalize = 'none',
  autoCorrect = false,
}: {
  rotulo: string
  valor: string
  onCambiar: (valor: string) => void
  /** Lo que se ve cuando está vacío: un ejemplo de lo que va acá. */
  marcador?: string
  editable?: boolean
  icono?: ReactNode
  iconoPlano?: boolean
  ultima?: boolean
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  autoCorrect?: boolean
}) {
  const compacto = useAjustesCompactos()
  return (
    <View className={`flex-row items-center ${compacto ? 'gap-2.5 pl-3' : 'gap-3 pl-4'}`}>
      {icono ? compacto || iconoPlano ? icono : <IconoAjuste>{icono}</IconoAjuste> : null}
      <View
        className={`${compacto ? 'min-h-[44px] gap-2.5 py-2 pr-3' : 'min-h-[52px] gap-3 py-2.5 pr-4'} min-w-0 flex-1 flex-row items-center ${
          ultima ? '' : 'border-b border-muted'
        }`}
      >
        <Text className={`shrink-0 ${editable ? 'text-foreground' : 'text-muted-foreground'} ${compacto ? 'text-subheadline' : 'text-body'}`}>
          {rotulo}
        </Text>
        <TextInput
          accessibilityLabel={rotulo}
          value={valor}
          editable={editable}
          onChangeText={onCambiar}
          placeholder={marcador}
          /* El gris del valor puesto, a media luz: un ejemplo no puede leerse
             igual que algo escrito. Es el mismo criterio que `FilaAjuste`. */
          placeholderTextColor="rgba(179,179,179,0.6)"
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          className={`min-w-0 flex-1 text-right text-foreground ${compacto ? 'text-subheadline' : 'text-body'}`}
          style={{ minHeight: compacto ? 36 : 44, paddingVertical: 0, paddingHorizontal: 0 }}
        />
      </View>
    </View>
  )
}

/**
 * Una fila que **hace** algo acá mismo: guardar, recargar, abrir el destino.
 *
 * En una lista agrupada las acciones son filas, no píldoras: iOS pone «Cerrar
 * sesión» como una fila más del bloque. Sin chevron —no abre otra pantalla— y
 * con el rótulo en oración normal. Es lo que reemplaza a los botones anchos en
 * versalitas: esos son del formulario de acceso, donde hay una sola acción y
 * ocupa el ancho porque no compite con nada.
 *
 * `destacada` es la acción principal del bloque; apagada se atenúa el rótulo en
 * vez del bloque entero, para que se siga leyendo qué es lo que no se puede
 * hacer todavía.
 */
export function FilaAccion({
  rotulo,
  copyText,
  onPress,
  destacada = false,
  disabled = false,
  busy = false,
  icono,
  iconoPlano = false,
  ultima = false,
}: {
  copyText?: string
  rotulo: string
  onPress: () => void
  destacada?: boolean
  disabled?: boolean
  busy?: boolean
  icono?: ReactNode
  iconoPlano?: boolean
  ultima?: boolean
}) {
  const compacto = useAjustesCompactos()
  const activa = !disabled && !busy
  return (
    <Pressable
      {...superficieInteractivaWeb('row')}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityState={{ disabled: !activa, busy }}
      disabled={!activa}
      onPress={onPress}
      className={`flex-row items-center ${activa ? 'active:bg-muted' : ''} ${compacto ? 'gap-2.5 pl-3' : 'gap-3 pl-4'}`}
    >
      {copyText === undefined && icono ? compacto || iconoPlano ? icono : <IconoAjuste>{icono}</IconoAjuste> : null}
      <View
        className={`${compacto ? 'min-h-[44px] gap-2.5 py-2 pr-3' : 'min-h-[52px] gap-3 py-2.5 pr-4'} min-w-0 flex-1 flex-row items-center ${
          ultima ? '' : 'border-b border-muted'
        }`}
      >
        {copyText !== undefined ? <CopyFeedback text={copyText} label={rotulo} rowDensity={compacto ? 'compact' : 'regular'} icon={icono ? compacto || iconoPlano ? icono : <IconoAjuste>{icono}</IconoAjuste> : undefined} /> : <Text
          className={`min-w-0 flex-1 ${compacto ? 'text-subheadline' : 'text-body'} ${
            activa ? 'text-foreground' : 'text-muted-foreground/60'
          } ${destacada ? 'font-semibold' : ''}`}
          numberOfLines={1}
        >
          {rotulo}
        </Text>}
        {busy ? <ActivityIndicator color={ICON_COLOR.muted} /> : null}
      </View>
    </Pressable>
  )
}

/**
 * La fila de la cuenta, arriba de todo: la cara grande, el nombre y qué hay
 * detrás. Es la primera fila de Configuración —«Nihuel Prieto · Cuenta de
 * Apple, iCloud y más»— y es más alta que las demás a propósito: es la única
 * que habla de una persona y no de una preferencia.
 */
export function FilaCuenta({
  avatar,
  nombre,
  detalle,
  onPress,
  ultima = false,
}: {
  avatar: ReactNode
  nombre: string
  detalle: string
  onPress: () => void
  ultima?: boolean
}) {
  return (
    <Pressable
      {...superficieInteractivaWeb('row')}
      accessibilityRole="button"
      accessibilityLabel={`${nombre}. ${detalle}`}
      onPress={onPress}
      className="flex-row items-center gap-4 pl-4 active:bg-muted"
    >
      {avatar}
      <View
        className={`min-w-0 flex-1 flex-row items-center gap-3 py-3.5 pr-4 ${
          ultima ? '' : 'border-b border-muted'
        }`}
      >
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-foreground text-title3 font-semibold" numberOfLines={1}>
            {nombre}
          </Text>
          <Text className="text-muted-foreground text-footnote" numberOfLines={1}>
            {detalle}
          </Text>
        </View>
        <IconChevronRight size={15} color={ICON_COLOR.muted} />
      </View>
    </Pressable>
  )
}

/**
 * Una fila que enciende y apaga algo, sin abrir otra pantalla.
 *
 * Es la otra mitad del patrón de Ajustes: cuando lo que hay que decidir es
 * sí o no, empujar una pantalla para un solo interruptor es hacer trabajar de
 * más. Lo que implica va al pie del bloque (`GrupoAjustes.pie`), no debajo del
 * rótulo: así las filas quedan parejas, como en el sistema.
 *
 * El estado se marca con el blanco, que en este sistema es el acento y el
 * encendido; apagado queda el gris de las superficies. Ver `docs/DESIGN.md`.
 */
export function FilaInterruptor({
  rotulo,
  detalle,
  activo,
  onCambiar,
  icono,
  iconoPlano = false,
  ultima = false,
  disabled = false,
}: {
  rotulo: string
  /** Una segunda línea, solo cuando el rótulo no alcanza. Preferir `pie` del bloque. */
  detalle?: string
  activo: boolean
  onCambiar: (activo: boolean) => void
  icono?: ReactNode
  /** Icono directo, como en la navegación lateral del editor. */
  iconoPlano?: boolean
  ultima?: boolean
  disabled?: boolean
}) {
  const compacto = useAjustesCompactos()
  /* Con el interruptor del sistema la fila **no** es un `Pressable`: el
     `Toggle` de SwiftUI escucha su propio toque y, con los dos escuchando, un
     toque encima lo prendía y lo apagaba en el mismo gesto. Es además lo que
     hace Ajustes de iOS — ahí el rótulo no conmuta nada. Ver `Interruptor`. */
  const Fila = INTERRUPTOR_PROPIO ? View : Pressable
  const escucha = INTERRUPTOR_PROPIO
    ? {}
    : {
        accessibilityRole: 'switch' as const,
        accessibilityLabel: rotulo,
        accessibilityState: { checked: activo, disabled },
        'aria-checked': activo,
        disabled,
        onPress: () => onCambiar(!activo),
      }
  return (
    <Fila
      {...superficieInteractivaWeb('row')}
      {...escucha}
      className={`flex-row items-center ${disabled ? 'opacity-45' : INTERRUPTOR_PROPIO ? '' : 'active:bg-muted'} ${compacto ? 'gap-2.5 pl-3' : 'gap-3 pl-4'}`}
    >
      {icono ? compacto || iconoPlano ? icono : <IconoAjuste>{icono}</IconoAjuste> : null}

      <View
        className={`${compacto ? 'min-h-[44px] gap-2.5 py-2 pr-3' : 'min-h-[52px] gap-3 py-2.5 pr-4'} min-w-0 flex-1 flex-row items-center ${
          ultima ? '' : 'border-b border-muted'
        }`}
      >
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className={`text-foreground ${compacto ? 'text-subheadline' : 'text-body'}`}>{rotulo}</Text>
          {detalle ? (
            <Text className={`text-muted-foreground ${compacto ? 'text-caption1' : 'text-footnote leading-[18px]'}`}>{detalle}</Text>
          ) : null}
        </View>

        <Interruptor activo={activo} onCambiar={onCambiar} compacto={compacto} disabled={disabled} rotulo={rotulo} />
      </View>
    </Fila>
  )
}

/**
 * Una fila que elige **un valor entre varios** con un menú, sin otra pantalla.
 *
 * Es la fila con menú de iOS —el valor actual a la derecha y el chevron
 * doble— y en el iPhone el menú es el del sistema. Para tres a ocho opciones
 * es el control correcto: una pantalla entera para elegir minutos es una
 * pantalla de más, y una fila de chips adentro del bloque rompe el ritmo de
 * la lista.
 */
export function FilaOpciones<T extends string | number>({
  rotulo,
  valor,
  opciones,
  onElegir,
  icono,
  iconoPlano = false,
  ultima = false,
  disabled = false,
}: {
  rotulo: string
  /** La opción elegida, o `null` si ninguna. */
  valor: T | null
  opciones: { value: T; label: string; sfSymbol?: SFSymbol; destructive?: boolean; separadorAntes?: boolean }[]
  onElegir: (value: T) => void
  icono?: ReactNode
  iconoPlano?: boolean
  ultima?: boolean
  disabled?: boolean
}) {
  const compacto = useAjustesCompactos()
  const elegida = opciones.find((o) => o.value === valor)
  return (
    <Menu
      label={rotulo}
      disabled={disabled}
      triggerFullWidth
      items={opciones.map((o) => ({
        label: o.label,
        onPress: () => onElegir(o.value),
        selected: o.value === valor,
        sfSymbol: o.sfSymbol,
        destructive: o.destructive,
        separadorAntes: o.separadorAntes,
      }))}
      trigger={
        <View className={`w-full flex-row items-center ${disabled ? 'opacity-45' : ''} ${compacto ? 'gap-2.5 pl-3' : 'gap-3 pl-4'}`}>
          {icono ? compacto || iconoPlano ? icono : <IconoAjuste>{icono}</IconoAjuste> : null}
          <View
            className={`${compacto ? 'min-h-[44px] gap-2.5 py-2 pr-3' : 'min-h-[52px] gap-3 py-2.5 pr-4'} min-w-0 flex-1 flex-row items-center ${
              ultima ? '' : 'border-b border-muted'
            }`}
          >
            <Text className={`shrink-0 text-foreground ${compacto ? 'text-subheadline' : 'text-body'}`}>{rotulo}</Text>
            <Text
              className={`min-w-0 flex-1 text-right text-muted-foreground ${compacto ? 'text-subheadline' : 'text-body'}`}
              numberOfLines={1}
            >
              {elegida?.label ?? '—'}
            </Text>
            <IconChevronDown size={15} color={ICON_COLOR.muted} />
          </View>
        </View>
      }
    />
  )
}

/** La plataforma nativa reemplaza este contenedor por un List de SwiftUI. */
export function ListaAjustes({ children }: { children: ReactNode; piso?: number; titulo?: string }) {
  return <View className="flex-1">{children}</View>
}
export { FilaSostener as FilaConfirmable } from './Mantener'
