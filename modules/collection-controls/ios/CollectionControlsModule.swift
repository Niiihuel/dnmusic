import ExpoModulesCore
import UIKit

public final class CollectionControlsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CollectionControls")

    View(CollectionSearchView.self) {
      Events("onChangeText", "onCancel")
      Prop("text") { (view: CollectionSearchView, text: String) in
        if view.searchBar.text != text { view.searchBar.text = text }
      }
      Prop("autoFocus") { (view: CollectionSearchView, autoFocus: Bool) in
        view.autoFocus = autoFocus
      }
      Prop("placeholder") { (view: CollectionSearchView, text: String) in
        view.searchBar.placeholder = text
        view.searchBar.searchTextField.accessibilityLabel = text
      }
    }

    View(CollectionContextView.self) {
      Events("onSelect", "onOpen")
      Prop("items") { (view: CollectionContextView, items: [[String: Any]]) in
        view.items = items
      }
    }
  }
}

final class CollectionSearchView: ExpoView, UISearchBarDelegate {
  let searchBar = UISearchBar()
  let onChangeText = EventDispatcher()
  let onCancel = EventDispatcher()
  private var focusedInitially = false
  var autoFocus = false { didSet { setNeedsLayout() } }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    overrideUserInterfaceStyle = .dark
    searchBar.delegate = self
    searchBar.searchBarStyle = .minimal
    searchBar.autocapitalizationType = .none
    searchBar.autocorrectionType = .no
    searchBar.returnKeyType = .search
    searchBar.showsCancelButton = false
    tintColor = .white
    searchBar.tintColor = .white
    searchBar.searchTextField.tintColor = .white
    addSubview(searchBar)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    searchBar.frame = bounds
    // Esperar a tener ventana y ancho real; al filtrar no vuelve a pedir foco.
    if autoFocus, window != nil, bounds.width > 0, !focusedInitially {
      focusedInitially = true
      searchBar.becomeFirstResponder()
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil { setNeedsLayout() }
  }

  func searchBarTextDidBeginEditing(_ searchBar: UISearchBar) {
    searchBar.setShowsCancelButton(true, animated: true)
  }

  func searchBarTextDidEndEditing(_ searchBar: UISearchBar) {
    searchBar.setShowsCancelButton(false, animated: true)
  }

  func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) {
    onChangeText(["text": searchText])
  }

  func searchBarCancelButtonClicked(_ searchBar: UISearchBar) {
    searchBar.text = ""
    searchBar.resignFirstResponder()
    onCancel([:])
  }

  func searchBarSearchButtonClicked(_ searchBar: UISearchBar) {
    searchBar.resignFirstResponder()
  }
}

/// Se instala en la View RN que contiene la fila. No mueve sus hijos ni
/// realimenta a Yoga con las dimensiones de la vista previa de UIKit.
final class CollectionContextView: ExpoView, UIContextMenuInteractionDelegate {
  var items: [[String: Any]] = []
  let onSelect = EventDispatcher()
  let onOpen = EventDispatcher()
  private lazy var interaction = UIContextMenuInteraction(delegate: self)
  private var previousStyle: UIUserInterfaceStyle = .unspecified
  private var previousTint: UIColor?

  override func willMove(toSuperview newSuperview: UIView?) {
    if let row = interaction.view {
      row.removeInteraction(interaction)
      row.overrideUserInterfaceStyle = previousStyle
      row.tintColor = previousTint
    }
    super.willMove(toSuperview: newSuperview)
  }

  override func didMoveToSuperview() {
    super.didMoveToSuperview()
    guard let row = superview else { return }
    // Equivale al colorScheme="dark" del Host anterior, sólo en esta fila.
    previousStyle = row.overrideUserInterfaceStyle
    previousTint = row.tintColor
    row.overrideUserInterfaceStyle = .dark
    row.tintColor = .white
    row.addInteraction(interaction)
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configurationForMenuAtLocation location: CGPoint
  ) -> UIContextMenuConfiguration? {
    guard !items.isEmpty else { return nil }
    // Captura las opciones de esta apertura, aunque la lista cambie detrás.
    let currentItems = items
    onOpen([:])
    return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in
      UIMenu(children: self?.elements(currentItems) ?? [])
    }
  }

  private func elements(_ entries: [[String: Any]]) -> [UIMenuElement] {
    entries.map { entry in
      let title = entry["label"] as? String ?? ""
      let image = (entry["symbol"] as? String).flatMap { UIImage(systemName: $0) }
      if let children = entry["children"] as? [[String: Any]], entry["disabled"] as? Bool != true {
        let group = UIMenu(title: title, image: image,
          options: entry["inline"] as? Bool == true ? .displayInline : [],
          children: elements(children))
        group.subtitle = entry["subtitle"] as? String
        if #available(iOS 16.0, *), entry["small"] as? Bool == true {
          group.preferredElementSize = .small
        }
        return group
      }
      var attributes: UIMenuElement.Attributes = []
      if entry["disabled"] as? Bool == true { attributes.insert(.disabled) }
      if entry["destructive"] as? Bool == true { attributes.insert(.destructive) }
      let action = UIAction(title: title, image: image, attributes: attributes,
        state: entry["selected"] as? Bool == true ? .on : .off) { [weak self] _ in
          guard let id = entry["id"] as? String else { return }
          self?.onSelect(["id": id])
        }
      if #available(iOS 15.0, *) { action.subtitle = entry["subtitle"] as? String }
      return action
    }
  }

  private func preview(_ interaction: UIContextMenuInteraction) -> UITargetedPreview? {
    guard let row = interaction.view, row.window != nil else { return nil }
    let parameters = UIPreviewParameters()
    parameters.backgroundColor = UIColor(white: 18.0 / 255.0, alpha: 1)
    parameters.visiblePath = UIBezierPath(roundedRect: row.bounds, cornerRadius: 8)
    return UITargetedPreview(view: row, parameters: parameters)
  }

  func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
    previewForHighlightingMenuWithConfiguration configuration: UIContextMenuConfiguration
  ) -> UITargetedPreview? { preview(interaction) }

  func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
    previewForDismissingMenuWithConfiguration configuration: UIContextMenuConfiguration
  ) -> UITargetedPreview? { preview(interaction) }
}
