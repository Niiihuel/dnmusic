import Foundation
import FirebaseFirestore
import FirebaseFirestoreSwift
import Combine

/// Lee y escribe los mensajes del par en Firestore, en tiempo real.
@MainActor
final class FirestoreService: ObservableObject {
    @Published private(set) var messages: [FlowerMessage] = []
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private let db = Firestore.firestore()
    private let pairId: String
    private var listener: ListenerRegistration?

    init(pairId: String) {
        self.pairId = pairId
    }

    /// Colección de mensajes del par.
    private var messagesRef: CollectionReference {
        db.collection("pairs").document(pairId).collection("messages")
    }

    /// Descubre el `pairId` del usuario indicado (busca el par del que es miembro).
    static func resolvePairId(forUid uid: String) async throws -> String {
        let snapshot = try await Firestore.firestore()
            .collection("pairs")
            .whereField("memberUids", arrayContains: uid)
            .limit(to: 1)
            .getDocuments()
        guard let doc = snapshot.documents.first else {
            throw FirestoreError.pairNotFound
        }
        return doc.documentID
    }

    /// Empieza a escuchar los mensajes en tiempo real (del más nuevo al más viejo).
    func startListening() {
        stopListening()
        isLoading = true
        listener = messagesRef
            .order(by: "createdAt", descending: true)
            .addSnapshotListener { [weak self] snapshot, error in
                Task { @MainActor in
                    guard let self else { return }
                    self.isLoading = false
                    if let error {
                        self.errorMessage = "Error al cargar mensajes: \(error.localizedDescription)"
                        return
                    }
                    self.messages = snapshot?.documents.compactMap { doc in
                        try? doc.data(as: FlowerMessage.self)
                    } ?? []
                }
            }
    }

    func stopListening() {
        listener?.remove()
        listener = nil
    }

    /// Envía un mensaje nuevo. `createdAt` lo fija el servidor.
    func sendMessage(senderUid: String,
                     flowerType: FlowerType,
                     flowerVariant: FlowerVariant,
                     text: String) async throws {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw FirestoreError.emptyMessage
        }
        let message = FlowerMessage(senderUid: senderUid,
                                    flowerType: flowerType,
                                    flowerVariant: flowerVariant,
                                    text: trimmed)
        try messagesRef.addDocument(from: message)
    }

    /// Marca el mensaje como abierto (dispara la floración) y leído.
    func markOpened(_ message: FlowerMessage) async {
        guard message.readAt == nil, let id = message.id else { return }
        try? await messagesRef.document(id).updateData([
            "openedAt": FieldValue.serverTimestamp(),
            "readAt": FieldValue.serverTimestamp(),
        ])
    }

    /// Cantidad de mensajes que el usuario indicado aún no abrió.
    func unreadCount(forUid uid: String) -> Int {
        messages.filter { $0.senderUid != uid && $0.readAt == nil }.count
    }
}

enum FirestoreError: LocalizedError {
    case pairNotFound
    case emptyMessage

    var errorDescription: String? {
        switch self {
        case .pairNotFound:
            return "No se encontró el par. Verificá que tu uid esté en pairs/{pairId}.memberUids."
        case .emptyMessage:
            return "El mensaje está vacío."
        }
    }
}
