import PhotosUI
import SwiftUI

struct CollectionFoldersScreen: View {
    let api: NumiAPI
    @Environment(\.dismiss) private var dismiss
    @State private var folders: [CollectionFolder] = []
    @State private var name = ""
    @State private var changing: CollectionFolder?
    @State private var removing: CollectionFolder?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section(changing == nil ? "Create collection" : "Rename collection") {
                    TextField("Name", text: $name)
                    Button("Save") { Task { await save() } }.disabled(busy || name.isBlank || name.count > 100)
                    if changing != nil {
                        Button("Cancel editing") { changing = nil; name = "" }
                    }
                }
                Section("Collections") {
                    ForEach(folders) { folder in
                        Button(folder.name) { changing = folder; name = folder.name }
                            .swipeActions {
                                Button("Remove", role: .destructive) { removing = folder }
                            }
                    }
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("Collections")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .task { await load() }
            .confirmationDialog("Remove this collection?", isPresented: Binding(
                get: { removing != nil }, set: { if !$0 { removing = nil } }
            ), titleVisibility: .visible, presenting: removing) { folder in
                Button("Remove collection", role: .destructive) {
                    Task {
                        do {
                            try await api.write("/collections/" + folder.id, method: "DELETE")
                            if changing?.id == folder.id { changing = nil; name = "" }
                            await load()
                        } catch { self.error = error.localizedDescription }
                    }
                }
            } message: { _ in
                Text("The specimens in this collection will become unfiled.")
            }
        }
    }

    private func load() async {
        do { folders = try await api.get("/collections") }
        catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }

    private func save() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            let path = changing.map { "/collections/" + $0.id } ?? "/collections"
            try await api.write(path, method: changing == nil ? "POST" : "PUT", payload: ["name": name])
            changing = nil
            name = ""
            await load()
        } catch { self.error = error.localizedDescription }
    }
}

struct ItemEditor: View {
    let api: NumiAPI
    var itemID: String?
    let scanPhotoID: String?
    var pairing: [ImportedPhoto]
    let onSave: () -> Void
    let onCreated: ((String) -> Void)?
    var allowsPhotoUpload: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var draft: ItemDraft
    @State private var folders: [CollectionFolder] = []
    @State private var error: String?
    @State private var busy = false
    @State private var selectedPhoto: PhotosPickerItem?

