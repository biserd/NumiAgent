import PhotosUI
import SwiftUI
import UIKit
import Vision

private struct CaptureDraft: Codable {
    var id = UUID()
    var photos: [UUID] = []
    var uploaded: Set<UUID> = []
    var submittedName: String?
    var submittedAnalysis: Bool?
    var submittedAutoCatalog: Bool?
    var paired: Bool?
    var expectedPhotos: Int?
    var warnings: [UUID: String]?
    var lastUploadedBatch: String?

    var oneItem: Bool { paired ?? photos.isEmpty }
}

@MainActor
private final class CaptureDraftStore: ObservableObject {
    static let maximumPhotos = 20
    static let maximumItemPhotos = 5
    @Published private(set) var draft = CaptureDraft()
    @Published private(set) var error: String?
    private let directory: URL?

    init(account: Account?) {
        do {
            #if DEBUG
            if PreviewLaunch.screen == .photoReview {
                directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString, directoryHint: .isDirectory)
                return
            }
            #endif
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

    var available: Int {
        (draft.oneItem ? Self.maximumItemPhotos : Self.maximumPhotos) - draft.photos.count
    }

    func setOneItem(_ oneItem: Bool) throws {
        guard draft.submittedName == nil, !oneItem || draft.photos.count <= Self.maximumItemPhotos else { return }
        var updated = draft
        updated.paired = oneItem
        try save(updated)
    }

    func append(_ image: UIImage) throws {
        guard draft.submittedName == nil, available > 0 else { throw CaptureError.tooMany }
        try put(image, replacing: nil)
    }

    func replace(_ id: UUID, with image: UIImage) throws {
        guard draft.submittedName == nil, draft.photos.contains(id) else { return }
        try put(image, replacing: id)
    }

    private func put(_ image: UIImage, replacing existing: UUID?) throws {
        let data = try Self.jpeg(image)
        try rejectDuplicate(data, except: existing)
        let directory = try prepareDirectory()
        var updated = draft
        updated.paired = draft.oneItem
        let id = UUID()
        let target = directory.appending(path: id.uuidString + ".jpg")
        try data.write(to: target, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        if let existing, let index = updated.photos.firstIndex(of: existing) {
            updated.photos[index] = id
            updated.warnings?.removeValue(forKey: existing)
        } else {
            updated.photos.append(id)
        }
        var warnings = updated.warnings ?? [:]
        warnings[id] = PhotoClarity.warning(for: image)
        updated.warnings = warnings
        do {
            try save(updated)
        } catch {
            try? FileManager.default.removeItem(at: target)
            throw error
        }
        if let existing, let old = photo(existing) { try? FileManager.default.removeItem(at: old) }
    }

    private func rejectDuplicate(_ data: Data, except existing: UUID?) throws {
        for id in draft.photos where id != existing {
            if let url = photo(id), try Data(contentsOf: url) == data { throw CaptureError.duplicate }
        }
    }

    func removePhoto(_ id: UUID) throws {
        guard draft.submittedName == nil else { return }
        var updated = draft
        updated.photos.removeAll { $0 == id }
        updated.warnings?.removeValue(forKey: id)
        try save(updated)
        if let photo = photo(id) { try? FileManager.default.removeItem(at: photo) }
    }

    func upload(api: NumiAPI) async throws -> String {
        var updated = draft
        if updated.submittedName == nil {
            var seen = Set<Data>()
            for id in updated.photos {
                guard let url = photo(id) else { throw CaptureError.storage }
                guard seen.insert(try Data(contentsOf: url)).inserted else { throw CaptureError.duplicate }
            }
            let label = updated.oneItem ? "One item" : "Photo import"
            updated.submittedName = label + " · " + Date.now.formatted(date: .abbreviated, time: .shortened)
            updated.submittedAnalysis = true
            updated.submittedAutoCatalog = true
            updated.expectedPhotos = updated.photos.count
            try save(updated)
        }
        guard let batchName = updated.submittedName, let batchAnalysis = updated.submittedAnalysis else {
            throw CaptureError.storage
        }
        try await api.createImport(id: updated.id, name: batchName, analyze: batchAnalysis,
                                   autoCatalog: updated.submittedAutoCatalog ?? false, paired: updated.paired == true,
                                   expectedPhotos: updated.expectedPhotos)
        for (index, id) in updated.photos.enumerated() where !updated.uploaded.contains(id) {
            guard let photo = photo(id) else { throw CaptureError.storage }
            let side = updated.paired == true ? ["obverse", "reverse"].dropFirst(index).first : nil
            try await api.uploadPhoto(Data(contentsOf: photo), batch: updated.id, side: side)
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
    case storage, unsupported, tooMany, duplicate

    var errorDescription: String? {
        switch self {
        case .storage: return "NumiAgent couldn’t access the photo draft on this device."
        case .unsupported: return "This photo could not be imported. Choose a different image."
        case .tooMany: return "This draft has reached its photo limit."
        case .duplicate: return "This photo is already in the draft. Choose a different view or remove the duplicate."
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
    @State private var retakingPhoto: UUID?
    @State private var capturedPhoto: UIImage?
    @State private var busy = false
    @State private var error: String?
    @State private var uploadedBatch: String?
    @State private var previewDraft = false
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
                    ImportReview(api: api, batchID: id, previewBatch: previewDraft ? PhotoImport.demoAutomatic : nil)
                }
            }
        }
    }

    private var captureForm: some View {
        List {
            if account == nil && !previewDraft {
                if PreviewLaunch.screen == .photoReview {
                    NavigationLink("Open example photo batch") {
                        ImportReview(api: api, batchID: "demo-photo-batch", previewBatch: PhotoImport.demoAutomatic)
                    }
                    #if DEBUG
                    Button("Preview a photo draft") {
                        record {
                            try store.append(previewImage(size: 64, tint: .systemBlue))
                            try store.append(previewImage(size: 600, tint: .systemGray))
                            previewDraft = true
                        }
                    }
                    #endif
                }
                Section("Demo photo review") {
                    Button("Add sample photo") { demoPhoto = true }
                    if demoPhoto {
                        Image("DemoNickel").resizable().scaledToFit().frame(maxHeight: onUpload == nil ? 210 : 330)
                            .accessibilityLabel("Reverse of a Jefferson nickel")
                        Text("United States Mint image.").font(.caption).foregroundStyle(.secondary)
                        Button("Preview identification") { demoResult = true }
                    }
                    if demoResult {
                        LabeledContent("Example candidate", value: "Jefferson nickel")
                        Text("Review the image and catalog reference before accepting a suggestion.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
            } else {
                Section {
                    Picker("Photos are of", selection: Binding(get: { store.draft.oneItem }, set: { oneItem in
                        record { try store.setOneItem(oneItem) }
                    })) {
                        Text("One item").tag(true)
                        Text("Different items").tag(false)
                    }
                    .pickerStyle(.segmented)
                    .disabled(busy || store.draft.submittedName != nil || store.draft.photos.count > CaptureDraftStore.maximumItemPhotos)
                    Text(store.draft.oneItem ? "Add the front, back, or close-ups of one coin or banknote." :
                         "Add one photo per coin or banknote.")
                        .font(.subheadline).foregroundStyle(.secondary)
                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        Button("Take photo", systemImage: "camera") { startCamera() }
                            .disabled(!canAddPhotos)
                    }
                    PhotosPicker(selection: $selection, maxSelectionCount: max(1, store.available),
                                 selectionBehavior: .ordered, matching: .images) {
                        Label("Add photos", systemImage: "photo.on.rectangle")
                    }
                    .disabled(!canAddPhotos)
                    #if DEBUG
                    if previewDraft {
                        Button("Add a sample close-up") {
                            record { try store.append(previewImage(size: 600, tint: .systemGreen)) }
                        }.disabled(!canAddPhotos)
                    }
                    #endif
                } header: {
                    Text("Coins and banknotes")
                } footer: {
                    Text("Use even light and focus on the lettering and date. Include the whole coin or note in the first photo.")
                }
                if !store.draft.photos.isEmpty {
                    Section(store.draft.submittedName == nil ? "Photo draft" : "Photos") {
                        ForEach(Array(store.draft.photos.enumerated()), id: \.element) { index, id in
                            draftRow(id, number: index + 1)
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
            if store.draft.photos.isEmpty, let message = error ?? store.error { Text(message).foregroundStyle(.red) }
        }
        .navigationTitle(onUpload == nil ? "Capture" : "New photo import")
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !store.draft.photos.isEmpty { identifyBar }
        }
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

    private var canAddPhotos: Bool { !busy && store.draft.submittedName == nil && store.available > 0 }

    private var identifyBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let message = error ?? store.error { Text(message).font(.footnote).foregroundStyle(.red) }
            if busy, store.draft.submittedName != nil {
                ProgressView(value: Double(store.draft.uploaded.count), total: Double(store.draft.photos.count)) {
                    Text("Uploading \(store.draft.uploaded.count) of \(store.draft.photos.count) photos")
                }
            } else {
                let count = store.draft.photos.count
                Text(count == 1 ? "1 photo in this draft" : "\(count) photos in this draft")
                    .font(.subheadline.weight(.semibold))
                Text("Identify uploads your photos for AI and saves clear matches.").font(.footnote).foregroundStyle(.secondary)
                Button {
                    startIdentification()
                } label: {
                    Label(store.draft.submittedName == nil ? "Identify" : "Resume identification", systemImage: "sparkles")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).disabled(busy)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20).padding(.vertical, 12)
        .background(.regularMaterial)
    }

    private func draftRow(_ id: UUID, number: Int) -> some View {
        DraftPhotoRow(number: number, file: store.photo(id), uploaded: store.draft.uploaded.contains(id),
                      warning: store.draft.warnings?[id], editable: store.draft.submittedName == nil, busy: busy,
                      remove: { record { try store.removePhoto(id) } },
                      replace: { pick in await replacePhoto(id, with: pick) },
                      retake: { startCamera(replacing: id) })
    }

    private func startCamera(replacing id: UUID? = nil) {
        retakingPhoto = id
        camera = true
    }

    private func importCapturedPhoto() {
        let replacing = retakingPhoto
        retakingPhoto = nil
        guard let image = capturedPhoto else { return }
        capturedPhoto = nil
        record {
            if let replacing { try store.replace(replacing, with: image) }
            else { try store.append(image) }
        }
    }

    private func record(_ operation: () throws -> Void) {
        error = nil
        do { try operation() }
        catch { self.error = error.localizedDescription }
    }

    private func addPhotos(_ picks: [PhotosPickerItem]) async {
        guard canAddPhotos else { return }
        busy = true
        error = nil
        for pick in picks {
            do {
                let image = try await loadImage(pick)
                try store.append(image)
            } catch {
                self.error = error.localizedDescription
            }
        }
        selection = []
        busy = false
    }

    private func replacePhoto(_ id: UUID, with pick: PhotosPickerItem) async {
        guard !busy else { return }
        busy = true
        error = nil
        defer { busy = false }
        do { try store.replace(id, with: try await loadImage(pick)) }
        catch { self.error = error.localizedDescription }
    }

    private func startIdentification() {
        #if DEBUG
        if previewDraft {
            uploadedBatch = "demo-photo-batch"
            return
        }
        #endif
        Task { await upload() }
    }

    #if DEBUG
    private func previewImage(size: Int, tint: UIColor) -> UIImage {
        let bounds = CGRect(x: 0, y: 0, width: CGFloat(size), height: CGFloat(size))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: bounds.size, format: format).image { renderer in
            tint.setFill()
            renderer.fill(bounds)
        }
    }
    #endif

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

private func loadImage(_ pick: PhotosPickerItem) async throws -> UIImage {
    guard let data = try await pick.loadTransferable(type: Data.self), let image = UIImage(data: data) else {
        throw CaptureError.unsupported
    }
    return image
}

private enum PhotoClarity {
    static func warning(for image: UIImage) -> String? {
        guard let pixels = image.cgImage else { return nil }
        let shortSide = min(pixels.width, pixels.height)
        if shortSide < 420 { return "This photo has too few pixels to read fine lettering. Choose an original or take a closer photo." }
        let request = VNDetectContoursRequest()
        request.maximumImageDimension = 256
        guard (try? VNImageRequestHandler(cgImage: pixels).perform([request])) != nil,
              let contours = request.results?.first else { return nil }
        // Look for a closed, round contour within the frame. Screenshot borders and labels are not coin rims.
        let bounds = (0..<contours.contourCount).compactMap { index -> CGRect? in
            guard let contour = try? contours.contour(at: index), contour.pointCount >= 18 else { return nil }
            let rect = contour.normalizedPath.boundingBoxOfPath
            let width = rect.width * CGFloat(pixels.width)
            let height = rect.height * CGFloat(pixels.height)
            let ratio = width / max(height, 1)
            guard (0.76...1.32).contains(ratio), min(width, height) >= 90,
                  rect.minX > 0.025, rect.minY > 0.025, rect.maxX < 0.975, rect.maxY < 0.975 else { return nil }
            return rect
        }.max { $0.width * $0.height < $1.width * $1.height }
        guard let bounds else { return nil }
        let subjectSpan = min(bounds.width * CGFloat(pixels.width), bounds.height * CGFloat(pixels.height))
        if subjectSpan < CGFloat(shortSide) * 0.42 {
            return "The subject may be too small in this frame. Move closer and include the entire edge."
        }
        return hasFineDetail(pixels, bounds: bounds) ? nil :
            "The lettering may be out of focus. Hold the camera steady and tap the rim to focus."
    }

    private static func hasFineDetail(_ image: CGImage, bounds: CGRect) -> Bool {
        let width = CGFloat(image.width), height = CGFloat(image.height)
        let crop = CGRect(x: bounds.minX * width, y: (1 - bounds.maxY) * height,
                          width: bounds.width * width, height: bounds.height * height).integral
        guard let subject = image.cropping(to: crop) else { return true }
        let size = 96
        var pixels = [UInt8](repeating: 0, count: size * size)
        return pixels.withUnsafeMutableBytes { buffer in
            guard let context = CGContext(data: buffer.baseAddress, width: size, height: size, bitsPerComponent: 8,
                                          bytesPerRow: size, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: 0) else { return true }
            context.draw(subject, in: CGRect(x: 0, y: 0, width: CGFloat(size), height: CGFloat(size)))
            let gray = buffer.bindMemory(to: UInt8.self)
            var edges = 0
            for y in 8..<(size - 8) {
                for x in 8..<(size - 8) {
                    let i = y * size + x
                    let laplacian = abs(4 * Int(gray[i]) - Int(gray[i - 1]) - Int(gray[i + 1]) -
                                        Int(gray[i - size]) - Int(gray[i + size]))
                    if laplacian > 20 { edges += 1 }
                }
            }
            return edges >= 30
        }
    }
}

private struct DraftPhotoRow: View {
    let number: Int
    let file: URL?
    let uploaded: Bool
    let warning: String?
    let editable: Bool
    let busy: Bool
    let remove: () -> Void
    let replace: (PhotosPickerItem) async -> Void
    let retake: () -> Void
    @State private var selection: PhotosPickerItem?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                if let file, let image = UIImage(contentsOfFile: file.path) {
                    Image(uiImage: image).resizable().scaledToFill()
                        .frame(width: 64, height: 56).clipShape(.rect(cornerRadius: 6)).accessibilityHidden(true)
                }
                VStack(alignment: .leading) {
                    Text("Photo \(number)").font(.headline).accessibilityIdentifier("draft-photo-\(number)")
                    Text(uploaded ? "Uploaded" : "On this device").font(.footnote).foregroundStyle(.secondary)
                }
                Spacer()
                if editable {
                    Button("Remove photo \(number)", systemImage: "trash", role: .destructive, action: remove)
                        .labelStyle(.iconOnly).buttonStyle(.borderless).disabled(busy)
                }
            }
            if let warning, editable {
                Label(warning, systemImage: "exclamationmark.triangle").font(.footnote).foregroundStyle(.secondary)
                HStack {
                    PhotosPicker(selection: $selection, matching: .images) {
                        Label("Replace photo \(number)", systemImage: "photo.on.rectangle")
                    }.accessibilityIdentifier("replace-photo-\(number)")
                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        Button("Retake", systemImage: "camera", action: retake)
                    }
                }
                .font(.subheadline).buttonStyle(.borderless).disabled(busy)
            }
        }
        .onChange(of: selection) { _, pick in
            guard let pick else { return }
            Task {
                await replace(pick)
                selection = nil
            }
        }
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
