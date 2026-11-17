import PhotosUI
import SwiftUI
import UIKit
import Vision

struct CaptureDraft: Codable {
    var id = UUID()
    var photos: [UUID] = []
    var uploaded: Set<UUID> = []
    var uploadedIDs: [UUID: String]?
    var submittedName: String?
    var submittedAnalysis: Bool?
    var submittedAutoCatalog: Bool?
    var paired: Bool?
    var expectedPhotos: Int?
    var warnings: [UUID: String]?
    var lastUploadedBatch: String?
    var groupSizes: [Int]?
    var submittedPlan: [Int]?

    var counts: [Int] { groupSizes ?? (paired == false ? Array(repeating: 1, count: photos.count) : [photos.count]) }
    var oneItem: Bool { counts.filter { $0 > 0 }.count <= 1 && counts.count <= 1 }

    func position(at index: Int) -> (group: Int, view: Int)? {
        var start = 0
        for (group, count) in counts.enumerated() {
            if index < start + count { return (group, index - start) }
            start += count
        }
        return nil
    }

    func side(at index: Int) -> String? {
        guard oneItem else { return nil }
        switch index {
        case 0: return "obverse"
        case 1: return "reverse"
        default: return nil
        }
    }

    func role(at index: Int) -> String {
        let view = position(at: index)?.view ?? index
        switch view {
        case 0: return "Front"
        case 1: return "Back"
        default: return view == 2 ? "Detail" : "Detail \(view - 1)"
        }
    }
}

@MainActor
final class CaptureDraftStore: ObservableObject {
    static let maximumPhotos = 20
    static let maximumItemPhotos = 5
    @Published private(set) var draft = CaptureDraft()
    @Published private(set) var error: String?
    @Published private(set) var uploading = false
    @Published private(set) var imports: [ImportSummary] = []
    @Published private(set) var activityError: String?
    @Published private(set) var submittedError: String?
    private var refreshing = false
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

    var hasDraft: Bool { !draft.photos.isEmpty }
    var draftBatchID: String? { draft.submittedName == nil ? nil : draft.id.uuidString.lowercased() }
    var activity: [ImportSummary] {
        let otherImports = imports.filter { $0.id != draftBatchID }
        let pending = otherImports.filter { $0.requiresAttention || $0.isProcessing || $0.isWaiting }
        let recentlySaved = otherImports.first { ($0.saved ?? 0) > 0 && Date.now.timeIntervalSince1970 - $0.created < 86_400 }
        let result = Array(pending.prefix(3))
        return result.isEmpty && recentlySaved != nil ? [recentlySaved].compactMap { $0 } : result
    }

    func refreshActivity(api: NumiAPI) async {
        guard directory != nil, !refreshing else { return }
        #if DEBUG
        if PreviewLaunch.screen != nil { return }
        #endif
        refreshing = true
        defer { refreshing = false }
        do {
            let result: [ImportSummary] = try await api.get("/imports")
            guard !Task.isCancelled else { return }
            imports = result
            activityError = nil
        } catch {
            if !Task.isCancelled { activityError = error.localizedDescription }
        }
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
        min(Self.maximumPhotos - draft.photos.count, Self.maximumItemPhotos - (draft.counts.last ?? 0))
    }

