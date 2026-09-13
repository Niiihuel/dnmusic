import ExpoModulesCore
import UIKit

public final class CollectionControlsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CollectionControls")
    Constant("contentFadeVersion") { 1 }

    View(CollectionFadeView.self) {}

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
      Events("onSelect", "onOpen", "onPreviewPress")
      Prop("previewCornerRadius") { (view: CollectionContextView, radius: Double?) in
        view.previewCornerRadius = CGFloat(max(0, radius ?? 8))
      }
      Prop("preview") { (view: CollectionContextView, preview: [String: Any]?) in
        view.previewInfo = preview
      }
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
  var previewInfo: [String: Any]?
  var previewCornerRadius: CGFloat = 8
  let onPreviewPress = EventDispatcher()
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
    let info = previewInfo
    let width = min(360, max(240, (interaction.view?.window?.bounds.width ?? 390) - 48))
    return UIContextMenuConfiguration(identifier: nil, previewProvider: info.map { value in
      { CollectionPreviewController(info: value, width: width) }
    }) { [weak self] _ in
      UIMenu(children: self?.elements(currentItems) ?? [])
    }
  }

  func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
    willPerformPreviewActionForMenuWith configuration: UIContextMenuConfiguration,
    animator: UIContextMenuInteractionCommitAnimating
  ) {
    animator.addCompletion { [weak self] in self?.onPreviewPress([:]) }
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
    parameters.backgroundColor = .clear
    parameters.visiblePath = UIBezierPath(roundedRect: row.bounds, cornerRadius: previewCornerRadius)
    return UITargetedPreview(view: row, parameters: parameters)
  }

  func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
    previewForHighlightingMenuWithConfiguration configuration: UIContextMenuConfiguration
  ) -> UITargetedPreview? { preview(interaction) }

  func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
    previewForDismissingMenuWithConfiguration configuration: UIContextMenuConfiguration
  ) -> UITargetedPreview? { preview(interaction) }
}


/// A summary of the selected item, independent of row controls and playback state.
private final class CollectionPreviewController: UIViewController {
  private let info: [String: Any]
  private let cardWidth: CGFloat
  private var imageTask: URLSessionDataTask?

  init(info: [String: Any], width: CGFloat) {
    self.info = info
    self.cardWidth = width
    super.init(nibName: nil, bundle: nil)
    preferredContentSize = CGSize(width: width, height: 132)
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  deinit { imageTask?.cancel() }

  override func loadView() {
    let card = UIView()
    card.backgroundColor = .secondarySystemBackground
    card.overrideUserInterfaceStyle = .dark
    let artwork = UIImageView(image: UIImage(systemName: info["symbol"] as? String ?? "music.note"))
    artwork.contentMode = .scaleAspectFill
    artwork.tintColor = .secondaryLabel
    artwork.backgroundColor = .tertiarySystemBackground
    artwork.layer.cornerRadius = 12
    artwork.clipsToBounds = true
    artwork.translatesAutoresizingMaskIntoConstraints = false
    let text = UIStackView()
    text.axis = .vertical
    text.spacing = 3
    for (key, style) in [("title", UIFont.TextStyle.headline), ("subtitle", .subheadline), ("detail", .footnote)] {
      guard let value = info[key] as? String, !value.isEmpty else { continue }
      let label = UILabel()
      label.text = value
      label.font = .preferredFont(forTextStyle: style)
      label.adjustsFontForContentSizeCategory = true
      label.textColor = key == "title" ? .label : .secondaryLabel
      label.numberOfLines = key == "title" ? 2 : 3
      text.addArrangedSubview(label)
    }
    let row = UIStackView(arrangedSubviews: [artwork, text])
    row.alignment = .center
    row.spacing = 16
    row.translatesAutoresizingMaskIntoConstraints = false
    card.addSubview(row)
    NSLayoutConstraint.activate([
      row.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
      row.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),
      row.topAnchor.constraint(equalTo: card.topAnchor, constant: 16),
      row.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -16),
      artwork.widthAnchor.constraint(equalToConstant: 96),
      artwork.heightAnchor.constraint(equalToConstant: 96),
    ])
    view = card
    let size = card.systemLayoutSizeFitting(CGSize(width: cardWidth, height: 0),
      withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel)
    preferredContentSize = CGSize(width: cardWidth, height: max(128, size.height))
    guard let uri = info["artwork"] as? String, let url = URL(string: uri) else { return }
    if url.isFileURL {
      artwork.image = UIImage(contentsOfFile: url.path) ?? artwork.image
    } else if ["https", "http"].contains(url.scheme ?? "") {
      imageTask = URLSession.shared.dataTask(with: url) { [weak artwork] data, _, _ in
        guard let data, let image = UIImage(data: data) else { return }
        DispatchQueue.main.async { artwork?.image = image }
      }
      imageTask?.resume()
    }
  }
}


/// Fades child content with alpha, leaving the screen's artwork visible underneath.
final class CollectionFadeView: ExpoView {
  private let gradient = CAGradientLayer()
  private weak var maskedView: UIView?
  private var previousMask: CALayer?

  override func willMove(toSuperview newSuperview: UIView?) {
    if let target = maskedView, target.layer.mask === gradient { target.layer.mask = previousMask }
    super.willMove(toSuperview: newSuperview)
  }

  override func didMoveToSuperview() {
    super.didMoveToSuperview()
    maskedView = superview
    previousMask = superview?.layer.mask
    gradient.colors = [UIColor.clear.cgColor, UIColor.white.cgColor, UIColor.white.cgColor, UIColor.clear.cgColor]
    superview?.layer.mask = gradient
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    guard let target = maskedView, target.bounds.height > 0 else { return }
    let edge = min(0.25, 24 / target.bounds.height)
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    gradient.frame = target.bounds
    gradient.locations = [0, NSNumber(value: Double(edge)), NSNumber(value: Double(1 - edge)), 1]
    CATransaction.commit()
  }
}
