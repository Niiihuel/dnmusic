import ExpoModulesCore
import UIKit

public final class MediaControlsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MediaControls")
    Constant("miniPlayerVersion") { 1 }
    View(MediaTrackView.self) {
      Events("onActivate")
      Prop("title") { (view: MediaTrackView, value: String) in view.titleLabel.text = value }
      Prop("subtitle") { (view: MediaTrackView, value: String) in view.subtitleLabel.text = value }
      Prop("artwork") { (view: MediaTrackView, value: String?) in view.loadArtworks(value.map { [$0] } ?? []) }
      Prop("artworks") { (view: MediaTrackView, value: [String]) in view.loadArtworks(value) }
      Prop("symbol") { (view: MediaTrackView, value: String) in view.placeholderSymbol = value; view.updatePlaceholder() }
      Prop("label") { (view: MediaTrackView, value: String) in view.button.accessibilityLabel = value }
      Prop("sounding") { (view: MediaTrackView, value: Bool) in view.sounding = value; view.updateState() }
      Prop("playing") { (view: MediaTrackView, value: Bool) in view.playing = value; view.updateState() }
      Prop("busy") { (view: MediaTrackView, value: Bool) in view.busy = value; view.updateState() }
      Prop("disabled") { (view: MediaTrackView, value: Bool) in view.button.isEnabled = !value; view.alpha = value ? 0.5 : 1 }
      Prop("selected") { (view: MediaTrackView, value: Bool) in view.selected = value; view.updateState() }
    }
    View(MediaActionView.self) {
      Events("onActivate", "onLongActivate", "onHighlight")
      Prop("label") { (view: MediaActionView, value: String) in view.button.accessibilityLabel = value }
      Prop("hint") { (view: MediaActionView, value: String?) in view.button.accessibilityHint = value }
      Prop("value") { (view: MediaActionView, value: String?) in view.button.accessibilityValue = value }
      Prop("controlRole") { (view: MediaActionView, value: String?) in view.role = value ?? "button"; view.updateTraits() }
      Prop("selected") { (view: MediaActionView, value: Bool) in view.selected = value; view.updateTraits() }
      Prop("disabled") { (view: MediaActionView, value: Bool) in view.button.isEnabled = !value; view.updateTraits() }
      Prop("longPress") { (view: MediaActionView, value: Bool) in view.longGesture.isEnabled = value }
      Prop("longPressDelay") { (view: MediaActionView, value: Double) in view.longGesture.minimumPressDuration = value / 1000 }
    }
    View(MediaMiniPlayerView.self) {
      Events("onOpen", "onPlayPause", "onNext", "onPrevious", "onDevices", "onOptions")
      Prop("title") { (view: MediaMiniPlayerView, value: String) in view.model.title = value }
      Prop("subtitle") { (view: MediaMiniPlayerView, value: String) in view.model.subtitle = value }
      Prop("artwork") { (view: MediaMiniPlayerView, value: String?) in view.model.artwork = value }
      Prop("playing") { (view: MediaMiniPlayerView, value: Bool) in view.model.playing = value }
      Prop("busy") { (view: MediaMiniPlayerView, value: Bool) in view.model.busy = value }
      Prop("canNext") { (view: MediaMiniPlayerView, value: Bool) in view.model.canNext = value }
      Prop("canPrevious") { (view: MediaMiniPlayerView, value: Bool) in view.model.canPrevious = value }
      Prop("deviceLabel") { (view: MediaMiniPlayerView, value: String) in view.model.deviceLabel = value }
      Prop("remote") { (view: MediaMiniPlayerView, value: Bool) in view.model.remote = value }
    }
    View(MediaTabBarView.self) {
      Events("onSelect")
      Prop("active") { (view: MediaTabBarView, value: String) in view.select(value) }
      Prop("unread") { (view: MediaTabBarView, value: Int) in view.setUnread(value) }
    }
  }
}

/// Owns tile layout after Auto Layout has assigned the artwork bounds.
/// Laying these out from the outer ExpoView could leave them at zero forever.
private final class MediaArtworkView: UIView {
  let placeholder = UIImageView()
  var tiles: [UIImageView] = []

