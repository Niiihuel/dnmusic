import SwiftUI

/// Pantalla que muestra la flor floreciendo y, al terminar, revela el mensaje.
/// El estilo de animación lo decide `FlowerAnimationService` según qué asset exista:
/// 3D (USDZ) > Lottie (MVP) > emoji (fallback). Así nunca se rompe aunque falten assets.
struct FlowerViewerView: View {
    let message: FlowerMessage
    let mine: Bool

    @Environment(\.dismiss) private var dismiss
    @State private var bloomed = false
    @State private var showMessage = false

    private var style: FlowerAnimationService.Style {
        FlowerAnimationService.style(for: message.flowerVariant)
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            LinearGradient(colors: message.flowerType.themeGradient,
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            VStack(spacing: 28) {
                Spacer()

                flowerStage
                    .frame(height: 260)

                if showMessage {
                    messageCard
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }

                Spacer()
            }
            .padding(.horizontal, 24)

            Button { dismiss() } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(.white.opacity(0.85))
            }
            .padding(20)
        }
        .task {
            // Pequeña pausa para que monte la escena y luego florece.
            try? await Task.sleep(nanoseconds: 200_000_000)
            bloomed = true
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            withAnimation(.easeInOut(duration: 0.5)) { showMessage = true }
        }
    }

    @ViewBuilder
    private var flowerStage: some View {
        switch style {
        case .sceneKit(let usdz):
            SceneKitFlowerView(usdz: usdz, flowerType: message.flowerType, bloomed: bloomed)
        case .lottie(let json):
            LottieFlowerView(json: json, flowerType: message.flowerType, bloomed: bloomed)
        case .emoji(let flowerType):
            EmojiFlowerView(flowerType: flowerType, bloomed: bloomed)
        }
    }

    private var messageCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(mine ? "Le enviaste" : "Te escribió")
                .font(.caption.bold())
                .foregroundStyle(.white.opacity(0.85))
            Text(message.text)
                .font(.body)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let date = message.createdAt {
                Text(date.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.8))
            }
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(.white.opacity(0.25)))
    }
}
