import SwiftUI

struct ImportHistory: View {
    let api: NumiAPI
    @State private var imports: [ImportSummary] = []
    @State private var error: String?
    @State private var loading = true

    var body: some View {
        List {
            ForEach(imports) { batch in
                NavigationLink {
                    ImportReview(api: api, batchID: batch.id)
                } label: {
                    VStack(alignment: .leading) {
                        Text(batch.label)
                        Text("\(batch.total) photos · \(batch.pending ?? 0) processing")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }
            if loading { ProgressView() }
            if let error { Text(error).foregroundStyle(.red) }
            if imports.isEmpty && !loading && error == nil {
                ContentUnavailableView("No uploads yet", systemImage: "photo.on.rectangle",
                                       description: Text("Take or select photos from Capture."))
            }
        }
        .navigationTitle("Photo imports")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        defer { loading = false }
        error = nil
        do { imports = try await api.get("/imports") }
        catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}

struct ImportReview: View {
    private struct PendingEdit: Identifiable {
        let id = UUID()
        let draft: ItemDraft
    }

    let api: NumiAPI
    let batchID: String
    @State private var batch: PhotoImport?
    @State private var edit: PendingEdit?
    @State private var error: String?
    @State private var working = false
    @State private var confirmCancel = false
    @State private var poll = UUID()

    var body: some View {
        List {
            if let batch {
                Section {
                    let done = batch.photos.filter { !$0.isPending }.count
                    LabeledContent("Processed", value: "\(done) of \(batch.photos.count)")
                    if done < batch.photos.count {
                        ProgressView(value: Double(done), total: Double(batch.photos.count))
                        Button("Cancel pending analysis", role: .destructive) { confirmCancel = true }
                            .disabled(working)
                    }
                } footer: {
                    if batch.cancelled != 0 { Text("Pending work was canceled.") }
                }
                ForEach(Array(batch.photos.enumerated()), id: \.element.id) { index, photo in
                    Section("Photo \(index + 1)") {
                        SpecimenImage(api: api, id: photo.id, sampleAsset: nil)
                            .frame(height: 220)
                            .accessibilityLabel("Uploaded photo \(index + 1)")
                        Label(photo.statusLabel, systemImage: photo.isPending ? "clock" : "photo")
                        if let message = photo.error { Text(message).font(.footnote).foregroundStyle(.secondary) }
                        if photo.canCatalog {
                            ForEach(Array(photo.candidates.enumerated()), id: \.offset) { _, suggestion in
                                Button {
                                    editPhoto(photo, suggestion: suggestion)
                                } label: {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(suggestion.title)
                                        Text([suggestion.issuer, suggestion.denomination, suggestion.year].compactMap { $0 }
                                            .filter { !$0.isBlank }.joined(separator: " · "))
                                            .font(.footnote).foregroundStyle(.secondary)
                                    }
                                }
                            }
                            Button(photo.state == "saved" ? "Catalog another specimen" : "Catalog manually") {
                                editPhoto(photo, suggestion: nil)
                            }
                        }
                        if photo.state == "failed" && batch.analyze != 0 && batch.cancelled == 0 {
                            Button("Retry analysis") { Task { await update("/photos/" + photo.id + "/retry") } }
                                .disabled(working)
                        }
                    }
                }
            } else if error == nil {
                ProgressView("Loading photos")
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(batch?.label ?? "Photo review")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { poll = UUID() }
        .task(id: poll) {
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

    private func editPhoto(_ photo: ImportedPhoto, suggestion: PhotoCandidate?) {
        var draft = suggestion?.draft() ?? ItemDraft()
        draft.photos = [.init(photoId: photo.id, side: "overview", crop: suggestion?.crop)]
        edit = PendingEdit(draft: draft)
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
