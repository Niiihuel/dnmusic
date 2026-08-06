import SwiftUI

/// El jardín: historial de todas las flores (mensajes) del par, de la más nueva a la más vieja.
/// Al tocar una flor se abre el viewer y florece, revelando el mensaje.
struct GardenView: View {
    @ObservedObject var firestore: FirestoreService
    @EnvironmentObject private var appState: AppState
    @State private var openedMessage: FlowerMessage?

    private var myUid: String { appState.currentUid ?? "" }

    var body: some View {
        NavigationStack {
            ScrollView {
                if firestore.messages.isEmpty && !firestore.isLoading {
                    emptyState
                } else {
                    LazyVStack(spacing: 12) {
                        ForEach(firestore.messages) { message in
                            GardenCard(message: message, mine: message.isSentBy(myUid))
                                .contentShape(Rectangle())
                                .onTapGesture { openedMessage = message }
                        }
                    }
                    .padding()
                }
            }
            .background(backgroundGradient)
            .navigationTitle("Tu jardín")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { appState.auth.signOut() } label: {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .sheet(item: $openedMessage) { message in
                let mine = message.isSentBy(myUid)
                FlowerViewerView(message: message, mine: mine)
                    .task { if !mine { await firestore.markOpened(message) } }
            }
        }
    }

    private var backgroundGradient: some View {
        LinearGradient(
            colors: [Color(.systemBackground), Color.pink.opacity(0.08)],
            startPoint: .top, endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "leaf")
                .font(.system(size: 48))
                .foregroundStyle(.pink.opacity(0.6))
            Text("Todavía no hay flores")
                .font(.title3.bold())
            Text("Escribí el primer mensaje y elegí una flor.\nLas que recibas también aparecerán acá.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, minHeight: 360)
    }
}

private struct GardenCard: View {
    let message: FlowerMessage
    let mine: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Text(message.flowerType.emoji)
                .font(.system(size: 34))

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(mine ? "Tú enviaste" : "Te envió")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                    Spacer()
                    if !mine && message.readAt == nil {
                        Text("Nueva")
                            .font(.caption2.bold())
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(.pink, in: Capsule())
                            .foregroundStyle(.white)
                    }
                }
                Text(message.flowerVariant.displayName)
                    .font(.headline)
                if let date = message.createdAt {
                    Text(date.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(.white, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(.black.opacity(0.05)))
        .shadow(color: .black.opacity(0.05), radius: 8, y: 4)
    }
}
