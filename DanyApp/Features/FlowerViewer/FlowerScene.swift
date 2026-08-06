import SwiftUI
import SceneKit
import Lottie

// MARK: - Animación de floración por estilo
//
// Tres implementaciones intercambiables. FlowerViewerView elige cuál usar según
// qué asset esté presente en el bundle (ver FlowerAnimationService).

// MARK: Emoji (fallback — Fase 1)
/// Floración con emoji mientras no llegan los assets. Crece y "florece" con un spring.
struct EmojiFlowerView: View {
    let flowerType: FlowerType
    let bloomed: Bool

    var body: some View {
        Text(flowerType.emoji)
            .font(.system(size: bloomed ? 170 : 64))
            .scaleEffect(bloomed ? 1 : 0.55)
            .opacity(bloomed ? 1 : 0.7)
            .rotation3DEffect(.degrees(bloomed ? 0 : 35), axis: (x: 1, y: 0, z: 0))
            .animation(.spring(response: 0.95, dampingFraction: 0.62), value: bloomed)
            .shadow(color: .black.opacity(0.2), radius: 12, y: 6)
    }
}

// MARK: Lottie (MVP — Fase 2)
/// Floración vectorial 2D. `bloomed` la reproduce de capullo a flor abierta.
/// Si el asset JSON no existe todavía, degrada a emoji de la flor correcta.
struct LottieFlowerView: View {
    let json: String
    let flowerType: FlowerType
    let bloomed: Bool

    var body: some View {
        if let animation = LottieAnimation.named(json) {
            LottieView(animation: animation)
                .playbackMode(bloomed
                              ? .playing(.toProgress(1, loopMode: .playOnce))
                              : .paused(at: .progress(0)))
                .frame(height: 240)
        } else {
            EmojiFlowerView(flowerType: flowerType, bloomed: bloomed)
        }
    }
}

// MARK: SceneKit (3D fotorrealista — Fase 4)
/// Floración 3D a partir de un modelo USDZ. Permite orbitar con el dedo.
/// En Fase 4 se conectará el morph capullo→flor; por ahora carga el modelo si existe.
struct SceneKitFlowerView: View {
    let usdz: String
    let flowerType: FlowerType
    let bloomed: Bool

    var body: some View {
        if let scene = Self.loadScene(named: usdz) {
            // SwiftUI SceneView usa init(scene:pointOfView:options:) con un OptionSet.
            SceneView(
                scene: scene,
                pointOfView: nil,
                options: [.allowsCameraControl, .autoenablesDefaultLighting]
            )
            .scaleEffect(bloomed ? 1 : 0.5)
            .opacity(bloomed ? 1 : 0.6)
            .animation(.spring(response: 1.0, dampingFraction: 0.7), value: bloomed)
        } else {
            // Modelo todavía no agregado: degradar a emoji de la flor correcta.
            EmojiFlowerView(flowerType: flowerType, bloomed: bloomed)
        }
    }

    static func loadScene(named name: String) -> SCNScene? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "usdz") else {
            return nil
        }
        return try? SCNScene(url: url, options: [.checkConsistency: true])
    }
}
