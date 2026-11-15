import SwiftUI

struct ImportHistory: View {
    let api: NumiAPI
    var selection: Binding<String?>? = nil
    var revision = 0
    var demo = false
    var onNewImport: (() -> Void)? = nil
    @State private var imports: [ImportSummary] = []
    @State private var error: String?
    @State private var loading = true

    var body: some View {
        List(selection: selection) {
            if let onNewImport {
                Button(action: onNewImport) { Label("New photo import", systemImage: "plus") }
                    .buttonStyle(.borderless)
            }
            if !imports.isEmpty {
                Section {
                    ForEach(imports) { batch in
                        if selection != nil {
                            NavigationLink(value: batch.id) { row(batch) }
                        } else {
                            NavigationLink {
                                ImportReview(api: api, batchID: batch.id)
                            } label: {
                                row(batch)
                            }
                        }
                    }
                } footer: {
                    Text("Open a batch to start identification, review suggestions, or add photos to a catalog record.")
                }
            }
            if loading { ProgressView() }
            if let error { Text(error).foregroundStyle(.red) }
            if imports.isEmpty && !loading && error == nil && !demo {
                ContentUnavailableView("No uploads yet", systemImage: "photo.on.rectangle",
                                       description: Text("Take or select photos from Capture."))
            }
        }
        .navigationTitle("Photo imports")
        .task(id: revision) { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        defer { loading = false }
        error = nil
        guard !demo else { return }
        do { imports = try await api.get("/imports") }
        catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }

    private func row(_ batch: ImportSummary) -> some View {
        let status = batchStatus(batch)
        return VStack(alignment: .leading, spacing: 6) {
            Text(batch.label).font(.headline)
            Label(status, systemImage: (batch.pending ?? 0) > 0 ? "clock" : "arrow.right.circle")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.tint)
            Text(batch.total == 1 ? "1 uploaded photo" : "\(batch.total) uploaded photos")
                .font(.footnote).foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }

    private func batchStatus(_ batch: ImportSummary) -> String {
        if let count = batch.suggestions, count > 0 { return count == 1 ? "Review 1 result" : "Review \(count) results" }
        if let pending = batch.pending, pending > 0 { return "Identification in progress" }
        if (batch.failed ?? 0) > 0 { return "Retry identification or catalog manually" }
        if (batch.manual ?? 0) > 0 { return batch.cancelled == 1 ? "Ready to catalog manually" : "Identify photos or catalog manually" }
        if (batch.saved ?? 0) > 0 { return "Cataloged" }
        if batch.cancelled == 1 { return "Analysis canceled" }
        return batch.total > 0 ? "Open photo review" : "No photos uploaded"
    }
}

struct ImportReview: View {
    private struct PendingEdit: Identifiable {
        let id = UUID()
        let draft: ItemDraft
    }

    let api: NumiAPI
    let batchID: String
    var expanded = false
    var previewBatch: PhotoImport? = nil
    @State private var batch: PhotoImport?
    @State private var edit: PendingEdit?
    @State private var error: String?
    @State private var working = false
    @State private var confirmCancel = false
    @State private var confirmAnalyze = false
    @State private var notice: String?
    @State private var poll = UUID()

