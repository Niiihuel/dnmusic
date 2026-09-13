import ExpoModulesCore
import SwiftUI
import UIKit

/// A single native surface. Audio, queue ownership and navigation stay in JS.
final class MediaMiniPlayerModel: ObservableObject {
  @Published var title = ""
  @Published var subtitle = ""
  @Published var artwork: String?
  @Published var playing = false
  @Published var busy = false
  @Published var canNext = false
  @Published var canPrevious = false
  @Published var deviceLabel = "Este dispositivo"
  @Published var remote = false
  var onOpen: () -> Void = {}
  var onPlayPause: () -> Void = {}
  var onNext: () -> Void = {}
  var onPrevious: () -> Void = {}
  var onDevices: () -> Void = {}
  var onOptions: () -> Void = {}
}

private struct MiniPlayerSurface: View {
  @ObservedObject var model: MediaMiniPlayerModel
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @ScaledMetric(relativeTo: .caption) private var cornerRadius: CGFloat = 24

  var body: some View {
    surface
      .preferredColorScheme(.dark)
      .tint(.white)
      .transaction { transaction in
        if reduceMotion { transaction.animation = nil }
      }
  }

  @ViewBuilder private var surface: some View {
    if #available(iOS 26.0, *), !reduceTransparency {
      controls.glassEffect(.regular, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    } else if reduceTransparency {
      controls.background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    } else {
      controls.background(.regularMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
  }

  private var controls: some View {
    HStack(spacing: 0) {
      Button(action: model.onOpen) {
        HStack(spacing: 10) {
          cover
          VStack(alignment: .leading, spacing: 2) {
            Text(model.title).font(.callout.weight(.semibold)).lineLimit(1)
            Text(model.subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.leading, 8)
        .padding(.trailing, 4)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Abrir reproductor: \(model.title), \(model.subtitle)")
      .accessibilityValue(model.deviceLabel)
      .contextMenu {
        Button(action: model.onOpen) { Label("Abrir reproductor", systemImage: "arrow.up.left.and.arrow.down.right") }
        Button(action: model.onPrevious) { Label("Anterior", systemImage: "backward.end.fill") }
          .disabled(!model.canPrevious)
        Button(action: model.onNext) { Label("Siguiente", systemImage: "forward.end.fill") }
          .disabled(!model.canNext)
        Button(action: model.onDevices) { Label("Dispositivos", systemImage: "airplay.audio") }
        Button(action: model.onOptions) { Label("Más opciones", systemImage: "ellipsis") }
      }
      .accessibilityAction(named: Text("Más opciones"), model.onOptions)
      .accessibilityAction(named: Text("Anterior")) { if model.canPrevious { model.onPrevious() } }

      action(symbol: model.remote ? "hifispeaker.fill" : "airplay.audio", label: "Dispositivos: \(model.deviceLabel)", action: model.onDevices)
        .accessibilityValue(model.deviceLabel)

      Button(action: model.onPlayPause) {
        ZStack {
          Image(systemName: model.playing && !model.remote ? "pause.fill" : "play.fill")
            .font(.title3.weight(.semibold))
            .opacity(model.busy ? 0 : 1)
          if model.busy { ProgressView().tint(.white).accessibilityHidden(true) }
        }
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(model.remote ? "Traer música a este dispositivo" : model.busy ? "Pausar carga" : model.playing ? "Pausar" : "Reproducir")
      .accessibilityValue(model.busy ? "Preparando audio" : "")
      // Pausing must stay available while a source is loading.

      action(symbol: "forward.end.fill", label: "Siguiente", action: { if model.canNext { model.onNext() } })
        .disabled(!model.canNext)
    }
    .padding(.vertical, 8)
    .padding(.trailing, 4)
    .foregroundStyle(.white)
  }

  private func action(symbol: String, label: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.body.weight(.medium))
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
  }

  private var cover: some View {
    MiniPlayerCover(uri: model.artwork)
  }
}

private struct MiniPlayerCover: View {
  let uri: String?
  @State private var image: UIImage?

  var body: some View {
    Group {
      if let image { Image(uiImage: image).resizable().scaledToFill() }
      else { Image(systemName: "music.note").foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity).background(Color.white.opacity(0.08)) }
    }
    .frame(width: 44, height: 44)
    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    .accessibilityHidden(true)
    .task(id: uri) {
      image = nil
      guard let uri, let url = URL(string: uri) else { return }
      let data: Data?
      if url.isFileURL {
        data = await Task.detached(priority: .utility) { try? Data(contentsOf: url) }.value
      } else {
        guard ["https", "http"].contains(url.scheme ?? ""),
          let (bytes, response) = try? await URLSession.shared.data(from: url),
          let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else { return }
        data = bytes
      }
      guard !Task.isCancelled, let data else { return }
      image = UIImage(data: data)
    }
  }
}

final class MediaMiniPlayerView: ExpoView {
  let model = MediaMiniPlayerModel()
  let onOpen = EventDispatcher()
  let onPlayPause = EventDispatcher()
  let onNext = EventDispatcher()
  let onPrevious = EventDispatcher()
  let onDevices = EventDispatcher()
  let onOptions = EventDispatcher()
  private var hostingController: UIHostingController<MiniPlayerSurface>!

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false
    model.onOpen = { [weak self] in self?.onOpen([:]) }
    model.onPlayPause = { [weak self] in self?.onPlayPause([:]) }
    model.onNext = { [weak self] in guard let self, self.model.canNext else { return }; self.onNext([:]) }
    model.onPrevious = { [weak self] in guard let self, self.model.canPrevious else { return }; self.onPrevious([:]) }
    model.onDevices = { [weak self] in self?.onDevices([:]) }
    model.onOptions = { [weak self] in self?.onOptions([:]) }
    hostingController = UIHostingController(rootView: MiniPlayerSurface(model: model))
    hostingController.view.backgroundColor = .clear
    // Yoga supplies the frame. SwiftUI never sends measured sizes back to RN.
    addSubview(hostingController.view)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    hostingController.view.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil, let parent = owningViewController() {
      guard hostingController.parent !== parent else { return }
      detachController()
      hostingController.view.removeFromSuperview()
      parent.addChild(hostingController)
      addSubview(hostingController.view)
      hostingController.view.frame = bounds
      hostingController.didMove(toParent: parent)
    } else { detachController() }
  }

  // UIKit's responder chain works with Fabric and with native containers.
  private func owningViewController() -> UIViewController? {
    var responder: UIResponder? = next
    while let current = responder {
      if let controller = current as? UIViewController { return controller }
      responder = current.next
    }
    return nil
  }

  private func detachController() {
    if hostingController.parent != nil {
      hostingController.willMove(toParent: nil)
      hostingController.view.removeFromSuperview()
      hostingController.removeFromParent()
    } else {
      hostingController.view.removeFromSuperview()
    }
  }
}