    func addItem() throws {
        guard draft.submittedName == nil, draft.photos.count < Self.maximumPhotos,
              let count = draft.counts.last, count > 0 else { return }
        var updated = draft
        updated.groupSizes = draft.counts + [0]
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
        let id = UUID()
        let target = directory.appending(path: id.uuidString + ".jpg")
        try data.write(to: target, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        if let existing, let index = updated.photos.firstIndex(of: existing) {
            updated.photos[index] = id
            updated.warnings?.removeValue(forKey: existing)
        } else {
            updated.photos.append(id)
            var counts = draft.counts
            if counts.isEmpty { counts = [0] }
            counts[counts.count - 1] += 1
            updated.groupSizes = counts
        }
        var warnings = updated.warnings ?? [:]
        warnings[id] = PhotoClarity.warning(for: UIImage(data: data) ?? image)
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
        guard let index = updated.photos.firstIndex(of: id), let position = updated.position(at: index) else { return }
        var counts = draft.counts
        counts[position.group] -= 1
        if counts[position.group] == 0 && counts.count > 1 { counts.remove(at: position.group) }
        updated.groupSizes = counts
        updated.photos.remove(at: index)
        updated.warnings?.removeValue(forKey: id)
        try save(updated)
        if let photo = photo(id) { try? FileManager.default.removeItem(at: photo) }
    }

    func move(_ id: UUID, offset: Int) throws {
        guard draft.submittedName == nil, let current = draft.photos.firstIndex(of: id),
              draft.photos.indices.contains(current + offset),
              canMove(at: current, offset: offset) else { return }
        var updated = draft
        updated.photos.swapAt(current, current + offset)
        try save(updated)
    }

    func canMove(at index: Int, offset: Int) -> Bool {
        guard draft.photos.indices.contains(index + offset), let from = draft.position(at: index),
              let to = draft.position(at: index + offset) else { return false }
        return from.group == to.group
    }

    struct Submission {
        let batchID: String
        let manualPhotos: [PhotoLink]?
    }

    func upload(api: NumiAPI, analyze: Bool = true) async throws -> Submission {
        guard !uploading, hasDraft else { throw CaptureError.storage }
        uploading = true
        submittedError = nil
        defer { uploading = false }
        do {
            return try await submit(api: api, analyze: analyze)
        } catch {
            submittedError = error.localizedDescription
            throw error
        }
    }

    private func submit(api: NumiAPI, analyze: Bool) async throws -> Submission {
        var updated = draft
        if updated.submittedName == nil {
            var seen = Set<Data>()
            for id in updated.photos {
                guard let url = photo(id) else { throw CaptureError.storage }
                guard seen.insert(try Data(contentsOf: url)).inserted else { throw CaptureError.duplicate }
            }
            let items = updated.counts.filter { $0 > 0 }
            let label = items.count == 1 ? "One item" : "\(items.count) items"
            updated.submittedName = label + " · " + Date.now.formatted(date: .abbreviated, time: .shortened)
            updated.submittedAnalysis = analyze
            updated.submittedAutoCatalog = analyze
            updated.expectedPhotos = analyze ? updated.photos.count : nil
            updated.submittedPlan = analyze ? items : nil
            try save(updated)
        }
        guard let batchName = updated.submittedName, let batchAnalysis = updated.submittedAnalysis else {
            throw CaptureError.storage
        }
        let isAnalysisPair = batchAnalysis && updated.submittedPlan == nil && updated.paired == true
        try await api.createImport(id: updated.id, name: batchName, analyze: batchAnalysis,
                                   autoCatalog: updated.submittedAutoCatalog ?? false, paired: isAnalysisPair,
                                   expectedPhotos: updated.expectedPhotos, scanPlan: updated.submittedPlan)
        for (index, id) in updated.photos.enumerated() {
            if updated.uploaded.contains(id), batchAnalysis || updated.uploadedIDs?[id] != nil { continue }
            guard let photo = photo(id) else { throw CaptureError.storage }
            let side = isAnalysisPair ? updated.side(at: index) : nil
            let slot = updated.submittedPlan == nil ? nil : updated.position(at: index).map { $0.group * 5 + $0.view }
            let uploadedID = try await api.uploadPhoto(Data(contentsOf: photo), batch: updated.id, side: side, slot: slot)
            if !batchAnalysis {
                var ids = updated.uploadedIDs ?? [:]
                ids[id] = uploadedID
                updated.uploadedIDs = ids
            }
            updated.uploaded.insert(id)
            try save(updated)
        }
        let batchID = updated.id.uuidString.lowercased()
        if !batchAnalysis {
            let links = try updated.photos.enumerated().map { index, id -> PhotoLink in
                guard let key = updated.uploadedIDs?[id] else { throw CaptureError.storage }
                return .init(photoId: key, side: updated.side(at: index) ?? "overview", crop: nil)
            }
            return Submission(batchID: batchID, manualPhotos: links)
        }
        try complete(batchID: batchID)
        await refreshActivity(api: api)
        return Submission(batchID: batchID, manualPhotos: nil)
    }

    func complete(batchID: String) throws {
        guard draftBatchID == batchID else { return }
        let photos = draft.photos
        try save(CaptureDraft(lastUploadedBatch: batchID))
        for id in photos {
            if let photo = photo(id) { try? FileManager.default.removeItem(at: photo) }
        }
    }

    static func jpeg(_ image: UIImage) throws -> Data {
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
    @ObservedObject var store: CaptureDraftStore
    @Binding var reviewID: String?
    let onUpload: ((String) -> Void)?
    let onSave: (String) -> Void
    var checklistLabel: String? = nil
    @State private var selection: [PhotosPickerItem] = []
    @State private var camera = false
    @State private var retakingPhoto: UUID?
    @State private var capturedPhoto: UIImage?
    @State private var busy = false
    @State private var error: String?
    @State private var manualSubmission: CaptureDraftStore.Submission?
    @State private var showManualEditor = false
    @State private var previewDraft = false
    @State private var demoPhoto = PreviewLaunch.screen == .capture
    @State private var demoResult = PreviewLaunch.screen == .capture

    var body: some View {
        if onUpload != nil { captureForm }
        else {
            NavigationStack {
                captureForm.navigationDestination(item: $reviewID) { id in
                    ImportReview(api: api, batchID: id, previewBatch: account == nil ? PhotoImport.demoAutomatic : nil,
                                 resumeUpload: store.draftBatchID == id ? { reviewID = nil } : nil)
                }
            }
        }
    }

    private var captureForm: some View {
        List {
            if account == nil && !previewDraft && !store.hasDraft {
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
                if let checklistLabel {
                    Section {
                        CollectorNotice(title: "Checklist target", message: checklistLabel, icon: "checklist")
                    }
                    .listRowBackground(CollectorDesign.surface)
                }
                captureControls
                draftPhotos
                if onUpload == nil {
                    Section {
                        NavigationLink("Capture activity") { ImportHistory(api: api, store: store) }.disabled(busy)
                    }
                    .listRowBackground(CollectorDesign.surface)
                }
            }
            if busy && store.draft.submittedName == nil { ProgressView("Preparing photos") }
            if store.draft.photos.isEmpty, let message = error ?? store.error { Text(message).foregroundStyle(.red) }
        }
        .scrollContentBackground(.hidden)
        .background(CollectorDesign.background)
        .navigationTitle("Capture")
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
        .sheet(isPresented: $showManualEditor) {
            if let submission = manualSubmission, let photos = submission.manualPhotos {
                let item = ItemDraft(photos: photos)
                ItemEditor(api: api, draft: item, onCreated: { id in
                    record { try store.complete(batchID: submission.batchID) }
                    onSave(id)
                }) {}
            }
        }
    }

    private var captureControls: some View {
        Section {
            Text("Add the front, back or close-ups of the same coin or banknote.")
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
            Button("Add another item", systemImage: "plus.rectangle.on.rectangle") { record { try store.addItem() } }
                .disabled(busy || store.uploading || store.draft.submittedName != nil ||
                          store.draft.photos.count >= CaptureDraftStore.maximumPhotos || (store.draft.counts.last ?? 0) == 0)
            #if DEBUG
            if previewDraft {
                Button("Add a sample close-up") {
                    record { try store.append(previewImage(size: 600, tint: .systemGreen)) }
                }.disabled(!canAddPhotos)
            }
            #endif
        } header: {
            Text(store.draft.counts.count > 1 ? "Add photos to item \(store.draft.counts.count)" : "One item")
        } footer: {
            Text("Photograph the full item first. Use even light and focus on the lettering and date.")
        }
        .listRowBackground(CollectorDesign.surface)
    }

    @ViewBuilder
    private var draftPhotos: some View {
        if store.hasDraft {
            ForEach(Array(store.draft.counts.enumerated()), id: \.offset) { group, count in
                if count > 0 {
                    let start = store.draft.counts.prefix(group).reduce(0, +)
                    Section(store.draft.counts.count == 1 ? "Draft on this device" : "Item \(group + 1)") {
                        ForEach(start..<(start + count), id: \.self) { index in
                            draftRow(store.draft.photos[index], index: index)
                        }
                    }
                    .listRowBackground(CollectorDesign.surface)
                }
            }
        }
    }

    private var canAddPhotos: Bool { !busy && !store.uploading && store.draft.submittedName == nil && store.available > 0 }

    private var identifyBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let message = error ?? store.submittedError ?? store.error {
                Text(message).font(.footnote).foregroundStyle(.red)
            }
            if store.uploading {
                ProgressView(value: Double(store.draft.uploaded.count), total: Double(store.draft.photos.count)) {
                    Text("Uploading \(store.draft.uploaded.count) of \(store.draft.photos.count) photos")
                }
            } else {
                let count = store.draft.photos.count
                let items = store.draft.counts.filter { $0 > 0 }.count
                Text("\(items) \(items == 1 ? "item" : "items") · \(count) \(count == 1 ? "photo" : "photos")")
                    .font(.subheadline.weight(.semibold))
                    .accessibilityIdentifier("capture-draft-count")
                identifyActions(items: items)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20).padding(.vertical, 12)
        .background(CollectorDesign.surface)
    }

    @ViewBuilder
    private func identifyActions(items: Int) -> some View {
        if store.draft.submittedAnalysis == false {
            Button("Continue manual entry") { Task { await upload(analyze: false) } }
                .buttonStyle(.borderedProminent).disabled(busy)
        } else {
            Text(store.draft.submittedName == nil ? "Identify uploads these photos for analysis and saves clear matches." :
                    "Your draft is safe. Resume to upload the remaining photos.")
                .font(.footnote).foregroundStyle(.secondary)
            Button {
                startIdentification()
            } label: {
                Label(store.draft.submittedName == nil ? (items == 1 ? "Identify 1 item" : "Identify \(items) items") :
                        "Resume upload", systemImage: "sparkles")
                    .frame(maxWidth: .infinity, minHeight: 30)
            }
            .buttonStyle(.borderedProminent).disabled(busy)
            if account != nil, store.draft.oneItem, store.draft.submittedName == nil {
                Button("Upload photos without AI") { Task { await upload(analyze: false) } }
                    .buttonStyle(.bordered).disabled(busy)
            }
        }
    }

    private func draftRow(_ id: UUID, index: Int) -> some View {
        DraftPhotoRow(number: index + 1, role: store.draft.role(at: index), file: store.photo(id), uploaded: store.draft.uploaded.contains(id),
                      warning: store.draft.warnings?[id], editable: store.draft.submittedName == nil, busy: busy,
                      remove: { record { try store.removePhoto(id) } },
                      replace: { pick in await replacePhoto(id, with: pick) },
                      retake: { startCamera(replacing: id) },
                      moveEarlier: store.canMove(at: index, offset: -1) ? { record { try store.move(id, offset: -1) } } : nil,
                      moveLater: store.canMove(at: index, offset: 1) ? { record { try store.move(id, offset: 1) } } : nil)
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
                let image = try await loadCaptureImage(pick)
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
        do { try store.replace(id, with: try await loadCaptureImage(pick)) }
        catch { self.error = error.localizedDescription }
    }

    private func startIdentification() {
        #if DEBUG
        if previewDraft {
            if let onUpload { onUpload("demo-photo-batch") }
            else { reviewID = "demo-photo-batch" }
            return
        }
        #endif
        Task { await upload(analyze: true) }
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

    private func upload(analyze: Bool) async {
        guard !busy, !store.uploading, store.hasDraft else { return }
        error = nil
        do {
            let result = try await store.upload(api: api, analyze: analyze)
            if result.manualPhotos != nil {
                manualSubmission = result
                showManualEditor = true
            } else if let onUpload { onUpload(result.batchID) }
            else { reviewID = result.batchID }
        } catch { self.error = error.localizedDescription }
    }
}

@MainActor
func loadCaptureImage(_ pick: PhotosPickerItem) async throws -> UIImage {
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
        return hasFineDetail(pixels, bounds: bounds) || hasReadableText(pixels, bounds: bounds) ? nil :
            "The lettering may be out of focus. Hold the camera steady and tap the rim to focus."
    }

    private static func hasReadableText(_ image: CGImage, bounds: CGRect) -> Bool {
        let request = VNRecognizeTextRequest()
        request.regionOfInterest = bounds
        request.recognitionLevel = .fast
        request.usesLanguageCorrection = false
        guard (try? VNImageRequestHandler(cgImage: image).perform([request])) != nil else { return false }
        return request.results?.contains { result in
            result.topCandidates(1).contains { $0.confidence >= 0.7 && $0.string.count >= 3 }
        } ?? false
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
                    let horizontal = Int(gray[i - 1]) + Int(gray[i + 1])
                    let vertical = Int(gray[i - size]) + Int(gray[i + size])
                    let laplacian = abs(4 * Int(gray[i]) - horizontal - vertical)
                    if laplacian > 20 { edges += 1 }
                }
            }
            return edges >= 30
        }
    }
}

