import Foundation
import FirebaseFirestore
import FirebaseFirestoreSwift

/// Un mensaje que se envía como flor entre las dos personas del par.
struct FlowerMessage: Identifiable, Codable {
    /// Id del documento en Firestore (lo asigna el SDK).
    @DocumentID var id: String?

    /// uid del remitente (quién envía la flor).
    var senderUid: String

    /// Tipo y variante de la flor elegida al escribir.
    var flowerType: FlowerType
    var flowerVariant: FlowerVariant

    /// Texto del mensaje, revelado tras la floración.
    var text: String

    /// Momento de envío. Lo asigna el servidor (@ServerTimestamp) al crear.
    @ServerTimestamp var createdAt: Date?

    /// Momento en que el receptor abrió el mensaje (dispara la floración).
    var openedAt: Date?

    /// Momento en que el receptor terminó de leerlo.
    var readAt: Date?

    /// Devuelve `true` si el mensaje fue enviado por el usuario indicado.
    func isSentBy(_ uid: String) -> Bool { senderUid == uid }

    enum CodingKeys: String, CodingKey {
        case id, senderUid, flowerType, flowerVariant, text
        case createdAt, openedAt, readAt
    }
}

extension FlowerMessage {
    /// Constructor de conveniencia para enviar un mensaje nuevo.
    /// `createdAt` y `id` los asigna Firestore.
    init(senderUid: String,
         flowerType: FlowerType,
         flowerVariant: FlowerVariant,
         text: String) {
        self.id = nil
        self.senderUid = senderUid
        self.flowerType = flowerType
        self.flowerVariant = flowerVariant
        self.text = text
        self.createdAt = nil
        self.openedAt = nil
        self.readAt = nil
    }
}
