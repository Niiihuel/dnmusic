import SwiftUI

/// Contenedor principal con pestañas: el jardín (historial) y escribir una flor nueva.
struct MainTabView: View {
    @ObservedObject var firestore: FirestoreService
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            GardenView(firestore: firestore)
                .tabItem { Label("Jardín", systemImage: "leaf.fill") }
                .tag(0)

            ComposerView(firestore: firestore)
                .tabItem { Label("Escribir", systemImage: "square.and.pencil") }
                .tag(1)
        }
        .tint(.pink)
    }
}