  override init(frame: CGRect) {
    super.init(frame: frame)
    placeholder.contentMode = .scaleAspectFit
    placeholder.tintColor = UIColor(white: 0.7, alpha: 1)
    addSubview(placeholder)
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  override func layoutSubviews() {
    super.layoutSubviews()
    let iconSide = min(bounds.width, bounds.height) * 0.44
    placeholder.frame = CGRect(x: (bounds.width - iconSide) / 2, y: (bounds.height - iconSide) / 2, width: iconSide, height: iconSide)
    for (index, tile) in tiles.enumerated() {
      tile.frame = tiles.count == 4
        ? CGRect(x: CGFloat(index % 2) * bounds.width / 2, y: CGFloat(index / 2) * bounds.height / 2, width: bounds.width / 2, height: bounds.height / 2)
        : bounds
    }
  }
}

/// Yoga fija el marco; UIKit distribuye títulos y portada. No hospeda hijos RN
/// ni envía medidas hacia Yoga. Las listas conservan su virtualización/gestos.
final class MediaTrackView: ExpoView {
  let onActivate = EventDispatcher()
  let button = UIButton(type: .custom)
  let titleLabel = UILabel()
  let subtitleLabel = UILabel()
  private let artwork = MediaArtworkView()
  private let stateImage = UIImageView()
  private let spinner = UIActivityIndicatorView(style: .medium)
  private let veil = UIView()
  private var imageTasks: [URLSessionDataTask] = []
  private var artworkURLs: [String] = []
  private var imageGeneration = 0
  private static let cache = NSCache<NSString, UIImage>()
  var placeholderSymbol = "music.note"
  func updatePlaceholder() { artwork.placeholder.image = UIImage(systemName: placeholderSymbol) }
  var sounding = false
  var playing = false
  var busy = false
  var selected = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    overrideUserInterfaceStyle = .dark
    button.translatesAutoresizingMaskIntoConstraints = false
    addSubview(button)
    NSLayoutConstraint.activate([
      button.leadingAnchor.constraint(equalTo: leadingAnchor),
      button.trailingAnchor.constraint(equalTo: trailingAnchor),
      button.topAnchor.constraint(equalTo: topAnchor),
      button.bottomAnchor.constraint(equalTo: bottomAnchor)
    ])
    button.addTarget(self, action: #selector(activate), for: .touchUpInside)
    button.addTarget(self, action: #selector(highlight), for: [.touchDown, .touchDragEnter])
    button.addTarget(self, action: #selector(unhighlight), for: [.touchUpInside, .touchUpOutside, .touchCancel, .touchDragExit])
    button.layer.cornerRadius = 8
    titleLabel.font = UIFont.preferredFont(forTextStyle: .callout)
    subtitleLabel.font = UIFont.preferredFont(forTextStyle: .footnote)
    titleLabel.adjustsFontForContentSizeCategory = true
    subtitleLabel.adjustsFontForContentSizeCategory = true
    titleLabel.textColor = .white
    subtitleLabel.textColor = UIColor(white: 0.70, alpha: 1)
    titleLabel.numberOfLines = 1
    subtitleLabel.numberOfLines = 1
    artwork.clipsToBounds = true
    artwork.layer.cornerRadius = 5
    artwork.tintColor = UIColor(white: 0.7, alpha: 1)
    artwork.backgroundColor = UIColor(white: 0.12, alpha: 1)
    veil.backgroundColor = UIColor.black.withAlphaComponent(0.5)
    veil.layer.cornerRadius = 5
    stateImage.tintColor = .white
    stateImage.contentMode = .scaleAspectFit
    spinner.color = .white
    let texts = UIStackView(arrangedSubviews: [titleLabel, subtitleLabel])
    texts.axis = .vertical
    texts.spacing = 2
    for child in [artwork, texts, veil, stateImage, spinner] {
      child.isUserInteractionEnabled = false
      child.isAccessibilityElement = false
      child.translatesAutoresizingMaskIntoConstraints = false
      button.addSubview(child)
    }
    NSLayoutConstraint.activate([
      artwork.leadingAnchor.constraint(equalTo: button.leadingAnchor, constant: 8),
      artwork.centerYAnchor.constraint(equalTo: button.centerYAnchor),
      artwork.widthAnchor.constraint(equalToConstant: 52),
      artwork.heightAnchor.constraint(equalToConstant: 52),
      texts.leadingAnchor.constraint(equalTo: artwork.trailingAnchor, constant: 12),
      texts.trailingAnchor.constraint(equalTo: button.trailingAnchor, constant: -8),
      texts.centerYAnchor.constraint(equalTo: button.centerYAnchor),
      veil.leadingAnchor.constraint(equalTo: artwork.leadingAnchor),
      veil.trailingAnchor.constraint(equalTo: artwork.trailingAnchor),
      veil.topAnchor.constraint(equalTo: artwork.topAnchor),
      veil.bottomAnchor.constraint(equalTo: artwork.bottomAnchor),
      stateImage.centerXAnchor.constraint(equalTo: artwork.centerXAnchor),
      stateImage.centerYAnchor.constraint(equalTo: artwork.centerYAnchor),
      stateImage.widthAnchor.constraint(equalToConstant: 22),
      stateImage.heightAnchor.constraint(equalToConstant: 22),
      spinner.centerXAnchor.constraint(equalTo: artwork.centerXAnchor),
      spinner.centerYAnchor.constraint(equalTo: artwork.centerYAnchor)
    ])
    updateState()
    loadArtworks([])
  }

  @objc private func activate() { onActivate([:]) }
  @objc private func highlight() { button.backgroundColor = UIColor(white: 0.16, alpha: 1) }
  @objc private func unhighlight() { updateState() }

  func updateState() {
    button.backgroundColor = selected ? UIColor(white: 0.12, alpha: 1) : .clear
    button.accessibilityTraits = selected || sounding ? [.button, .selected] : [.button]
    button.accessibilityValue = busy ? "Preparando audio" : sounding ? (playing ? "Reproduciendo" : "En pausa") : nil
    let normal = UIFont.preferredFont(forTextStyle: .callout)
    titleLabel.font = sounding ? UIFont(descriptor: normal.fontDescriptor.addingAttributes([.traits: [UIFontDescriptor.TraitKey.weight: UIFont.Weight.semibold]]), size: 0) : normal
    veil.isHidden = !busy && !sounding
    stateImage.isHidden = busy || !sounding
    stateImage.image = UIImage(systemName: playing ? "waveform" : "pause.fill")
    if busy { spinner.startAnimating() } else { spinner.stopAnimating() }
  }

  func loadArtworks(_ values: [String]) {
    let values = Array(values.prefix(values.count < 4 ? 1 : 4))
    guard values != artworkURLs || artwork.placeholder.image == nil else { return }
    artworkURLs = values
    imageGeneration += 1
    let generation = imageGeneration
    imageTasks.forEach { $0.cancel() }
    imageTasks = []
    artwork.tiles.forEach { $0.removeFromSuperview() }
    artwork.tiles = []
    updatePlaceholder()
    for value in values {
      let tile = UIImageView()
      tile.contentMode = .scaleAspectFill
      tile.clipsToBounds = true
      artwork.addSubview(tile)
      artwork.tiles.append(tile)
      guard let url = URL(string: value), ["https", "http", "file"].contains(url.scheme ?? "") else { continue }
      if let cached = Self.cache.object(forKey: value as NSString) { tile.image = cached; continue }
      let apply: (Data?) -> Void = { [weak self, weak tile] data in
        guard let data, let image = UIImage(data: data) else { return }
        DispatchQueue.main.async {
          Self.cache.setObject(image, forKey: value as NSString)
          guard let self, self.imageGeneration == generation else { return }
          tile?.image = image
        }
      }
      if url.isFileURL {
        DispatchQueue.global(qos: .userInitiated).async { apply(try? Data(contentsOf: url)) }
      } else {
        let task = URLSession.shared.dataTask(with: url) { data, response, error in
          guard error == nil, let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else { return }
          apply(data)
        }
        imageTasks.append(task)
        task.resume()
      }
    }
    artwork.setNeedsLayout()
  }

  deinit { imageTasks.forEach { $0.cancel() } }

}

/// UITabBar aporta selección, accesibilidad, insignias y material del sistema.
/// Los destinos siguen siendo del router compartido: no crea otra pila.
final class MediaTabBarView: ExpoView, UITabBarDelegate {
  let onSelect = EventDispatcher()
  private let tabBar = UITabBar()
  private let ids = ["inicio", "listas", "chats", "perfil", "buscar"]

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    overrideUserInterfaceStyle = .dark
    tabBar.delegate = self
    tabBar.tintColor = .white
    tabBar.unselectedItemTintColor = UIColor(white: 0.7, alpha: 1)
    // iOS 26 owns the Liquid Glass background and moving selection indicator.
    // A forced blur/opaque appearance would obscure that system material.
    if #available(iOS 26.0, *) {
      // Keep UIKit defaults, including Reduce Transparency/Reduce Motion.
    } else {
      let appearance = UITabBarAppearance()
      appearance.configureWithDefaultBackground()
      tabBar.standardAppearance = appearance
      tabBar.scrollEdgeAppearance = appearance
    }
    clipsToBounds = false
    let names = ["Inicio", "Listas", "Chats", "Perfil", "Buscar"]
    let symbols = ["house", "music.note.list", "bubble.left.and.bubble.right", "person.crop.circle", "magnifyingglass"]
    tabBar.items = zip(names, symbols).enumerated().map { index, pair in
      let item: UITabBarItem
      if ids[index] == "buscar" {
        item = UITabBarItem(tabBarSystemItem: .search, tag: index)
        item.title = nil
      } else {
        item = UITabBarItem(title: nil, image: UIImage(systemName: pair.1), tag: index)
        let selectedSymbols = ["house.fill", "music.note.list", "bubble.left.and.bubble.right.fill", "person.crop.circle.fill"]
        item.selectedImage = UIImage(systemName: selectedSymbols[index])
      }
      let configuration = UIImage.SymbolConfiguration(pointSize: 22, weight: .regular)
      item.image = item.image?.applyingSymbolConfiguration(configuration)
      item.selectedImage = item.selectedImage?.applyingSymbolConfiguration(configuration)
      if #unavailable(iOS 26.0) {
        item.imageInsets = UIEdgeInsets(top: 6, left: 0, bottom: -6, right: 0)
      }
      item.accessibilityIdentifier = "tab-\(ids[index])"
      item.accessibilityLabel = pair.0
      item.badgeColor = .white
      item.setBadgeTextAttributes([.foregroundColor: UIColor.black], for: .normal)
      return item
    }
    addSubview(tabBar)
  }