private struct DraftPhotoRow: View {
    let number: Int
    let role: String
    let file: URL?
    let uploaded: Bool
    let warning: String?
    let editable: Bool
    let busy: Bool
    let remove: () -> Void
    let replace: (PhotosPickerItem) async -> Void
    let retake: () -> Void
    let moveEarlier: (() -> Void)?
    let moveLater: (() -> Void)?
    @State private var selection: PhotosPickerItem?
    @State private var showReplacement = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                if let file, let image = UIImage(contentsOfFile: file.path) {
                    Image(uiImage: image).resizable().scaledToFill()
                        .frame(width: 64, height: 56).clipShape(.rect(cornerRadius: 6)).accessibilityHidden(true)
                }
                VStack(alignment: .leading) {
                    Text(role).font(.headline).accessibilityIdentifier("draft-photo-\(number)")
                    Text(uploaded ? "Uploaded" : "On this device").font(.footnote).foregroundStyle(.secondary)
                }
                Spacer()
                if editable {
                    Menu {
                        Button("Replace from photo library", systemImage: "photo.on.rectangle") {
                            showReplacement = true
                        }
                        if UIImagePickerController.isSourceTypeAvailable(.camera) {
                            Button("Retake photo", systemImage: "camera", action: retake)
                        }
                        if let moveEarlier { Button("Move earlier", systemImage: "arrow.up", action: moveEarlier) }
                        if let moveLater { Button("Move later", systemImage: "arrow.down", action: moveLater) }
                        Button("Remove photo", systemImage: "trash", role: .destructive, action: remove)
                    } label: {
                        Label("Actions for \(role)", systemImage: "ellipsis.circle")
                            .labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44)
                    }
                    .buttonStyle(.borderless).disabled(busy)
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
        .photosPicker(isPresented: $showReplacement, selection: $selection, matching: .images)
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
