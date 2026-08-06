import SwiftUI

/// Pantalla de login. La app tiene 2 usuarios fijos creados en Firebase.
struct AuthView: View {
    @EnvironmentObject private var auth: AuthService

    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.pink.opacity(0.85), Color.orange.opacity(0.55)],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 20) {
                Spacer()

                Text("🌷")
                    .font(.system(size: 84))
                    .padding(.bottom, -8)

                Text("Dany")
                    .font(.largeTitle.bold())
                    .foregroundStyle(.white)

                Text("Un jardín entre los dos")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.92))

                Spacer()

                VStack(spacing: 12) {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .fieldStyle()

                    SecureField("Contraseña", text: $password)
                        .textContentType(.password)
                        .fieldStyle()

                    if let error = auth.errorMessage {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button {
                        Task { await auth.signIn(email: email, password: password) }
                    } label: {
                        Group {
                            if auth.isLoading {
                                ProgressView().tint(.white)
                            } else {
                                Text("Entrar").bold()
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(.white.opacity(0.25), in: RoundedRectangle(cornerRadius: 16))
                        .foregroundStyle(.white)
                    }
                    .disabled(auth.isLoading)
                }
                .padding(.horizontal, 28)
                .padding(.bottom, 40)
            }
        }
    }
}

private extension View {
    func fieldStyle() -> some View {
        self
            .padding(14)
            .background(.white.opacity(0.92), in: RoundedRectangle(cornerRadius: 14))
    }
}
