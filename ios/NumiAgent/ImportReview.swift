import SwiftUI

struct ImportHistory: View {
    let api: NumiAPI
    @ObservedObject var store: CaptureDraftStore
    var selection: Binding<String?>? = nil
    var revision = 0
    var demo = false
    var onNewImport: (() -> Void)? = nil
    @State private var loading = true

    private var visibleImports: [ImportSummary] { store.imports.filter { $0.id != store.draftBatchID } }
    private var needsAttention: [ImportSummary] { visibleImports.filter(\.requiresAttention) }
    private var active: [ImportSummary] { visibleImports.filter { !$0.requiresAttention && ($0.isProcessing || $0.isWaiting) } }
    private var finished: [ImportSummary] { visibleImports.filter { !$0.requiresAttention && !$0.isProcessing && !$0.isWaiting } }

    var body: some View {
        List(selection: selection) {
            if let onNewImport {
                Section {
                    Button(action: onNewImport) {
                        Label(store.hasDraft ? (store.uploading ? "View draft upload" : "Resume photo draft") : "New capture",
                              systemImage: store.hasDraft ? "photo.on.rectangle" : "plus")
                            .frame(maxWidth: .infinity, minHeight: 29)
                    }
                    .buttonStyle(.borderedProminent)
                }
                .listRowBackground(CollectorDesign.surface)
            } else if store.hasDraft {
                Section {
                    CollectorNotice(title: "Draft on this device", message: "Return to Capture to finish your draft.",
                                    icon: "photo.on.rectangle")
                }
            }
            groups("Needs review", imports: needsAttention)
            groups("Processing and drafts", imports: active)
            groups("Recent imports", imports: finished)
            if loading { ProgressView() }
            if let error = store.activityError { Text(error).foregroundStyle(.red) }
            if visibleImports.isEmpty && !loading && store.activityError == nil && !demo {
                ContentUnavailableView("No uploads yet", systemImage: "photo.on.rectangle",
                                       description: Text("Add photos to see processing and review updates here."))
            }
        }
        .scrollContentBackground(.hidden)
        .background(CollectorDesign.background)
        .navigationTitle("Capture activity")
        .task(id: revision) {
            guard !demo else { loading = false; return }
            while !Task.isCancelled {
                await store.refreshActivity(api: api)
                loading = false
                do { try await Task.sleep(for: active.isEmpty ? .seconds(30) : .seconds(8)) }
                catch { return }
            }
        }
        .refreshable { if !demo { await store.refreshActivity(api: api) } }
    }

    @ViewBuilder
    private func groups(_ title: String, imports: [ImportSummary]) -> some View {
        if !imports.isEmpty {
            Section(title) {
                ForEach(imports) { batch in
                    if selection != nil {
                        NavigationLink(value: batch.id) { row(batch) }
                    } else {
                        NavigationLink {
                            ImportReview(api: api, batchID: batch.id)
                        } label: { row(batch) }
                    }
                }
            }
            .listRowBackground(CollectorDesign.surface)
        }
    }

    private func row(_ batch: ImportSummary) -> some View {
        return VStack(alignment: .leading, spacing: 6) {
            Text(batch.label).font(.headline)
            Label(batch.status, systemImage: batch.statusIcon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.tint)
            Text(batch.paired == 1 ? "One item" : batch.total == 1 ? "1 uploaded photo" : "\(batch.total) uploaded photos")
                .font(.footnote).foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }

}

struct ImportReview: View {
    private struct PendingEdit: Identifiable {
        let id = UUID()
        let draft: ItemDraft
        let scanPhotoID: String?
    }

    let api: NumiAPI
    let batchID: String
    var expanded = false
    var previewBatch: PhotoImport? = nil
    var resumeUpload: (() -> Void)? = nil
    @State private var batch: PhotoImport?
    @State private var edit: PendingEdit?
    @State private var error: String?
    @State private var working = false
    @State private var confirmCancel = false
    @State private var notice: String?
    @State private var poll = UUID()
    @State private var selectedItem: String?