    init(api: NumiAPI, itemID: String? = nil, scanPhotoID: String? = nil, draft: ItemDraft = .init(),
         pairing: [ImportedPhoto] = [], allowsPhotoUpload: Bool = true, onCreated: ((String) -> Void)? = nil,
         onSave: @escaping () -> Void) {
        self.api = api
        self.itemID = itemID
        self.scanPhotoID = scanPhotoID
        self.pairing = pairing
        self.onSave = onSave
        self.onCreated = onCreated
        self.allowsPhotoUpload = allowsPhotoUpload
        _draft = State(initialValue: draft)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Identification") {
                    if draft.typeLocked == true {
                        LabeledContent("Piece type", value: draft.type == "coin" ? "Coin" : "Banknote")
                    } else {
                        Picker("Type", selection: $draft.type) {
                            Text("Coin").tag("coin")
                            Text("Banknote").tag("banknote")
                        }
                    }
                    TextField("Title", text: $draft.title)
                    TextField("Issuer", text: $draft.issuer)
                    TextField("Denomination", text: $draft.denomination)
                    TextField("Year or date", text: $draft.year)
                }
                .listRowBackground(CollectorDesign.surface)
                Section("Collection details") {
                    TextField("Ruler", text: $draft.ruler)
                    TextField("Catalog reference", text: $draft.reference)
                    TextField("Grade", text: $draft.grade)
                    Picker("Collection", selection: $draft.collection_id) {
                        Text("Unfiled").tag(nil as String?)
                        if let current = draft.collection_id, !folders.contains(where: { $0.id == current }) {
                            Text("Current collection").tag(Optional(current))
                        }
                        ForEach(folders) { folder in Text(folder.name).tag(Optional(folder.id)) }
                    }
                }
                .listRowBackground(CollectorDesign.surface)
                Section("Additional details") {
                    if draft.type == "coin" {
                        TextField("Metal", text: optional($draft.details.metal))
                        TextField("Mint", text: optional($draft.details.mint))
                        TextField("Mint mark", text: optional($draft.details.mintMark))
                        TextField("Obverse legend", text: optional($draft.details.obverseLegend), axis: .vertical)
                        TextField("Reverse legend", text: optional($draft.details.reverseLegend), axis: .vertical)
                    } else {
                        TextField("Series", text: optional($draft.details.series))
                        TextField("Serial number", text: optional($draft.details.serial))
                        TextField("Signatures", text: optional($draft.details.signatures))
                    }
                    TextField("Variant", text: optional($draft.details.variant))
                    TextField("Provenance", text: optional($draft.details.provenance), axis: .vertical)
                    TextField("Certification", text: optional($draft.details.certification))
                    TextField("Notes", text: $draft.notes, axis: .vertical)
                    TextField("Tags", text: $draft.tags)
                }
                .listRowBackground(CollectorDesign.surface)
                if let photos = draft.photos, !photos.isEmpty {
                    photoFields(photos)
                }
                if allowsPhotoUpload, (draft.photos?.count ?? 0) < 12 {
                    Section {
                        PhotosPicker(selection: $selectedPhoto, matching: .images) {
                            Label("Add a photo without AI", systemImage: "photo.badge.plus")
                        }
                        .disabled(busy)
                    } footer: {
                        Text("Add a clearer photo or another view to this record.")
                    }
                    .listRowBackground(CollectorDesign.surface)
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .scrollContentBackground(.hidden)
            .background(CollectorDesign.background)
            .navigationTitle(itemID == nil ? "Enter details" : "Edit item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }.disabled(draft.title.isBlank || busy)
                }
            }
            .interactiveDismissDisabled(busy)
            .onChange(of: selectedPhoto) { _, photo in
                guard let photo else { return }
                Task { await addPhoto(photo) }
            }
            .task {
                do { folders = try await api.get("/collections") }
                catch { if !Task.isCancelled { self.error = error.localizedDescription } }
            }
        }
    }

    private func optional(_ text: Binding<String?>) -> Binding<String> {
        Binding(get: { text.wrappedValue ?? "" }, set: { text.wrappedValue = $0 })
    }

    @ViewBuilder
    private func photoFields(_ photos: [PhotoLink]) -> some View {
        Section("Photos") {
            ForEach(photos.indices, id: \.self) { index in
                let photo = photos[index]
                SpecimenImage(api: api, id: photo.photoId, sampleAsset: nil, zoomLabel: "Zoom photo").frame(height: 140)
                Picker("Side", selection: Binding(
                    get: { draft.photos?[safe: index]?.side ?? "overview" },
                    set: { if (draft.photos?.count ?? 0) > index { draft.photos?[index].side = $0 } }
                )) {
                    Text("Overview").tag("overview")
                    Text("Front").tag("obverse")
                    Text("Back").tag("reverse")
                }
                if photo.crop != nil {
                    Button("Use entire photo") {
                        if (draft.photos?.count ?? 0) > index { draft.photos?[index].crop = nil }
                    }
                }
                if index > 0 || itemID != nil {
                    Button("Detach photo", role: .destructive) {
                        if (draft.photos?.count ?? 0) > index { draft.photos?.remove(at: index) }
                    }
                }
            }
            if photos.count == 1 {
                let others = pairing.filter { $0.id != photos[0].photoId }
                if !others.isEmpty {
                    NavigationLink("Pair another photo") {
                        PhotoPairPicker(api: api, photos: others) { id in
                            if draft.photos?.first?.side == "overview" { draft.photos?[0].side = "obverse" }
                            let side = draft.photos?.first?.side == "reverse" ? "obverse" : "reverse"
                            draft.photos?.append(.init(photoId: id, side: side, crop: nil))
                        }
                    }
                }
            }
        }
        .listRowBackground(CollectorDesign.surface)
    }

    private func addPhoto(_ photo: PhotosPickerItem) async {
        guard !busy, (draft.photos?.count ?? 0) < 12 else { selectedPhoto = nil; return }
        busy = true
        error = nil
        defer { busy = false; selectedPhoto = nil }
        do {
            let image = try await loadCaptureImage(photo)
            let data = try CaptureDraftStore.jpeg(image)
            let batch = UUID()
            try await api.createImport(id: batch, name: "Additional item photo", analyze: false,
                                       autoCatalog: false, paired: false, expectedPhotos: nil)
            let id = try await api.uploadPhoto(data, batch: batch)
            draft.photos = (draft.photos ?? []) + [.init(photoId: id, side: "overview", crop: nil)]
        } catch { self.error = error.localizedDescription }
    }

    private func save() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            if let itemID {
                try await api.write("/items/" + itemID, method: "PUT", payload: draft)
            } else {
                let path = scanPhotoID.map { "/photos/" + $0 + "/save" } ?? "/items"
                let record: APIIdentifier = try await api.post(path, payload: draft)
                onCreated?(record.id)
            }
            onSave()
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

