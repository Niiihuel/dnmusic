import SwiftUI

/// Selector de flor: tipo (tulipán/orquídea) + variante (color/especie).
struct FlowerPicker: View {
    @Binding var type: FlowerType
    @Binding var variant: FlowerVariant
    var onChangeType: (FlowerType) -> Void

    var body: some View {
        VStack(spacing: 16) {
            Picker("Flor", selection: Binding(
                get: { type },
                set: { newType in
                    type = newType
                    onChangeType(newType)
                }
            )) {
                ForEach(FlowerType.allCases) { t in
                    Text("\(t.emoji)  \(t.displayName)").tag(t)
                }
            }
            .pickerStyle(.segmented)

            let variants = FlowerVariant.variants(for: type)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 12) {
                ForEach(variants) { v in
                    chip(for: v)
                }
            }
        }
    }

    private func chip(for v: FlowerVariant) -> some View {
        let selected = (variant == v)
        return Button {
            variant = v
        } label: {
            VStack(spacing: 6) {
                Text(type.emoji).font(.system(size: 30))
                Text(v.displayName).font(.caption2).lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(selected ? Color.pink.opacity(0.15) : Color.white,
                        in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14)
                .stroke(selected ? Color.pink : .black.opacity(0.08),
                        lineWidth: selected ? 2 : 1))
            .foregroundStyle(.primary)
        }
    }
}
