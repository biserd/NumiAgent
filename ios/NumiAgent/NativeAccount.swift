import SwiftUI
import UniformTypeIdentifiers

struct NativeAccountTools: View {
    let api: NumiAPI
    @State private var usage: AccountUsage?
    @State private var devices: [AccountDevice] = []
    @State private var selectedDevice: AccountDevice?
    @State private var error: String?
    @State private var busy = false
    @State private var exporter = false
    @State private var document: CatalogExport?
    @State private var type: UTType = .json
    @State private var filename = "numiagent"

    var body: some View {
        Form {
            Section("Export") {
                Button("Collection CSV") { Task { await export("/items/export.csv", as: .commaSeparatedText, name: "numiagent-collection") } }
                Button("Insurance inventory CSV") { Task { await export("/items/insurance.csv", as: .commaSeparatedText, name: "numiagent-insurance-inventory") } }
                Button("Account data JSON") { Task { await export("/me/export", as: .json, name: "numiagent") } }
            }
            .disabled(busy)
            if let usage {
                Section("Daily limits") {
                    ForEach(usage.meters) { meter in
                        LabeledContent(meterLabel(meter.action), value: "\(meter.used) of \(meter.limit)")
                    }
                }
            }
            Section("Sign-ins") {
                ForEach(devices) { device in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(device.current == 1 ? "This device" : "Other session")
                        Text(Date(timeIntervalSince1970: device.created).formatted())
                            .font(.footnote).foregroundStyle(.secondary)
                        if device.current != 1 {
                            Button("Sign out session", role: .destructive) { selectedDevice = device }
                        }
                    }
                }
            }
            if busy { ProgressView() }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("Account & exports")
        .task { await load() }
        .refreshable { await load() }
        .fileExporter(isPresented: $exporter, document: document, contentType: type, defaultFilename: filename) { result in
            if case .failure(let error) = result { self.error = error.localizedDescription }
            document = nil
        }
        .confirmationDialog("Sign out this session?", isPresented: Binding(
            get: { selectedDevice != nil }, set: { if !$0 { selectedDevice = nil } }
        ), titleVisibility: .visible, presenting: selectedDevice) { device in
            Button("Sign out session", role: .destructive) {
                Task {
                    do {
                        try await api.write("/me/sessions/" + device.id, method: "DELETE")
                        await load()
                    } catch { self.error = error.localizedDescription }
                }
            }
        }
    }

    private func load() async {
        error = nil
        do {
            usage = try await api.get("/me/usage")
            devices = try await api.get("/me/sessions")
        } catch { self.error = error.localizedDescription }
    }

    private func export(_ path: String, as type: UTType, name: String) async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            document = CatalogExport(data: try await api.download(path))
            self.type = type
            filename = name
            exporter = true
        } catch { self.error = error.localizedDescription }
    }

    private func meterLabel(_ action: String) -> String {
        switch action {
        case "ai": return "AI requests"
        case "upload_requests": return "Photo uploads"
        case "market": return "Market searches"
        default: return action
        }
    }
}

private struct CatalogExport: FileDocument {
    static let readableContentTypes: [UTType] = [.json, .commaSeparatedText]
    let data: Data

    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else { throw CocoaError(.fileReadCorruptFile) }
        self.data = data
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