private extension Array {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

private struct PhotoPairPicker: View {
    let api: NumiAPI
    let photos: [ImportedPhoto]
    let select: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List(photos) { photo in
            Button {
                select(photo.id)
                dismiss()
            } label: {
                HStack {
                    SpecimenImage(api: api, id: photo.id, sampleAsset: nil).frame(width: 84, height: 72)
                    Text(photo.candidates.first?.title ?? photo.statusLabel)
                }
            }
        }
        .navigationTitle("Pair a photo")
    }
}

struct ChecklistEditor: View {
    let api: NumiAPI
    var checklistID: String?
    let onSave: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var draft: ChecklistDraft
    @State private var goal = ""
    @State private var busy = false
    @State private var error: String?

    init(api: NumiAPI, checklistID: String? = nil,
         draft: ChecklistDraft = .init(name: "", slots: []), onSave: @escaping () -> Void) {
        self.api = api
        self.checklistID = checklistID
        self.onSave = onSave
        _draft = State(initialValue: draft)
    }

    var body: some View {
        NavigationStack {
            Form {
                if checklistID == nil && draft.slots.isEmpty {
                    Section {
                        TextField("Example: 1935 Canadian banknotes", text: $goal, axis: .vertical)
                        Button("Preview suggestions") { Task { await suggest() } }
                            .disabled(goal.isBlank || busy || goal.count > 400)
                    } header: {
                        Text("Suggest a checklist")
                    } footer: {
                        Text("Review the suggested matching rules before saving.")
                    }
                }
                Section("Checklist") {
                    TextField("Name", text: $draft.name)
                    ForEach($draft.slots) { $slot in
                        NavigationLink(slot.label.isBlank ? "New matching rule" : slot.label) {
                            ChecklistRuleEditor(rule: $slot)
                        }
                    }
                    .onDelete { draft.slots.remove(atOffsets: $0) }
                    Button("Add matching rule") { draft.slots.append(.init()) }
                        .disabled(draft.slots.count >= 100)
                }
                if busy { ProgressView() }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle(checklistID == nil ? "New checklist" : "Edit checklist")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(busy || draft.name.isBlank || draft.name.count > 100 ||
                                  draft.slots.isEmpty || !draft.slots.allSatisfy(\.isValid))
                }
            }
            .interactiveDismissDisabled(busy)
        }
    }

    private func suggest() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            draft = try await api.post("/themes/preview", payload: ["goal": goal])
            if draft.slots.isEmpty { error = "No rules were suggested. Add a matching rule to build the checklist manually." }
        } catch { self.error = error.localizedDescription }
    }

    private func save() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            let path = checklistID.map { "/themes/" + $0 } ?? "/themes"
            try await api.write(path, method: checklistID == nil ? "POST" : "PUT", payload: draft)
            onSave()
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

private struct ChecklistRuleEditor: View {
    @Binding var rule: ChecklistRule
    var body: some View {
        Form {
            TextField("Label", text: $rule.label)
            Picker("Type", selection: $rule.type) {
                Text("Any").tag(nil as String?)
                Text("Coin").tag(Optional("coin"))
                Text("Banknote").tag(Optional("banknote"))
            }
            TextField("Issuer", text: text($rule.issuer))
            TextField("Ruler", text: text($rule.ruler))
            TextField("Denomination", text: text($rule.denomination))
            TextField("Catalog reference", text: text($rule.reference))
            TextField("Year (exact)", text: text($rule.year))
            TextField("Metal", text: text($rule.metal))
            TextField("Series", text: text($rule.series))
            TextField("From year (optional)", value: $rule.dateFrom, format: .number.grouping(.never))
                .keyboardType(.numbersAndPunctuation)
            TextField("To year (optional)", value: $rule.dateTo, format: .number.grouping(.never))
                .keyboardType(.numbersAndPunctuation)
        }
        .navigationTitle("Matching rule")
    }

    private func text(_ value: Binding<String?>) -> Binding<String> {
        Binding(get: { value.wrappedValue ?? "" }, set: { value.wrappedValue = $0 })
    }
}
