import PhotosUI
import SwiftUI
import UIKit

private struct CaptureDraft: Codable {
    var id = UUID()
    var photos: [UUID] = []
    var uploaded: Set<UUID> = []
    var submittedName: String?
    var submittedAnalysis: Bool?
    var submittedAutoCatalog: Bool?
    var lastUploadedBatch: String?
}

@MainActor
private final class CaptureDraftStore: ObservableObject {
    static let maximumPhotos = 20
    @Published private(set) var draft = CaptureDraft()
    @Published private(set) var error: String?
    private let directory: URL?

    init(account: Account?) {
        do {
            directory = try Self.location(account?.id)
        } catch {
            directory = nil
            self.error = error.localizedDescription
            return
        }
        if let directory {
            do {
                let manifest = directory.appending(path: "batch.json")
                if FileManager.default.fileExists(atPath: manifest.path) {
                    draft = try JSONDecoder().decode(CaptureDraft.self, from: Data(contentsOf: manifest))
                }
            } catch {
                self.error = "The saved draft could not be read."
            }
        }
    }

    private static func location(_ accountID: String?) throws -> URL? {
        guard let accountID, let id = UUID(uuidString: accountID) else { return nil }
        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                              appropriateFor: nil, create: true)
        return root.appending(path: "CaptureDrafts", directoryHint: .isDirectory)
            .appending(path: id.uuidString, directoryHint: .isDirectory)
    }

    static func remove(accountID: String) throws {
        if let directory = try location(accountID), FileManager.default.fileExists(atPath: directory.path) {
            try FileManager.default.removeItem(at: directory)
        }
    }

    private func prepareDirectory() throws -> URL {
        guard var directory else { throw CaptureError.storage }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                                attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        var attributes = URLResourceValues()
        attributes.isExcludedFromBackup = true
        try directory.setResourceValues(attributes)
        return directory
    }

    private func save(_ updated: CaptureDraft) throws {
        let directory = try prepareDirectory()
        try JSONEncoder().encode(updated).write(to: directory.appending(path: "batch.json"),
                                                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        draft = updated
    }

    func photo(_ id: UUID) -> URL? { directory?.appending(path: id.uuidString + ".jpg") }

    func append(_ image: UIImage) throws {
        guard draft.submittedName == nil, draft.photos.count < Self.maximumPhotos else {
            throw CaptureError.tooMany
        }
        let id = UUID()
        let target = try prepareDirectory().appending(path: id.uuidString + ".jpg")
        let data = try Self.jpeg(image)
        try data.write(to: target, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        var updated = draft
        updated.photos.append(id)
        do { try save(updated) }
        catch {
            try? FileManager.default.removeItem(at: target)
            throw error
        }
    }

    func removePhoto(_ id: UUID) throws {
        guard draft.submittedName == nil else { return }
        var updated = draft
        updated.photos.removeAll { $0 == id }
        try save(updated)
        if let photo = photo(id) { try? FileManager.default.removeItem(at: photo) }
    }

    func upload(api: NumiAPI) async throws -> String {
        var updated = draft
        if updated.submittedName == nil {
            updated.submittedName = "Photo import · " + Date.now.formatted(date: .abbreviated, time: .shortened)
            updated.submittedAnalysis = true
            updated.submittedAutoCatalog = true
            try save(updated)
        }
        guard let batchName = updated.submittedName, let batchAnalysis = updated.submittedAnalysis else {
            throw CaptureError.storage
        }
        try await api.createImport(id: updated.id, name: batchName, analyze: batchAnalysis,
                                   autoCatalog: updated.submittedAutoCatalog ?? false)
        for id in updated.photos where !updated.uploaded.contains(id) {
            guard let photo = photo(id) else { throw CaptureError.storage }
            try await api.uploadPhoto(Data(contentsOf: photo), batch: updated.id)
            updated.uploaded.insert(id)
            try save(updated)
        }
        let batchID = updated.id.uuidString.lowercased()
        try save(CaptureDraft(lastUploadedBatch: batchID))
        for id in updated.photos {
            if let photo = photo(id) { try? FileManager.default.removeItem(at: photo) }
        }
        return batchID
    }

    private static func jpeg(_ image: UIImage) throws -> Data {
        let size = image.size
        guard size.width > 0, size.height > 0 else { throw CaptureError.unsupported }
        let ratio = min(1, 2048 / max(size.width, size.height))
        let dimensions = CGSize(width: max(1, floor(size.width * ratio)), height: max(1, floor(size.height * ratio)))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let data = UIGraphicsImageRenderer(size: dimensions, format: format).jpegData(withCompressionQuality: 0.82) { renderer in
            UIColor.white.setFill()
            renderer.fill(CGRect(origin: .zero, size: dimensions))
            image.draw(in: CGRect(origin: .zero, size: dimensions))
        }
        guard data.count <= 6 * 1024 * 1024 else { throw CaptureError.unsupported }
        return data
    }
}

private enum CaptureError: LocalizedError {
    case storage, unsupported, tooMany

    var errorDescription: String? {
        switch self {
        case .storage: return "NumiAgent couldn’t access the photo draft on this device."
        case .unsupported: return "This photo could not be imported. Choose a different image."
        case .tooMany: return "Finish the current batch before adding more photos."
        }
    }
}

struct CaptureScreen: View {
    let api: NumiAPI
    let account: Account?
    let onUpload: ((String) -> Void)?
    @StateObject private var store: CaptureDraftStore
    @State private var selection: [PhotosPickerItem] = []
    @State private var camera = false
    @State private var capturedPhoto: UIImage?
    @State private var busy = false
    @State private var error: String?
    @State private var uploadedBatch: String?
    @State private var demoPhoto = PreviewLaunch.screen == .capture
    @State private var demoResult = PreviewLaunch.screen == .capture

    init(api: NumiAPI, account: Account?, onUpload: ((String) -> Void)? = nil) {
        self.api = api
        self.account = account
        self.onUpload = onUpload
        _store = StateObject(wrappedValue: CaptureDraftStore(account: account))
    }

    var body: some View {
        if onUpload != nil { captureForm }
        else {
            NavigationStack {
                captureForm.navigationDestination(item: $uploadedBatch) { id in
                    ImportReview(api: api, batchID: id)
                }
            }
        }
    }

    private var captureForm: some View {
        List {
            if account == nil {
                if PreviewLaunch.screen == .photoReview {
                    NavigationLink("Open example photo batch") {
                        ImportReview(api: api, batchID: "demo-photo-batch", previewBatch: PhotoImport.demoAutomatic)
                    }
                }
                Section("Demo photo review") {
                    Button("Add sample photo") { demoPhoto = true }
                    if demoPhoto {
                        Image("DemoCoin").resizable().scaledToFit().frame(maxHeight: onUpload == nil ? 210 : 330)
                            .accessibilityLabel("Illustrative Roman coin")
                        Button("Preview identification") { demoResult = true }
                    }
                    if demoResult {
                        LabeledContent("Example candidate", value: "Roman bronze coin")
                        Text("Review the image and catalog reference before accepting a suggestion.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
            } else {
                Section {
                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        Button { camera = true } label: { Label("Take a photo", systemImage: "camera") }
                            .disabled(busy || store.draft.submittedName != nil)
                    }
                    let available = CaptureDraftStore.maximumPhotos - store.draft.photos.count
                    PhotosPicker(selection: $selection, maxSelectionCount: max(1, available), matching: .images) {
                        Label("Choose photos", systemImage: "photo.on.rectangle")
                    }
                    .disabled(busy || store.draft.submittedName != nil || available == 0)
                } footer: {
                    Text("Photos upload for cloud AI identification as soon as you add them. Clear matches go straight to your collection. Choose one photo per item with the date visible.")
                }
                if !store.draft.photos.isEmpty {
                    Section("On this device") {
                        ForEach(store.draft.photos, id: \.self) { id in
                            HStack {
                                if let url = store.photo(id), let image = UIImage(contentsOfFile: url.path) {
                                    Image(uiImage: image).resizable().scaledToFill()
                                        .frame(width: 64, height: 56).clipped().accessibilityHidden(true)
                                }
                                Text(store.draft.uploaded.contains(id) ? "Uploaded" : "Ready to upload")
                                Spacer()
                                if store.draft.submittedName == nil {
                                    Button("Remove photo", systemImage: "trash", role: .destructive) {
                                        record { try store.removePhoto(id) }
                                    }
                                    .labelStyle(.iconOnly)
                                    .buttonStyle(.borderless)
                                    .disabled(busy)
                                }
                            }
                        }
                    }
                    Section {
                        if busy, store.draft.submittedName != nil {
                            ProgressView(value: Double(store.draft.uploaded.count), total: Double(store.draft.photos.count)) {
                                Text("Uploading \(store.draft.uploaded.count) of \(store.draft.photos.count) photos")
                            }
                        } else if !busy {
                            Button("Resume upload", systemImage: "arrow.clockwise") {
                                Task { await upload() }
                            }
                            .buttonStyle(.borderedProminent)
                        }
                    }
                }
                if onUpload == nil {
                    Section {
                        if let last = store.draft.lastUploadedBatch {
                            NavigationLink {
                                ImportReview(api: api, batchID: last)
                            } label: {
                                Label("View latest import", systemImage: "arrow.right.circle.fill")
                            }
                            .disabled(busy)
                        }
                        NavigationLink("All photo imports") { ImportHistory(api: api) }.disabled(busy)
                    }
                }
            }
            if busy && store.draft.submittedName == nil { ProgressView("Preparing photos") }
            if let message = error ?? store.error { Text(message).foregroundStyle(.red) }
        }
        .navigationTitle(onUpload == nil ? "Capture" : "New photo import")
        .fullScreenCover(isPresented: $camera, onDismiss: importCapturedPhoto) {
            CameraPicker { image in
                capturedPhoto = image
                camera = false
            }
            .ignoresSafeArea()
        }
        .onChange(of: selection) { _, picks in
            guard !picks.isEmpty else { return }
            Task { await addPhotos(picks) }
        }
    }

    private func importCapturedPhoto() {
        guard let image = capturedPhoto else { return }
        capturedPhoto = nil
        record { try store.append(image) }
        if error == nil { Task { await upload() } }
    }

    private func record(_ operation: () throws -> Void) {
        error = nil
        do { try operation() }
        catch { self.error = error.localizedDescription }
    }

    private func addPhotos(_ picks: [PhotosPickerItem]) async {
        busy = true
        error = nil
        for pick in picks {
            do {
                guard let data = try await pick.loadTransferable(type: Data.self), let image = UIImage(data: data) else {
                    throw CaptureError.unsupported
                }
                try store.append(image)
            } catch {
                self.error = error.localizedDescription
            }
        }
        selection = []
        busy = false
        if error == nil { await upload() }
    }

    private func upload() async {
        guard !busy, !store.draft.photos.isEmpty else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let id = try await store.upload(api: api)
            if let onUpload { onUpload(id) }
            else { uploadedBatch = id }
        } catch { self.error = error.localizedDescription }
    }
}

@MainActor
func removeCaptureDrafts(for accountID: String) throws {
    try CaptureDraftStore.remove(accountID: accountID)
}

private struct CameraPicker: UIViewControllerRepresentable {
    let completion: (UIImage?) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(completion: completion) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let camera = UIImagePickerController()
        camera.sourceType = .camera
        camera.delegate = context.coordinator
        return camera
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let completion: (UIImage?) -> Void
        init(completion: @escaping (UIImage?) -> Void) { self.completion = completion }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            completion(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { completion(nil) }
    }
}
