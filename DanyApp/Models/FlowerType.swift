import SwiftUI

/// Tipo de flor que acompaña un mensaje.
enum FlowerType: String, Codable, CaseIterable, Identifiable {
    case tulipan
    case orquidea

    var id: String { rawValue }

    /// Nombre para mostrar en la UI.
    var displayName: String {
        switch self {
        case .tulipan:  return "Tulipán"
        case .orquidea: return "Orquídea"
        }
    }

    /// Emoji provisional mientras no llega el modelo 3D final.
    var emoji: String {
        switch self {
        case .tulipan:  return "🌷"
        case .orquidea: return "🪷"
        }
    }

    /// Gradiente de color de tema de la flor (fondos, botones, acentos).
    var themeGradient: [Color] {
        switch self {
        case .tulipan:
            return [Color(red: 0.95, green: 0.42, blue: 0.55),
                    Color(red: 0.99, green: 0.72, blue: 0.80)]
        case .orquidea:
            return [Color(red: 0.72, green: 0.52, blue: 0.86),
                    Color(red: 0.93, green: 0.80, blue: 0.96)]
        }
    }
}

/// Variante (color / especie) concreta de una flor.
/// Cada variante mapea a un asset de animación (Lottie o USDZ) por su `assetName`.
enum FlowerVariant: String, Codable, CaseIterable, Identifiable {
    // Tulipanes
    case tulipanRosa
    case tulipanAmarillo
    case tulipanBlanco
    // Orquídeas
    case orquideaBlanca
    case orquideaMorada
    case orquideaRosa

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .tulipanRosa:      return "Tulipán rosa"
        case .tulipanAmarillo:  return "Tulipán amarillo"
        case .tulipanBlanco:    return "Tulipán blanco"
        case .orquideaBlanca:   return "Orquídea blanca"
        case .orquideaMorada:   return "Orquídea morada"
        case .orquideaRosa:     return "Orquídea rosa"
        }
    }

    /// Tipo de flor al que pertenece.
    var flowerType: FlowerType {
        switch self {
        case .tulipanRosa, .tulipanAmarillo, .tulipanBlanco:
            return .tulipan
        case .orquideaBlanca, .orquideaMorada, .orquideaRosa:
            return .orquidea
        }
    }

    /// Nombre del asset de floración sin extensión.
    /// - MVP (Lottie):  `DanyApp/Resources/Anim/\(assetName).json`
    /// - 3D (RealityKit): `DanyApp/Resources/Models/\(assetName).usdz`
    var assetName: String { rawValue }

    /// Variantes disponibles para un tipo de flor dado.
    static func variants(for type: FlowerType) -> [FlowerVariant] {
        allCases.filter { $0.flowerType == type }
    }
}
