import SwiftUI

/// Pantalla raíz: muestra login o el contenido principal según el estado de sesión.
struct RootView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        Group {
            if appState.auth.isSignedIn {
                if let firestore = appState.firestore {
                    MainTabView(firestore: firestore)
                } else {
                    VStack(spacing: 16) {
                        ProgressView()
                        Text(appState.isActivatingPair
                             ? "Conectando tu jardín…"
                             : "Algo salió mal al conectar.")
                            .foregroundStyle(.secondary)
                    }
                }
            } else {
                AuthView()
            }
        }
        .preferredColorScheme(.light)
    }
}
