import Foundation

/// Decide qué animación de floración usar para cada flor.
/// Prioridad: 3D (USDZ fotorrealista) > Lottie (MVP 2D) > emoji (fallback).
enum FlowerAnimationService {

    enum Style: Equatable {
        /// 3D fotorrealista vía SceneKit (formato USDZ con materiales PBR).
        case sceneKit(usdz: String)
        /// Animación 2D vectorial (MVP).
        case lottie(json: String)
        /// Fallback mínimo si todavía no hay asset.
        case emoji(FlowerType)
    }

    static func style(for variant: FlowerVariant) -> Style {
        if usdzExists(variant) {
            return .sceneKit(usdz: variant.assetName)
        }
        if lottieExists(variant) {
            return .lottie(json: variant.assetName)
        }
        return .emoji(variant.flowerType)
    }

    static func usdzExists(_ variant: FlowerVariant) -> Bool {
        Bundle.main.url(forResource: variant.assetName, withExtension: "usdz") != nil
    }

    static func lottieExists(_ variant: FlowerVariant) -> Bool {
        Bundle.main.url(forResource: variant.assetName, withExtension: "json") != nil
    }
}
