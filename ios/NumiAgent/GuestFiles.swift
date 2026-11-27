import SwiftUI
import UniformTypeIdentifiers

enum GuestFileAction: String, Identifiable {
    case backup = "Back up collection"
    case restore = "Restore backup"
    case csv = "Export spreadsheet"
    var id: Self { self }
}

private extension UTType {
    static let numiagentBackup = UTType(exportedAs: "com.numiagent.collection-backup", conformingTo: .data)
}

private struct GuestDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.numiagentBackup, .commaSeparatedText] }
    let bytes: Data

    init(bytes: Data) { self.bytes = bytes }
    init(configuration: ReadConfiguration) throws {
        guard let bytes = configuration.file.regularFileContents else { throw GuestStorageError.invalidBackup }
        self.bytes = bytes
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: bytes)
    }
}

struct GuestFiles: View {
    @ObservedObject var store: GuestStore
    let action: GuestFileAction
    @Environment(\.dismiss) private var dismiss
    @State private var backupKey = ""
    @State private var hasSavedKey = false
    @State private var restoreKey = ""
    @State private var restoreBytes: Data?
    @State private var preview: GuestArchive.Restore?
    @State private var privateFields: Set<String> = []
    @State private var importing = false
    @State private var exporting = false
    @State private var document: GuestDocument?
    @State private var working = false
    @State private var message: String?

    var body: some View {
        NavigationStack {
            Form {
                switch action {
                case .backup: backup
                case .restore: restore
                case .csv: csv
                }
                if working { ProgressView() }
                if let message { Text(message).accessibilityIdentifier("guest-file-message") }
            }
            .disabled(working)
            .navigationTitle(action.rawValue)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() }.disabled(working) } }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.numiagentBackup]) { result in
                do {
                    let url = try result.get()
                    let securityScope = url.startAccessingSecurityScopedResource()
                    defer { if securityScope { url.stopAccessingSecurityScopedResource() } }
                    guard let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize,
                          size <= GuestArchive.maxFile else { throw GuestStorageError.tooLarge }
                    restoreBytes = try Data(contentsOf: url)
                    preview = nil
                    restoreKey = ""
                    message = nil
                } catch { message = error.localizedDescription }
            }
            .fileExporter(isPresented: $exporting, document: document,
                          contentType: action == .csv ? .commaSeparatedText : .numiagentBackup,
                          defaultFilename: action == .csv ? "NumiAgent collection" : "NumiAgent backup") { result in
                switch result {
                case .success: message = action == .csv ? "Spreadsheet exported." : "Encrypted backup exported."
                case .failure(let error): message = error.localizedDescription
                }
            }
        }
    }

    private var backup: some View {
        Section {
            Text("An encrypted backup includes your saved pieces, private fields, photos, and unfinished drafts.")
            Text("Save the file outside this device, for example in iCloud Drive or on your Mac. Keep the recovery key separately. Without the key, you can’t restore the file.")
                .foregroundStyle(.secondary)
            if backupKey.isEmpty {
                Button("Create encrypted backup") { Task { await prepareBackup() } }
            } else {
                Text(backupKey).font(.system(.body, design: .monospaced)).textSelection(.enabled)
                    .accessibilityLabel("Recovery key")
                Toggle("I saved the recovery key separately", isOn: $hasSavedKey)
                Button("Save backup file") { exporting = true }.disabled(!hasSavedKey)
            }
        }
    }

    private var restore: some View {
        Section {
            Button("Choose .numiagent file") { importing = true }
            if let bytes = restoreBytes, preview == nil {
                SecureField("Recovery key", text: $restoreKey).textInputAutocapitalization(.never).autocorrectionDisabled()
                Button("Preview backup") { Task { await previewBackup(bytes) } }.disabled(restoreKey.isEmpty)
            }
            if let preview {
                let contents = preview.snapshot.collection
                Text("\(contents.pieces.count) saved pieces, \(contents.drafts.count) drafts, \(contents.photoIDs.count) photos")
                if store.active != nil { Text("The backup opens as a separate collection on this device.") }
                Button("Restore collection") {
                    do {
                        try store.restore(preview)
                        self.preview = nil
                        restoreBytes = nil
                        message = "Collection restored."
                    } catch { message = error.localizedDescription }
                }.buttonStyle(.borderedProminent)
            }
        }
    }

    private var csv: some View {
        Section {
            let items = store.active?.pieces ?? []
            Text("\(items.count) rows")
            Text((GuestCSV.standard + GuestCSV.optional.filter { privateFields.contains($0) }).joined(separator: " · "))
                .font(.footnote).foregroundStyle(.secondary)
            ForEach(GuestCSV.optional, id: \.self) { field in
                Toggle(field, isOn: Binding(get: { privateFields.contains(field) }, set: { enabled in
                    if enabled { privateFields.insert(field) } else { privateFields.remove(field) }
                }))
            }
            Button("Save CSV file") {
                document = GuestDocument(bytes: GuestCSV.make(items, privateFields: privateFields))
                exporting = true
            }
        } footer: {
            Text("This spreadsheet is readable and omits photos. Use an encrypted backup to restore the collection.")
        }
    }

    private func prepareBackup() async {
        working = true
        message = nil
        defer { working = false }
        do {
            let snapshot = try store.snapshot()
            let sealed = try await Task.detached { try GuestArchive.seal(snapshot) }.value
            document = GuestDocument(bytes: sealed.archive)
            backupKey = sealed.recoveryKey
        } catch { message = error.localizedDescription }
    }

    private func previewBackup(_ bytes: Data) async {
        let key = restoreKey
        working = true
        message = nil
        defer { working = false }
        do {
            preview = try await Task.detached { try GuestArchive.open(bytes, recoveryKey: key) }.value
            restoreKey = ""
        } catch { message = error.localizedDescription }
    }
}