    var body: some View {
        List {
            if let batch = batch ?? previewBatch {
                progressSection(batch)
                ForEach(batch.photos.indices, id: \.self) { index in
                    let photo = batch.photos[index]
                    ImportPhotoSection(api: api, photo: photo, number: index + 1, expanded: expanded, sample: previewBatch != nil,
                                       canRetry: batch.analyze != 0 && batch.cancelled == 0, working: working) { choice in
                        editPhoto(photo, suggestion: choice)
                    } retry: {
                        Task { await update("/photos/" + photo.id + "/retry") }
                    }
                }
            } else if error == nil {
                ProgressView("Loading photos")
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(batch?.label ?? previewBatch?.label ?? "Photo review")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { poll = UUID() }
        .task(id: poll) {
            guard previewBatch == nil else { return }
            while !Task.isCancelled {
                guard await load() else { return }
                do { try await Task.sleep(for: .seconds(3)) }
                catch { return }
            }
        }
        .sheet(item: $edit) { edit in
            ItemEditor(api: api, draft: edit.draft,
                       pairing: batch?.photos.filter { $0.canCatalog } ?? []) { poll = UUID() }
        }
        .confirmationDialog("Cancel pending work in this import?", isPresented: $confirmCancel, titleVisibility: .visible) {
            Button("Cancel pending analysis", role: .destructive) {
                Task { await update("/imports/" + batchID + "/cancel") }
            }
        }
        .alert("Identify these photos?", isPresented: $confirmAnalyze) {
            Button("Identify photos") { Task { await analyzeSavedPhotos() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("NumiAgent will send the photos awaiting identification to Cloudflare Workers AI. You’ll review any suggestions before saving them to your catalog.")
        }
    }

    private func progressSection(_ batch: PhotoImport) -> some View {
        let pending = batch.photos.filter(\.isPending).count
        let ready = batch.photos.filter { $0.state == "review" && !$0.candidates.isEmpty }.count
        let hasManual = batch.photos.contains { $0.state == "manual" }
        let needsCatalog = batch.photos.contains { $0.state == "manual" || $0.state == "review" || $0.state == "failed" }
        let title = pending > 0 ? "Identifying photos" : ready > 0 ? "Review your matches" :
            hasManual ? "Photos saved" : needsCatalog ? "Finish cataloging" :
            batch.photos.isEmpty ? "No photos in this batch" : "Review complete"
        return Section {
            Label(title, systemImage: pending > 0 ? "sparkles" : "arrow.right.circle.fill")
                .font(.title3.weight(.semibold))
                .foregroundStyle(.tint)
            if pending > 0 {
                Text("Suggestions will appear here automatically. You can leave this screen and come back later.")
                ProgressView(value: Double(batch.photos.count - pending), total: Double(batch.photos.count)) {
                    Text("\(batch.photos.count - pending) of \(batch.photos.count) photos processed")
                }
                Button("Cancel pending analysis", role: .destructive) { confirmCancel = true }
                    .disabled(working)
            } else if ready > 0 {
                Text("Tap a suggestion below to check the details and save it to your collection.")
            } else if hasManual {
                Text(batch.analyze == 0
                    ? "These photos were saved without AI. Identify them now or choose Catalog manually below."
                    : "You can request identification for the remaining photos or catalog them manually.")
            } else if needsCatalog {
                Text("Try identification again when available, or use Catalog manually to add a record.")
            }
            if hasManual && batch.cancelled == 0 && pending == 0 {
                Button("Identify photos", systemImage: "sparkles") { confirmAnalyze = true }
                    .buttonStyle(.borderedProminent).disabled(working)
            }
            if let notice { Text(notice).font(.footnote).foregroundStyle(.secondary) }
        } footer: {
            if batch.cancelled != 0 { Text("Pending work was canceled.") }
        }
    }

    private func editPhoto(_ photo: ImportedPhoto, suggestion: PhotoCandidate?) {
        guard previewBatch == nil else { return }
        var draft = suggestion?.draft() ?? ItemDraft()
        draft.photos = [.init(photoId: photo.id, side: "overview", crop: suggestion?.crop)]
        edit = PendingEdit(draft: draft)
    }

    private func analyzeSavedPhotos() async {
        guard !working, previewBatch == nil else { return }
        struct Queued: Decodable { let queued: Int }
        working = true
        error = nil
        notice = nil
        defer { working = false }
        do {
            let result: Queued = try await api.post("/imports/" + batchID + "/analyze", payload: ["consent": true])
            if result.queued == 0 {
                notice = "No additional photos were queued. Check their status below."
            }
            poll = UUID()
        } catch { self.error = error.localizedDescription }
    }

    private func load() async -> Bool {
        do {
            let result: PhotoImport = try await api.get("/imports/" + batchID)
            guard !Task.isCancelled else { return false }
            batch = result
            if !working { error = nil }
            return result.photos.contains(where: \.isPending)
        } catch {
            if !Task.isCancelled { self.error = error.localizedDescription }
            return false
        }
    }

    private func update(_ path: String) async {
        working = true
        error = nil
        defer { working = false }
        do {
            try await api.write(path, method: "POST")
            poll = UUID()
        } catch { self.error = error.localizedDescription }
    }
}

private struct ImportPhotoSection: View {
    let api: NumiAPI
    let photo: ImportedPhoto
    let number: Int
    let expanded: Bool
    let sample: Bool
    let canRetry: Bool
    let working: Bool
    let edit: (PhotoCandidate?) -> Void
    let retry: () -> Void

    var body: some View {
        Section("Photo \(number)") {
            SpecimenImage(api: api, id: sample ? nil : photo.id, sampleAsset: sample ? "DemoCoin" : nil)
                .frame(height: expanded ? 330 : 220)
            Label(photo.statusLabel, systemImage: photo.isPending ? "clock" : "photo")
            if let message = photo.error { Text(message).font(.footnote).foregroundStyle(.secondary) }
            if photo.canCatalog {
                ForEach(photo.candidates.indices, id: \.self) { index in
                    suggestionButton(photo.candidates[index])
                }
                Button(photo.state == "saved" ? "Catalog another specimen" : "Catalog manually") { edit(nil) }
                    .buttonStyle(.bordered)
            }
            if photo.state == "failed" && canRetry {
                Button("Retry analysis", action: retry).disabled(working)
            }
        }
    }

    private func suggestionButton(_ suggestion: PhotoCandidate) -> some View {
        let subtitle = [suggestion.issuer, suggestion.denomination, suggestion.year]
            .compactMap { $0 }.filter { !$0.isBlank }.joined(separator: " · ")
        return Button {
            edit(suggestion)
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text(suggestion.title)
                Text("Review and save").font(.footnote.weight(.semibold)).foregroundStyle(.tint)
                if !subtitle.isEmpty { Text(subtitle).font(.footnote).foregroundStyle(.secondary) }
            }
        }
    }
}
