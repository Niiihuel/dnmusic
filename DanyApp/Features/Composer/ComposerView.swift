import SwiftUI

/// Pantalla para escribir un mensaje nuevo y elegir la flor que lo acompañará.
struct ComposerView: View {
    @ObservedObject var firestore: FirestoreService
    @EnvironmentObject private var appState: AppState

    @State private var text = ""
    @State private var selectedType: FlowerType = .tulipan
    @State private var selectedVariant: FlowerVariant = .tulipanRosa
    @State private var sending = false
    @State private var errorText: String?
    @FocusState private var isEditingText: Bool

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    FlowerPicker(type: $selectedType, variant: $selectedVariant) { newType in
                        selectedVariant = FlowerVariant.variants(for: newType).first ?? selectedVariant
                    }

                    previewCard

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Tu mensaje")
                            .font(.subheadline.bold())
                            .foregroundStyle(.secondary)
                        TextEditor(text: $text)
                            .frame(minHeight: 120)
                            .padding(8)
                            .background(.white, in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(.black.opacity(0.08)))
                            .focused($isEditingText)
                            .textInputAutocapitalization(.sentences)
                    }

                    sendButton
                }
                .padding()
            }
            .background(Color.pink.opacity(0.05).ignoresSafeArea())
            .navigationTitle("Nueva flor")
            .navigationBarTitleDisplayMode(.inline)
            .alert("No se pudo enviar", isPresented: Binding(get: { errorText != nil },
                                                             set: { _ in errorText = nil })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorText ?? "")
            }
        }
    }

    private var previewCard: some View {
        HStack(spacing: 14) {
            Text(selectedType.emoji).font(.system(size: 44))
            VStack(alignment: .leading, spacing: 2) {
                Text(selectedVariant.displayName).font(.headline)
                Text("Así se verá cuando la abra")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding()
        .background(.white, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(.black.opacity(0.05)))
    }

    private var sendButton: some View {
        Button {
            Task { await send() }
        } label: {
            Group {
                if sending { ProgressView().tint(.white) }
                else { Text("Enviar \(selectedType.emoji)") }
            }
            .frame(maxWidth: .infinity)
            .padding()
            .background(canSend ? Color.pink : Color.gray.opacity(0.4),
                        in: RoundedRectangle(cornerRadius: 16))
            .foregroundStyle(.white.bold())
        }
        .disabled(!canSend || sending)
    }

    private func send() async {
        guard let uid = appState.currentUid, canSend, !sending else { return }
        sending = true
        defer { sending = false }
        do {
            try await firestore.sendMessage(senderUid: uid,
                                            flowerType: selectedType,
                                            flowerVariant: selectedVariant,
                                            text: text)
            text = ""
            selectedType = .tulipan
            selectedVariant = .tulipanRosa
            isEditingText = false
        } catch {
            errorText = error.localizedDescription
        }
    }
}
