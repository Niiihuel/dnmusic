import ExpoModulesCore
import UIKit

/**
 El menú de los tres puntos, en UIKit.

 El menú contextual de las filas ya vive en `CollectionControls`, con
 `UIContextMenuInteraction`: eso es la **pulsación larga**. Lo que faltaba era
 el otro disparador, el que se toca —los tres puntos de una fila, «Opciones» en
 una cabecera—, que hasta acá pasaba por el `Menu` de SwiftUI de `@expo/ui`.

 Ese camino funcionaba, pero obligaba a meter el disparador dentro de un
 `RNHostView` para que SwiftUI lo midiera y a devolverle el alto a Yoga: dos
 sistemas de medición discutiendo por la misma fila. Acá no hay nada que medir.
 La vista es una lámina transparente que React Native estira sobre el
 disparador que ya dibujó, y adentro sólo hay un `UIButton` sin fondo con
 `showsMenuAsPrimaryAction`: quien dibuja sigue siendo RN y quien presenta el
 menú es UIKit, cada uno con lo suyo.
 */
public final class NativeMenuModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeMenu")

    View(NativeMenuButtonView.self) {
      Events("onOpen", "onSelect")

      Prop("items") { (view: NativeMenuButtonView, items: [[String: Any]]) in
        view.items = items
      }
      Prop("menuLabel") { (view: NativeMenuButtonView, label: String) in
        view.button.accessibilityLabel = label
      }
      // El disparador propio: los tres puntos, dibujados por el sistema.
      Prop("symbol") { (view: NativeMenuButtonView, symbol: String?) in
        view.symbolName = symbol
      }
      Prop("symbolSize") { (view: NativeMenuButtonView, size: Double) in
        view.symbolSize = size
      }
      Prop("symbolColor") { (view: NativeMenuButtonView, color: UIColor?) in
        view.symbolColor = color
      }
      Prop("disabled") { (view: NativeMenuButtonView, disabled: Bool) in
        view.button.isEnabled = !disabled
        view.button.accessibilityTraits = disabled ? [.button, .notEnabled] : [.button]
      }
    }
  }
}

/// Traduce las opciones que manda JS a los elementos de un `UIMenu`.
///
/// Los grupos llegan como submenús `inline`: es así como UIKit dibuja los
/// cortes entre grupos —no hay un «separador» suelto que insertar— y es el
/// mismo reparto que usa el menú de respaldo, para que las dos versiones
/// ofrezcan lo mismo en el mismo lugar.
enum NativeMenuBuilder {
  static func elements(_ entries: [[String: Any]], onSelect: @escaping (String) -> Void) -> [UIMenuElement] {
    entries.map { entry in
      let title = entry["label"] as? String ?? ""
      let image = (entry["symbol"] as? String).flatMap { UIImage(systemName: $0) }

      // Un grupo deshabilitado se dibuja como fila apagada, no como submenú.
      if let children = entry["children"] as? [[String: Any]], entry["disabled"] as? Bool != true {
        let group = UIMenu(
          title: title,
          image: image,
          options: entry["inline"] as? Bool == true ? .displayInline : [],
          children: elements(children, onSelect: onSelect)
        )
        if #available(iOS 15.0, *) { group.subtitle = entry["subtitle"] as? String }
        // La fila de acciones rápidas: iconos chicos, en horizontal.
        if #available(iOS 16.0, *), entry["small"] as? Bool == true {
          group.preferredElementSize = .small
        }
        return group
      }

      var attributes: UIMenuElement.Attributes = []
      if entry["disabled"] as? Bool == true { attributes.insert(.disabled) }
      if entry["destructive"] as? Bool == true { attributes.insert(.destructive) }
      let action = UIAction(
        title: title,
        image: image,
        attributes: attributes,
        state: entry["selected"] as? Bool == true ? .on : .off
      ) { _ in
        guard let id = entry["id"] as? String else { return }
        onSelect(id)
      }
      // Igual que en `CollectionControls`: el subtítulo de una acción es de iOS
      // 15, y el pod declara 15.1 — la guarda es por si ese piso baja.
      if #available(iOS 15.0, *) { action.subtitle = entry["subtitle"] as? String }
      return action
    }
  }
}

/// La lámina que se apoya sobre el disparador dibujado por React Native.
final class NativeMenuButtonView: ExpoView {
  // `.custom` y no `.system`: el botón no dibuja nada —ni título, ni imagen, ni
  // resaltado— porque lo que se ve debajo ya lo puso RN. Con `.system` UIKit le
  // pondría su propio destello encima del ícono ajeno.
  let button = UIButton(type: .custom)
  let onOpen = EventDispatcher()
  let onSelect = EventDispatcher()

  var items: [[String: Any]] = [] {
    didSet {
      // Un menú vacío no se presenta: sin esto la lámina se comería el toque
      // y el disparador quedaría muerto en vez de simplemente no tener menú.
      button.isUserInteractionEnabled = !items.isEmpty
    }
  }

  /*
   * El disparador, cuando no lo dibuja React Native.
   *
   * Los tres puntos de una fila no son un ícono nuestro: son `ellipsis`, el SF
   * Symbol del sistema, con el peso y la métrica de la tipografía que tenga
   * puesta el teléfono. Dibujarlo acá es lo mismo que hacía el `Image` de
   * SwiftUI, sin traer SwiftUI para un glifo. Con `children`, RN ya puso algo
   * debajo y estas tres props no vienen.
   */
  var symbolName: String? { didSet { refrescarSimbolo() } }
  var symbolSize: Double = 17 { didSet { refrescarSimbolo() } }
  var symbolColor: UIColor? { didSet { refrescarSimbolo() } }

  private func refrescarSimbolo() {
    guard let name = symbolName, let base = UIImage(systemName: name) else {
      button.setImage(nil, for: .normal)
      return
    }
    let config = UIImage.SymbolConfiguration(pointSize: symbolSize, weight: .regular)
    // El color va **horneado** en la imagen (`alwaysOriginal`) en vez de salir
    // del tinte del botón: el tinte lo hereda el menú presentado, y los tres
    // puntos son grises mientras que el menú tiene que quedar en blanco.
    button.setImage(
      base.withConfiguration(config).withTintColor(symbolColor ?? .white, renderingMode: .alwaysOriginal),
      for: .normal
    )
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    // La app es oscura entera; el menú del sistema tiene que serlo también.
    overrideUserInterfaceStyle = .dark
    tintColor = .white
    button.tintColor = .white
    button.backgroundColor = .clear
    button.showsMenuAsPrimaryAction = true
    button.isAccessibilityElement = true
    button.accessibilityTraits = [.button]
    button.isUserInteractionEnabled = false
    /*
     * Las opciones se arman **al abrir**, no al recibirlas.
     *
     * `UIDeferredMenuElement.uncached` es la forma que da UIKit para eso, y
     * hacen falta las dos mitades: avisar a JS que el menú se abrió —ahí
     * congela qué hace cada fila, así un dibujado posterior no le cambia la
     * acción a quien ya está eligiendo— y construir el menú con lo último que
     * llegó, sin depender de que la prop se haya asentado antes del toque.
     * La respuesta es síncrona: no hay ida al hilo de JS ni rueda de espera.
     */
    button.menu = UIMenu(children: [
      UIDeferredMenuElement.uncached { [weak self] completion in
        guard let self else { return completion([]) }
        self.onOpen([:])
        completion(NativeMenuBuilder.elements(self.items) { [weak self] id in
          self?.onSelect(["id": id])
        })
      }
    ])
    addSubview(button)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    button.frame = bounds
  }
}