    var body: some View {
        List {
            if let batch = batch ?? previewBatch {
                progressSection(batch)
                if expanded && batch.subjects.count > 1 && !batch.awaitingPhotos {
                    Picker("Item to review", selection: $selectedItem) {
                        Text("All items").tag(String?.none)
                        ForEach(Array(batch.subjects.enumerated()), id: \.element.id) { index, photo in
                            Text(photo.record?.title ?? "Item \(index + 1)").tag(Optional(photo.id))
                        }
                    }
                    .listRowBackground(CollectorDesign.surface)
                }
                ForEach(batch.awaitingPhotos ? [] : batch.subjects.filter { !expanded || selectedItem == nil || $0.id == selectedItem }) { photo in
                    ImportPhotoSection(api: api, photo: photo,
                                       companions: batch.companions(of: photo),
                                       expanded: expanded, sample: previewBatch != nil,
                                       canRetry: batch.analyze != 0 && batch.cancelled == 0, working: working) { choice, reference, unidentified in
                        editPhoto(photo, in: batch, suggestion: choice, reference: reference, unidentified: unidentified)
                    } retry: {
                        Task { await update("/photos/" + photo.id + "/retry") }
                    }
                }
            } else if error == nil {
                ProgressView("Loading photos")
            }
            if let error {
                Section {
                    CollectorNotice(title: "Couldn’t refresh this import", message: error,
                                    icon: "exclamationmark.circle", warning: true)
                    Button("Refresh results") { poll = UUID() }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(CollectorDesign.background)
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
            ItemEditor(api: api, scanPhotoID: edit.scanPhotoID, draft: edit.draft,
                       pairing: batch?.paired == 1 ? [] : batch?.photos.filter { $0.slot == nil && $0.canCatalog } ?? [],
                       allowsPhotoUpload: edit.scanPhotoID == nil) { poll = UUID() }
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
        let hasUnprocessedPhotos = batch.expected_photos == nil && batch.paired != 1 &&
            subjects.contains { $0.state == "manual" && $0.error == nil }
        let title = batch.awaitingPhotos ? "Waiting for photos" : pending > 0 ? "Identifying photos" :
            batch.photos.isEmpty ? "No photos in this import" : saved > 0 ? "Collection updated" :
            needsReview > 0 ? "Check these results" : "Import complete"
        return Section {
            Label(title, systemImage: pending > 0 ? "sparkles" : saved > 0 ? "checkmark.circle.fill" : "photo")
                .font(.title3.weight(.semibold))
                .foregroundStyle(.tint)
            if saved > 0 { Text("\(saved) added to your collection") }
            if batch.awaitingPhotos {
                Text("The photos stay together until the upload is complete.")
                if let resumeUpload {
                    Button("Resume upload", action: resumeUpload).buttonStyle(.borderedProminent)
                } else {
                    Text("Return to the original device to finish uploading this draft.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            } else if pending > 0 {
                CollectorNotice(title: "You can leave this screen",
                                message: "Find the result under Capture activity in Collection.", icon: "tray")
                ProgressView(value: Double(subjects.count - pending), total: Double(subjects.count)) {
                    Text(batch.paired == 1 ? "Reading \(batch.photos.count) \(batch.photos.count == 1 ? "photo" : "photos") of one item" :
                         "\(subjects.count - pending) of \(subjects.count) items processed")
                }
                Button("Cancel pending analysis", role: .destructive) { confirmCancel = true }
                    .disabled(working)
            } else if needsReview > 0 && !hasUnprocessedPhotos {
                Text(batch.paired == 1 ? "Check the identification for this item." :
                    needsReview == 1 ? "1 item needs review. Check the result below." :
                    "\(needsReview) items need review. Check the results below.")
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
        .listRowBackground(CollectorDesign.surface)
    }

    private func editPhoto(_ photo: ImportedPhoto, in batch: PhotoImport, suggestion: PhotoCandidate?,
                           reference: CoinCatalogMatch?, unidentified: Bool) {
        guard previewBatch == nil else { return }
        var draft = suggestion?.draft(using: reference) ?? ItemDraft()
        if suggestion == nil, let kind = photo.candidates.first?.type, photo.candidates.allSatisfy({ $0.type == kind }) {
            draft.type = kind
            draft.typeLocked = true
        }
        if unidentified {
            draft.type = photo.candidates.first?.type ?? "coin"
            draft.title = draft.type == "banknote" ? "Unidentified banknote" : "Unidentified coin"
        }
        if batch.paired == 1 || photo.slot != nil {
            draft.photos = ([photo] + batch.companions(of: photo)).map { source in
                .init(photoId: source.id, side: source.side ?? "overview", crop: nil)
            }
        } else {
            draft.photos = [.init(photoId: photo.id, side: "overview", crop: suggestion?.crop)]
        }
        edit = PendingEdit(draft: draft, scanPhotoID: photo.slot == nil ? nil : photo.id)
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
    let companions: [ImportedPhoto]
    let expanded: Bool
    let sample: Bool
    let canRetry: Bool
    let working: Bool
    let edit: (PhotoCandidate?, CoinCatalogMatch?, Bool) -> Void
    let retry: () -> Void

    var body: some View {
        Section {
            if let record = photo.record {
                Text(record.title).font(.headline)
                Text(record.subtitle).font(.subheadline).foregroundStyle(.secondary)
                if photo.candidates.first?.hasOpenRomanVariant == true {
                    Label("Ruler and denomination identified. Exact variant open.", systemImage: "info.circle")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                NavigationLink("View record") {
                    ImportedSpecimen(api: api, record: record, expanded: expanded, sample: sample)
                }
            } else {
                Label(photo.statusLabel, systemImage: photo.isPending ? "clock" : "photo")
            }
            if photo.canCatalog && photo.record == nil {
                if let scan = photo.scan, scan.stage == "complete" {
                    ScanReferenceRows(scan: scan)
                } else if photo.state == "review" && photo.candidates.isEmpty {
                    CollectorNotice(title: "No match yet", message: "Add a clearer photo or enter what you can read.",
                                    icon: "exclamationmark.circle", warning: true)
                }
                ForEach(photo.candidates.indices, id: \.self) { index in
                    IdentificationChoice(suggestion: photo.candidates[index]) { edit(photo.candidates[index], $0, false) }
                }
                if photo.candidates.isEmpty && photo.scan == nil {
                    Button("Enter details manually") { edit(nil, nil, false) }
                        .buttonStyle(.bordered)
                }
                Button("Save as unidentified") { edit(nil, nil, true) }
                    .buttonStyle(.borderless)
            }
            if photo.state == "failed" && canRetry {
                Button("Retry identification", action: retry).disabled(working)
            }
            if !companions.isEmpty || photo.side != nil {
                if !expanded && !companions.isEmpty {
                    TabView {
                        sidePhoto(photo, label: "Front")
                        ForEach(companions) { view in
                            sidePhoto(view, label: view.side == "reverse" ? "Back" : "Detail")
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .always))
                    .indexViewStyle(.page(backgroundDisplayMode: .always))
                    .frame(height: 180)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: expanded ? 132 : 100), spacing: 8)], spacing: 12) {
                        sidePhoto(photo, label: photo.side == "reverse" ? "Back" : "Front")
                        ForEach(companions) { view in
                            sidePhoto(view, label: view.side == "reverse" ? "Back" : "Detail")
                        }
                    }
                }
            } else {
                sidePhoto(photo, label: nil)
            }
        } header: {
            if photo.record != nil {
                Label("In your collection", systemImage: "checkmark.circle.fill")
            }
        }
        .listRowBackground(CollectorDesign.surface)
    }

    private func sidePhoto(_ side: ImportedPhoto, label: String? = nil) -> some View {
        VStack {
            SpecimenImage(api: api, id: sample ? nil : side.id,
                          sampleAsset: sample && side.record == nil ? "DemoNickel" : nil,
                          zoomLabel: "Zoom " + (label?.lowercased() ?? "specimen") + " photo")
                .frame(height: label == nil ? (expanded ? 265 : 190) : (expanded ? 155 : 112))
                .clipShape(.rect(cornerRadius: 8))
            if let label { Text(label).font(.caption).foregroundStyle(.secondary) }
        }
    }

}

private struct ScanReferenceRows: View {
    let scan: ScanReview

    var body: some View {
        if let next = scan.next { Text(next).font(.subheadline).foregroundStyle(.secondary) }
        if scan.providers.values.contains("unavailable") {
            Label("Some reference sources were unavailable", systemImage: "info.circle")
                .font(.footnote).foregroundStyle(.secondary)
        }
        if !scan.leads.isEmpty {
            Text("Possible references").font(.headline)
            ForEach(scan.leads) { lead in
                VStack(alignment: .leading, spacing: 5) {
                    Link(lead.label, destination: lead.source)
                    Text(lead.attribution).font(.caption).foregroundStyle(.secondary)
                    if let obverse = lead.obverse, !obverse.isBlank { Text("Front · \(obverse)").font(.footnote) }
                    if let reverse = lead.reverse, !reverse.isBlank { Text("Back · \(reverse)").font(.footnote) }
                    if let excerpt = lead.excerpt, !excerpt.isBlank { Text(excerpt).font(.footnote) }
                    if let supports = lead.supports, !supports.isEmpty {
                        Text("Shared details · \(supports.joined(separator: ", "))").font(.caption)
                    }
                    if let conflicts = lead.conflicts, !conflicts.isEmpty {
                        Text(conflicts.joined(separator: ". ")).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}

private struct IdentificationChoice: View {
    let suggestion: PhotoCandidate
    let select: (CoinCatalogMatch?) -> Void

    var body: some View {
        let subtitle = [suggestion.issuer, suggestion.denomination, suggestion.year]
            .compactMap { $0 }.filter { !$0.isBlank }.joined(separator: " · ")
        Button {
            select(nil)
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text(suggestion.title)
                if suggestion.issuer == "Roman Empire",
                   suggestion.ruler?.isBlank != false || suggestion.denomination?.isBlank != false {
                    Text("Partial identification").font(.footnote).foregroundStyle(.secondary)
                }
                Text("Review details").font(.footnote.weight(.semibold)).foregroundStyle(.tint)
                Text(subtitle.isEmpty ? "Check the type, date and denomination." : subtitle)
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        if let missingField {
            CollectorNotice(title: missingField, message: "Confirm it in the photos, add a clearer view or leave it blank.",
                            icon: "questionmark.circle", warning: true)
        }
        if let front = suggestion.details?.obverseLegend, !front.isBlank {
            LabeledContent("Obverse reading", value: front).font(.footnote)
        }
        if let back = suggestion.details?.reverseLegend, !back.isBlank {
            LabeledContent("Reverse reading", value: back).font(.footnote)
        }
        if suggestion.catalogEvidence == "portrait" {
            Text("The catalog suggests this denomination for the portrait and metal. The exact type needs further evidence.")
                .font(.footnote).foregroundStyle(.secondary)
        }
        if let matches = suggestion.catalogMatches, !matches.isEmpty {
            let count = suggestion.catalogMatchCount ?? matches.count
            Text(suggestion.catalogEvidence == "design" ? "Compare similar designs" :
                    count > 1 ? "Compare \(count) possible catalog types" : "Possible catalog match")
                .font(.subheadline.weight(.semibold))
            ForEach(matches) { match in
                VStack(alignment: .leading, spacing: 6) {
                    Link(match.label, destination: match.source).font(.subheadline.weight(.semibold))
                    if let description = match.obverse.description {
                        Text(description).font(.footnote).foregroundStyle(.secondary)
                    }
                    if let description = match.reverse.description {
                        Text(description).font(.footnote).foregroundStyle(.secondary)
                    }
                    Button("Use this reference") { select(match) }.buttonStyle(.borderless)
                }
                .padding(.vertical, 3)
            }
        } else if suggestion.issuer == "Roman Empire",
                  let front = suggestion.details?.obverseLegend, !front.isBlank,
                  let back = suggestion.details?.reverseLegend, !back.isBlank {
            Text("No catalog match verified for these readings.").font(.footnote).foregroundStyle(.secondary)
        }
    }

    private var missingField: String? {
        if suggestion.issuer?.isBlank != false { return "Issuer unclear" }
        if suggestion.denomination?.isBlank != false { return "Denomination unclear" }
        if isRomanImperialCoin(type: suggestion.type, issuer: suggestion.issuer ?? "", title: suggestion.title) {
            return suggestion.reference?.isBlank == false ? nil : "Exact catalog type unconfirmed"
        }
        if suggestion.year?.isBlank != false { return "Date unclear" }
        let issuer = suggestion.issuer ?? ""
        if suggestion.type == "coin", issuer.localizedCaseInsensitiveContains("United States"),
           suggestion.details?.mintMark?.isBlank != false, (Int(suggestion.year ?? "") ?? 0) >= 1800 {
            return "Mint mark unconfirmed"
        }
        return nil
    }
}

struct SpecimenIdentificationSheet: View {
    private struct Result: Decodable { let candidates: [PhotoCandidate]; let scan: ScanReview? }
    private struct Search: Encodable { let legends: [String: String]?; let searchReferences: Bool }
    let api: NumiAPI
    let item: Specimen
    let onSave: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var candidates: [PhotoCandidate]?
    @State private var draft: ItemDraft?
    @State private var error: String?
    @State private var obverseLegend = ""
    @State private var reverseLegend = ""
    @State private var enteredLegends = false
    @State private var searching = false
    @State private var scan: ScanReview?

    var body: some View {
        if let draft {
            ItemEditor(api: api, itemID: item.id, draft: draft, onSave: onSave)
        } else {
            NavigationStack {
                List {
                    if let scan {
                        Section { ScanReferenceRows(scan: scan) }
                    }
                    if let error {
                        Text(error).foregroundStyle(.secondary)
                        if candidates == nil { Button("Try again") { Task { await identify() } } }
                    }
                    if let candidates {
                        let compatible = candidates.filter { item.typeLocked != true || $0.type == item.type }
                        if compatible.isEmpty {
                            Text(enteredLegends ? "No catalog type matched those inscriptions." :
                                "No match found. A closer photo of each side can help.").foregroundStyle(.secondary)
                        }
                        if compatible.count > 1 {
                            Text("Multiple items were detected. Review a match that belongs to this specimen.")
                                .foregroundStyle(.secondary)
                        }
                        ForEach(compatible.indices, id: \.self) { index in
                            Section {
                                IdentificationChoice(suggestion: compatible[index]) { match in
                                    draft = compatible[index].draft(using: match, updating: item)
                                }
                            }
                        }
                    } else if error == nil {
                        ProgressView("Reading the photos and checking available references")
                    }
                    if isRomanImperialCoin(type: item.type, issuer: item.issuer, title: item.title),
                       candidates != nil || error != nil {
                        Section {
                            TextField("Obverse legend", text: $obverseLegend).textInputAutocapitalization(.characters)
                                .autocorrectionDisabled()
                            TextField("Reverse legend", text: $reverseLegend).textInputAutocapitalization(.characters)
                                .autocorrectionDisabled()
                            Button("Search Roman catalog") { Task { await identify(useLegends: true) } }
                                .disabled(searching || obverseLegend.count < 5 || reverseLegend.count < 4)
                            if searching { ProgressView() }
                        } header: {
                            Text("Check the inscriptions")
                        } footer: {
                            Text("Enter the letters you see. Use ? for any unreadable span.")
                        }
                    }
                }
                .navigationTitle("Improve identification")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                }
                .task { await identify() }
            }
        }
    }

    private func identify(useLegends: Bool = false) async {
        searching = true
        enteredLegends = useLegends
        error = nil
        defer { searching = false }
        do {
            let legends = useLegends ? ["obverseLegend": obverseLegend, "reverseLegend": reverseLegend] : nil
            let result: Result = try await api.post("/imports/refine/" + item.id,
                                                   payload: Search(legends: legends, searchReferences: !useLegends))
            guard !Task.isCancelled else { return }
            candidates = result.candidates
            if !useLegends {
                scan = result.scan
                obverseLegend = result.candidates.first?.details?.obverseLegend ?? item.details?.obverseLegend ?? ""
                reverseLegend = result.candidates.first?.details?.reverseLegend ?? item.details?.reverseLegend ?? ""
            }
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
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
