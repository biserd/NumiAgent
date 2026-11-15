import AuthenticationServices
import SwiftUI
import UniformTypeIdentifiers

@MainActor
final class SignInChallenge: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    func verify() async throws -> String {
        let state = UUID().uuidString.lowercased()
        var target = URLComponents(url: NumiAPI.url("/api/v1/auth/native-challenge"), resolvingAgainstBaseURL: false)!
        target.queryItems = [URLQueryItem(name: "state", value: state)]
        return try await withCheckedThrowingContinuation { continuation in
            let next = ASWebAuthenticationSession(url: target.url!, callbackURLScheme: "numiagent-auth") { url, error in
                Task { @MainActor in
                    self.session = nil
                    if let error {
                        continuation.resume(throwing: error)
                        return
                    }
                    guard let url, url.scheme == "numiagent-auth", url.host == "challenge",
                          let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
                          query.first(where: { $0.name == "state" })?.value == state,
                          let response = query.first(where: { $0.name == "challenge" })?.value,
                          !response.isEmpty, response.utf8.count <= 2048 else {
                        continuation.resume(throwing: NumiError.invalidResponse)
                        return
                    }
                    continuation.resume(returning: response)
                }
            }
            next.presentationContextProvider = self
            next.prefersEphemeralWebBrowserSession = true
            session = next
            if !next.start() {
                session = nil
                continuation.resume(throwing: NumiError.request(0, "The security check couldn’t open. Please try again."))
            }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .first(where: { $0.activationState == .foregroundActive })?.keyWindow ?? ASPresentationAnchor()
    }
}

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
