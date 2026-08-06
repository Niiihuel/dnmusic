import Foundation
import Combine
import FirebaseAuth

/// Estado global de la app. Orquesta autenticación y, al entrar,
/// resuelve el par de la persona y conecta el stream de mensajes en tiempo real.
@MainActor
final class AppState: ObservableObject {

    let auth = AuthService()

    /// Servicio de mensajes. Existe solo mientras hay sesión activa.
    @Published var firestore: FirestoreService?

    @Published private(set) var isActivatingPair = false

    private var cancellables = Set<AnyCancellable>()

    init() {
        // Reacciona a login / logout. El closure de `sink` no está aislado,
        // así que saltamos al main actor para llamar a handleAuthChange.
        auth.$currentUser
            .receive(on: RunLoop.main)
            .sink { [weak self] user in
                Task { @MainActor in self?.handleAuthChange(user) }
            }
            .store(in: &cancellables)
    }

    private func handleAuthChange(_ user: User?) {
        if let user {
            activatePair(for: user.uid)
        } else {
            firestore?.stopListening()
            firestore = nil
        }
    }

    private func activatePair(for uid: String) {
        isActivatingPair = true
        Task { [weak self] in
            guard let self else { return }
            defer { self.isActivatingPair = false }
            do {
                let pairId = try await FirestoreService.resolvePairId(forUid: uid)
                let service = FirestoreService(pairId: pairId)
                service.startListening()
                self.firestore = service
            } catch {
                self.auth.errorMessage = "No se pudo conectar tu jardín: \(error.localizedDescription)"
            }
        }
    }

    var currentUid: String? { auth.currentUid }
}
