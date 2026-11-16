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
                    Text("Open an import to see what was added and check any results that need your input.")
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
            Text(batch.paired == 1 ? "Two-sided import" : batch.total == 1 ? "1 uploaded photo" : "\(batch.total) uploaded photos")
                .font(.footnote).foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }

    private func batchStatus(_ batch: ImportSummary) -> String {
        if let pending = batch.pending, pending > 0 { return "Identification in progress" }
        let saved = batch.saved ?? 0
        let needsReview = (batch.suggestions ?? 0) + (batch.manual ?? 0) + (batch.failed ?? 0)
        if saved > 0 && needsReview > 0 { return "\(saved) added · \(needsReview) need attention" }
        if needsReview > 0 { return needsReview == 1 ? "1 photo needs attention" : "\(needsReview) photos need attention" }
        if saved > 0 { return "\(saved) added to your collection" }
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
    @State private var notice: String?
    @State private var poll = UUID()

    var body: some View {
        List {
            if let batch = batch ?? previewBatch {
                progressSection(batch)
                ForEach(batch.awaitingPair ? [] : batch.subjects) { photo in
                    ImportPhotoSection(api: api, photo: photo, companion: batch.photos.first { $0.side == "reverse" },
                                       expanded: expanded, sample: previewBatch != nil,
                                       canRetry: batch.analyze != 0 && batch.cancelled == 0, working: working) { choice in
                        editPhoto(photo, in: batch, suggestion: choice)
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
    }

    private func progressSection(_ batch: PhotoImport) -> some View {
        let subjects = batch.subjects
        let pending = subjects.filter(\.isPending).count
        let saved = subjects.filter { $0.state == "saved" }.count
        let needsReview = subjects.filter(\.canCatalog).count
        let hasUnprocessedPhotos = batch.paired != 1 && subjects.contains { $0.state == "manual" && $0.error == nil }
        let title = batch.awaitingPair ? "Waiting for both sides" : pending > 0 ? "Identifying photos" :
            batch.photos.isEmpty ? "No photos in this import" : saved > 0 ? "Collection updated" :
            needsReview > 0 ? "Check these results" : "Import complete"
        return Section {
            Label(title, systemImage: pending > 0 ? "sparkles" : saved > 0 ? "checkmark.circle.fill" : "photo")
                .font(.title3.weight(.semibold))
                .foregroundStyle(.tint)
            if saved > 0 { Text("\(saved) added to your collection") }
            if batch.awaitingPair {
                Text("Return to Capture to finish uploading this import.")
            } else if pending > 0 {
                Text("Clear matches are added automatically. You can leave this screen while identification runs.")
                ProgressView(value: Double(subjects.count - pending), total: Double(subjects.count)) {
                    Text(batch.paired == 1 ? "Reading the front and back" : "\(subjects.count - pending) of \(subjects.count) photos processed")
                }
                Button("Cancel pending analysis", role: .destructive) { confirmCancel = true }
                    .disabled(working)
            } else if needsReview > 0 && !hasUnprocessedPhotos {
                Text(batch.paired == 1 ? "Check the identification for this item." :
                    needsReview == 1 ? "1 photo needs attention. Check the result below." :
                    "\(needsReview) photos need attention. Check the results below.")
            }
            if hasUnprocessedPhotos && batch.cancelled == 0 && pending == 0 {
                Text("These photos were saved without identification. You can send them to cloud AI now.")
                Button("Identify saved photos", systemImage: "sparkles") { Task { await analyzeSavedPhotos() } }
                    .buttonStyle(.borderedProminent).disabled(working)
            }
            if let notice { Text(notice).font(.footnote).foregroundStyle(.secondary) }
        } footer: {
            if batch.cancelled != 0 { Text("Pending work was canceled.") }
        }
    }

    private func editPhoto(_ photo: ImportedPhoto, in batch: PhotoImport, suggestion: PhotoCandidate?) {
        guard previewBatch == nil else { return }
        var draft = suggestion?.draft() ?? ItemDraft()
        if batch.paired == 1 {
            draft.photos = batch.photos.compactMap { source in
                source.side.map { .init(photoId: source.id, side: $0, crop: nil) }
            }
        } else {
            draft.photos = [.init(photoId: photo.id, side: "overview", crop: suggestion?.crop)]
        }
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
            let result: Queued = try await api.post("/imports/" + batchID + "/analyze", payload: ["consent": true, "autoCatalog": true])
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
    let companion: ImportedPhoto?
    let expanded: Bool
    let sample: Bool
    let canRetry: Bool
    let working: Bool
    let edit: (PhotoCandidate?) -> Void
    let retry: () -> Void

    var body: some View {
        Section {
            if let record = photo.record {
                Text(record.title).font(.headline)
                Text(record.subtitle).font(.subheadline).foregroundStyle(.secondary)
                NavigationLink("View record") {
                    ImportedSpecimen(api: api, record: record, expanded: expanded, sample: sample)
                }
            } else {
                Label(photo.statusLabel, systemImage: photo.isPending ? "clock" : "photo")
            }
            if photo.canCatalog && photo.record == nil {
                if photo.state == "review" && photo.candidates.isEmpty {
                    Text("Try a closer photo with the year and denomination in focus.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                ForEach(photo.candidates.indices, id: \.self) { index in
                    suggestionButton(photo.candidates[index])
                }
                if photo.candidates.isEmpty {
                    Button("Enter details") { edit(nil) }
                        .buttonStyle(.bordered)
                }
            }
            if photo.state == "failed" && canRetry {
                Button("Retry identification", action: retry).disabled(working)
            }
            if let companion {
                HStack {
                    sidePhoto(photo, label: "Front")
                    sidePhoto(companion, label: "Back")
                }
            } else {
                sidePhoto(photo)
            }
        } header: {
            if photo.record != nil {
                Label("In your collection", systemImage: "checkmark.circle.fill")
            }
        }
    }

    private func sidePhoto(_ side: ImportedPhoto, label: String? = nil) -> some View {
        VStack {
            SpecimenImage(api: api, id: sample ? nil : side.id,
                          sampleAsset: sample && side.record == nil ? "DemoCoin" : nil)
                .frame(height: companion == nil ? (expanded ? 330 : 220) : (expanded ? 245 : 130))
            if let label { Text(label).font(.caption).foregroundStyle(.secondary) }
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
                Text("Review details").font(.footnote.weight(.semibold)).foregroundStyle(.tint)
                Text(subtitle.isEmpty ? "Check the type, date and denomination." : subtitle)
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
    }
}

private struct ImportedSpecimen: View {
    let api: NumiAPI
    let record: ImportedRecord
    let expanded: Bool
    let sample: Bool
    @State private var specimen: Specimen?
    @State private var error: String?

    var body: some View {
        Group {
            if let specimen {
                SpecimenScreen(item: specimen, api: api, demo: sample, expanded: expanded, onChange: {})
            } else if let error {
                ContentUnavailableView("Record unavailable", systemImage: "exclamationmark.circle", description: Text(error))
            } else {
                ProgressView("Opening record")
            }
        }
        .task(id: record.id) {
            if sample {
                specimen = DemoCollection.specimens.first { $0.id == record.id }
            } else {
                do { specimen = try await api.get("/items/" + record.id) }
                catch { if !Task.isCancelled { self.error = error.localizedDescription } }
            }
        }
    }
}
