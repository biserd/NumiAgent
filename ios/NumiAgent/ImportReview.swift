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
        VStack(alignment: .leading, spacing: 4) {
            Text(batch.label)
            Text("\(batch.total) photos · \(batch.pending ?? 0) processing")
                .font(.footnote).foregroundStyle(.secondary)
        }
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
    @State private var batch: PhotoImport?
    @State private var edit: PendingEdit?
    @State private var error: String?
    @State private var working = false
    @State private var confirmCancel = false
    @State private var poll = UUID()

    var body: some View {
        List {
            if let batch {
                progressSection(batch)
                ForEach(batch.photos.indices, id: \.self) { index in
                    let photo = batch.photos[index]
                    ImportPhotoSection(api: api, photo: photo, number: index + 1, expanded: expanded,
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

    private func progressSection(_ batch: PhotoImport) -> some View {
        let done = batch.photos.filter { !$0.isPending }.count
        return Section {
            LabeledContent("Processed", value: "\(done) of \(batch.photos.count)")
            if done < batch.photos.count {
                ProgressView(value: Double(done), total: Double(batch.photos.count))
                Button("Cancel pending analysis", role: .destructive) { confirmCancel = true }
                    .disabled(working)
            }
        } footer: {
            if batch.cancelled != 0 { Text("Pending work was canceled.") }
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

private struct ImportPhotoSection: View {
    let api: NumiAPI
    let photo: ImportedPhoto
    let number: Int
    let expanded: Bool
    let canRetry: Bool
    let working: Bool
    let edit: (PhotoCandidate?) -> Void
    let retry: () -> Void

    var body: some View {
        Section("Photo \(number)") {
            SpecimenImage(api: api, id: photo.id, sampleAsset: nil).frame(height: expanded ? 330 : 220)
            Label(photo.statusLabel, systemImage: photo.isPending ? "clock" : "photo")
            if let message = photo.error { Text(message).font(.footnote).foregroundStyle(.secondary) }
            if photo.canCatalog {
                ForEach(photo.candidates.indices, id: \.self) { index in
                    suggestionButton(photo.candidates[index])
                }
                Button(photo.state == "saved" ? "Catalog another specimen" : "Catalog manually") { edit(nil) }
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
                if !subtitle.isEmpty { Text(subtitle).font(.footnote).foregroundStyle(.secondary) }
            }
        }
    }
}
