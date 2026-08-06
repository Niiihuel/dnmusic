import Foundation
import FirebaseAuth
import Combine

/// Maneja la autenticación con Firebase. La app tiene 2 usuarios fijos
/// (vos y ella) creados manualmente en la consola de Firebase.
@MainActor
final class AuthService: ObservableObject {
    @Published private(set) var currentUser: User? = nil
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private var listener: AuthStateDidChangeListenerHandle?

    init() {
        listener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            // El listener de Firebase no garantiza el actor; saltamos al main.
            Task { @MainActor in self?.currentUser = user }
        }
    }

    deinit {
        if let listener {
            Auth.auth().removeStateDidChangeListener(listener)
        }
    }

    var currentUid: String? { currentUser?.uid }
    var isSignedIn: Bool { currentUser != nil }

    func signIn(email: String, password: String) async {
        guard !email.isEmpty, !password.isEmpty else {
            errorMessage = "Completá email y contraseña."
            return
        }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            _ = try await Auth.auth().signIn(withEmail: email, password: password)
        } catch {
            errorMessage = Self.friendlyMessage(for: error)
        }
    }

    func signOut() {
        do {
            try Auth.auth().signOut()
        } catch {
            errorMessage = "No se pudo cerrar sesión."
        }
    }

    private static func friendlyMessage(for error: Error) -> String {
        let ns = error as NSError
        if let code = AuthErrorCode(rawValue: ns.code) {
            switch code {
            case .invalidEmail:
                return "El email no es válido."
            case .wrongPassword, .userNotFound, .invalidCredential:
                return "Email o contraseña incorrectos."
            case .networkError, .internalError:
                return "Sin conexión. Revisá tu internet e intentá de nuevo."
            case .tooManyRequests:
                return "Demasiados intentos. Esperá unos minutos."
            default:
                break
            }
        }
        return "No se pudo iniciar sesión. Intentá de nuevo."
    }
}