  override func layoutSubviews() { super.layoutSubviews(); tabBar.frame = bounds }
  func select(_ id: String) {
    guard let index = ids.firstIndex(of: id), let item = tabBar.items?[index],
      tabBar.selectedItem !== item else { return }
    // A React echo of a native tap must not restart UIKit's selection state.
    tabBar.selectedItem = item
  }
  func setUnread(_ value: Int) {
    let count = max(0, value)
    tabBar.items?[2].badgeValue = count > 0 ? (count > 99 ? "99+" : String(count)) : nil
    tabBar.items?[2].accessibilityValue = count > 0 ? "\(count) mensajes o solicitudes pendientes" : nil
  }
  func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
    guard ids.indices.contains(item.tag) else { return }
    onSelect(["id": ids[item.tag]])
  }
}

/// El contenido visual sigue en Yoga. Este UIButton ocupa su rectángulo sin
/// volver a medirlo, y posee la interacción/accesibilidad del control completo.
final class MediaActionView: ExpoView {
  let button = UIButton(type: .custom)
  let onActivate = EventDispatcher()
  let onLongActivate = EventDispatcher()
  let onHighlight = EventDispatcher()
  var role = "button"
  var selected = false
  private var held = false
  lazy var longGesture = UILongPressGestureRecognizer(target: self, action: #selector(longPressed(_:)))

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    button.addTarget(self, action: #selector(activate), for: .touchUpInside)
    button.addTarget(self, action: #selector(highlight), for: [.touchDown, .touchDragEnter])
    button.addTarget(self, action: #selector(unhighlight), for: [.touchUpInside, .touchUpOutside, .touchCancel, .touchDragExit])
    button.layer.cornerRadius = 10
    addSubview(button)
    longGesture.isEnabled = false
    button.addGestureRecognizer(longGesture)
  }
  override func layoutSubviews() { super.layoutSubviews(); button.frame = bounds }
  func updateTraits() {
    button.accessibilityTraits = role == "link" ? [.link] : [.button]
    if selected { button.accessibilityTraits.insert(.selected) }
    if !button.isEnabled { button.accessibilityTraits.insert(.notEnabled) }
  }
  private func event(_ local: CGPoint? = nil, pressed: Bool? = nil) -> [String: Any] {
    let local = local ?? CGPoint(x: bounds.midX, y: bounds.midY)
    let page = convert(local, to: nil)
    var result: [String: Any] = ["locationX": local.x, "locationY": local.y, "pageX": page.x, "pageY": page.y, "timestamp": Date().timeIntervalSince1970 * 1000]
    if let pressed { result["pressed"] = pressed }
    return result
  }
  @objc private func activate() { guard !held, button.isEnabled else { return }; onActivate(event()) }
  @objc private func highlight() { held = false; button.backgroundColor = UIColor.white.withAlphaComponent(0.1); onHighlight(event(pressed: true)) }
  @objc private func unhighlight() { button.backgroundColor = .clear; onHighlight(event(pressed: false)) }
  @objc private func longPressed(_ gesture: UILongPressGestureRecognizer) {
    switch gesture.state {
    case .began:
      guard button.isEnabled else { return }
      held = true
      onLongActivate(event(gesture.location(in: self)))
    case .ended, .cancelled, .failed:
      // Mantener la supresión hasta que terminen los eventos de este gesto;
      // la próxima activación accesible puede no emitir touchDown.
      DispatchQueue.main.async { [weak self] in self?.held = false }
    default:
      break
    }
  }
}
