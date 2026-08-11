import ExpoModulesCore
import AVKit

/**
 El botón de AirPlay: a dónde va el sonido.

 Es una **vista del sistema**, no un botón nuestro. `AVRoutePickerView` se
 dibuja sola, se anima cuando la salida deja de ser el teléfono y al tocarla
 abre la hoja de destinos —bocina, AirPods, un Apple TV, el auto—. Esa hoja no
 se puede abrir desde código: no hay API pública para presentarla, así que
 dibujar nuestro ícono y tratar de accionarla por abajo sería simular un toque
 sobre un subview privado, que es exactamente la clase de truco que se rompe en
 la próxima versión de iOS.

 Por eso acá no se replica nada: se le presta el lugar a la vista de Apple y se
 le pasan los dos colores del sistema de diseño. Lo que está en pantalla es el
 control de verdad, con su animación y su accesibilidad puestas por el sistema.

 Tampoco toca el audio. Quién suena y en qué momento lo sigue decidiendo
 `state/playback`; esto solo elige por qué parlante sale.
 */
public final class RoutePickerView: ExpoView {
  private let picker = AVRoutePickerView()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    /*
     * Esto es un reproductor de música y nunca hay video. Con la preferencia
     * puesta en pantallas, iOS ordena la lista poniendo primero un Apple TV o
     * un monitor, y lo que se busca desde acá casi siempre son los auriculares.
     */
    picker.prioritizesVideoDevices = false
    picker.autoresizingMask = [.flexibleWidth, .flexibleHeight]

    addSubview(picker)
  }

  func setColor(_ color: UIColor?) {
    picker.tintColor = color
  }

  func setActiveColor(_ color: UIColor?) {
    picker.activeTintColor = color
  }
}

public final class AudioRouteModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioRoute")

    View(RoutePickerView.self) {
      /** El ícono con la salida en el teléfono: es un control más, va en gris. */
      Prop("color") { (view: RoutePickerView, color: UIColor?) in
        view.setColor(color)
      }

      /*
       * Sonando por fuera del teléfono. Va en blanco, que en este sistema es
       * el acento y el estado activo — ver `docs/DESIGN.md`.
       */
      Prop("activeColor") { (view: RoutePickerView, color: UIColor?) in
        view.setActiveColor(color)
      }
    }
  }
}
