import AVFoundation
import PhotosUI
import SwiftUI
import UIKit

struct GuestWelcome: View {
    let start: () -> Void
    let signIn: () -> Void
    let restore: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Label("NumiAgent", systemImage: "circle.hexagongrid.fill")
                    .font(.headline).foregroundStyle(.tint)
                Text("Catalog your coins and banknotes")
                    .font(.largeTitle.bold()).accessibilityAddTraits(.isHeader)
                Text("Photograph both sides and build a searchable collection on this device. No email needed.")
                    .foregroundStyle(.secondary)
                Button(action: start) {
                    Label("Start scanning", systemImage: "camera").frame(maxWidth: .infinity, minHeight: 32)
                }.buttonStyle(.borderedProminent)
                Button("Sign in with email", action: signIn).buttonStyle(.bordered)
                Button("Restore backup", action: restore)
            }.frame(maxWidth: 430, alignment: .leading).padding(28)
            .frame(maxWidth: .infinity)
        }
        .background(CollectorDesign.background)
    }
}

private enum GuestFilter: String, CaseIterable, Identifiable {
    case all = "All", coin = "Coins", banknote = "Banknotes", unidentified = "Unidentified"
    var id: Self { self }
}

struct GuestWorkspace: View {
    @ObservedObject var store: GuestStore
    let api: NumiAPI
    let accountTitle: String?
    let openAccount: () -> Void
    @Binding var scanOnOpen: Bool
    @State private var selected: UUID?
    @State private var editor: GuestPiece?
    @State private var search = ""
    @State private var filter = GuestFilter.all
    @State private var menu: GuestFileAction?
    @State private var showPrivacy = false
    @State private var imports: [PhotosPickerItem] = []
    @State private var importing = false

    var body: some View {
        NavigationSplitView {
            List(selection: $selected) {
                Section {
                    Text("Saved on this device").foregroundStyle(.secondary)
                    if let active = store.active, !active.drafts.isEmpty {
                        Button("Resume batch", systemImage: "camera.viewfinder") {
                            if let draft = active.activeDraft ?? active.drafts.first?.id { open(draft) }
                        }
                        ForEach(active.drafts) { piece in
                            Button(piece.title.isEmpty ? "Unfinished piece \(draftNumber(piece.id))" : piece.title) { open(piece.id) }
                        }
                    }
                    if importing { ProgressView("Importing photos") }
                }
                Section("Items") {
                    Picker("Show", selection: $filter) {
                        ForEach(GuestFilter.allCases) { option in Text(option.rawValue).tag(option) }
                    }
                    if filtered.isEmpty {
                        ContentUnavailableView(search.isEmpty ? "No pieces yet" : "No matches",
                                               systemImage: "square.grid.2x2",
                                               description: Text(search.isEmpty ? "Scan or enter a piece to get started." : "Try another search or filter."))
                    }
                    ForEach(filtered) { piece in
                        NavigationLink(value: piece.id) {
                            VStack(alignment: .leading) {
                                Text(piece.displayTitle)
                                Text([piece.issuer, piece.denomination, piece.year].filter { !$0.isEmpty }.joined(separator: " · "))
                                    .font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle(store.active?.name ?? "My collection")
            .searchable(text: $search, prompt: "Name, issuer, denomination or year")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu("Collection menu", systemImage: "ellipsis.circle") {
                        if store.collections.count > 1 {
                            Section("On this iPhone") {
                                ForEach(store.collections) { collection in
                                    Button(collection.name) { act { try store.select(collection.id); selected = nil } }
                                }
                            }
                        }
                        Button("Back up collection", systemImage: "lock") { menu = .backup }
                        Button("Restore backup", systemImage: "arrow.down.doc") { menu = .restore }
                        Button("Export spreadsheet", systemImage: "tablecells") { menu = .csv }
                        Section("Settings") {
                            Button("Privacy & browser access", systemImage: "hand.raised") { showPrivacy = true }
                            Button(accountTitle ?? "Sign in with email", systemImage: "person.crop.circle", action: openAccount)
                        }
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    Menu("Add item", systemImage: "plus") {
                        Button("Scan a piece", systemImage: "camera") { start() }
                        PhotosPicker(selection: $imports, maxSelectionCount: 20, selectionBehavior: .ordered, matching: .images) {
                            Label("Import a photo batch", systemImage: "photo.on.rectangle")
                        }
                        Button("Enter details manually", systemImage: "square.and.pencil") { start() }
                    }.disabled(importing)
                }
            }
        } detail: {
            if let selected, store.piece(selected) != nil {
                GuestPieceScreen(store: store, api: api, id: selected, newPiece: nil) { self.selected = nil }
                    .id(selected)
            } else {
                ContentUnavailableView("My collection", systemImage: "square.grid.2x2",
                                       description: Text("Select a piece to open its record."))
            }
        }
        .task {
            if scanOnOpen {
                scanOnOpen = false
                start()
            }
        }
        .onChange(of: imports) { _, picks in
            guard !picks.isEmpty, !importing, let collectionID = store.activeID else { return }
            importing = true
            Task {
                defer { importing = false; imports = [] }
                var failures = 0
                for pick in picks {
                    do {
                        let image = try await loadCaptureImage(pick)
                        guard store.activeID == collectionID else {
                            store.error = "Import stopped when you switched collections. Accepted photos are saved in the original collection."
                            return
                        }
                        try store.importDraft(CaptureDraftStore.jpeg(image))
                    } catch { failures += 1 }
                }
                if failures > 0 { store.error = "\(failures) photos could not be imported. The others are saved as drafts." }
            }
        }
        .sheet(item: $editor) { item in
            NavigationStack {
                GuestPieceScreen(store: store, api: api, id: item.id, newPiece: {
                    start()
                }) { editor = nil }
                .id(item.id)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { editor = nil } } }
            }
        }
        .sheet(item: $menu) { action in GuestFiles(store: store, action: action) }
        .sheet(isPresented: $showPrivacy) { GuestPrivacyView() }
        .guestStorageAlert(store)
    }

    private var filtered: [GuestPiece] {
        (store.active?.pieces ?? []).filter { piece in
            let matchesType: Bool
            switch filter {
            case .all: matchesType = true
            case .coin: matchesType = piece.type == "coin"
            case .banknote: matchesType = piece.type == "banknote"
            case .unidentified: matchesType = piece.status == .unidentified
            }
            return matchesType && (search.isEmpty || [piece.displayTitle, piece.issuer, piece.denomination, piece.year]
                .contains { $0.localizedStandardContains(search) })
        }
    }

    private func draftNumber(_ id: UUID) -> Int {
        let index = store.active?.drafts.firstIndex { $0.id == id } ?? 0
        return (store.active?.pieces.count ?? 0) + index + 1
    }

    private func start() { act { let id = try store.draft(); editor = store.piece(id) } }
    private func open(_ id: UUID) { act { try store.resume(id); editor = store.piece(id) } }
    private func act(_ action: () throws -> Void) {
        do { try action() } catch { store.error = error.localizedDescription }
    }
}

private struct GuestPrivacyView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var confirmBrowser = false

    var body: some View {
        NavigationStack {
            Form {
                Section("On this device") {
                    Text("Guest photos, drafts and collection details are saved here. The app excludes them from automatic device backups. You can save your own encrypted backup in Files or export a spreadsheet and choose whether to include private fields.")
                }
                Section("Online identification") {
                    Text("Local identification runs on this device. When you choose Search online, you select which photos to send to NumiAgent for processing by Cloudflare Workers AI.")
                }
                Section("Browser access") {
                    Text("You can open a separate web collection and sign in with your email. Opening the browser or signing in leaves your guest collection on this device.")
                    Button("Open web account", systemImage: "safari") { confirmBrowser = true }
                }
            }
            .navigationTitle("Privacy & browser access")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
            .confirmationDialog("Open NumiAgent in your browser?", isPresented: $confirmBrowser, titleVisibility: .visible) {
                Button("Continue to web account") { openURL(NumiAPI.url("/app")) }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Browser sign-in is separate. No guest photos, records or sign-in credentials are shared by this action.")
            }
        }
    }
}

private struct GuestOnlineConsent: View {
    @Environment(\.dismiss) private var dismiss
    let photos: [GuestSide: UUID]
    @State var selected: Set<UUID>
    let send: (Set<UUID>) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(GuestSide.allCases) { side in
                        if let photo = photos[side] {
                            let isSelected = selected.contains(photo)
                            Button {
                                if isSelected { selected.remove(photo) } else { selected.insert(photo) }
                            } label: {
                                HStack {
                                    Text(side.title + " photo")
                                    Spacer()
                                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(.tint)
                                        .accessibilityHidden(true)
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(isSelected ? .isSelected : [])
                            .accessibilityIdentifier("guest-online-" + side.rawValue)
                        }
                    }
                    Text("NumiAgent sends only the selected photos for processing by Cloudflare Workers AI. Your notes, purchase details, and email stay out of this search.")
                    Button("Send selected photos") {
                        dismiss()
                        send(selected)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(selected.isEmpty)
                    Button("Keep on this iPhone", role: .cancel) { dismiss() }
                } header: {
                    Text("\(selected.count) selected")
                }
            }
            .navigationTitle("Search online")
        }
    }
}

private struct GuestPieceScreen: View {
    @ObservedObject var store: GuestStore
    let api: NumiAPI
    let id: UUID
    let newPiece: (() -> Void)?
    let done: () -> Void
    @State private var picking: PhotosPickerItem?
    @State private var photoPicker = false
    @State private var selectedSide = GuestSide.front
    @State private var camera = false
    @State private var busy = false
    @State private var lookingOnline = false
    @State private var askOnline = false
    @State private var askDelete = false
    @State private var recognitionError: String?
    @State private var onlineError: String?
    @State private var pendingPair: GuestPiece?

    var body: some View {
        Group {
            if let piece = store.piece(id) {
                Form {
                    photoSection(piece)
                    matchesSection(piece)
                    details
                    Section {
                        Button("Save confirmed", systemImage: "checkmark") { save(.confirmed) }
                        Button("Save as unidentified") { save(.unidentified) }
                        if isDraft {
                            Button("Save and scan next") {
                                act { try store.save(id, status: piece.title.isEmpty ? .unidentified : .confirmed) }
                                if store.piece(id)?.onlineJob == nil, !isDraft { newPiece?() }
                            }
                            Button("Save for later") { act { try store.park(id); done() } }
                        }
                        Button(isDraft ? "Delete draft" : "Delete piece", role: .destructive) { askDelete = true }
                    }
                }
                .scrollDismissesKeyboard(.interactively)
                .navigationTitle(isDraft ? draftTitle : piece.displayTitle)
                .task(id: photoVersion(piece)) { await recognize(piece) }
            }
        }
        .photosPicker(isPresented: $photoPicker, selection: $picking, matching: .images)
        .onChange(of: picking) { _, pick in
            guard let pick else { return }
            let side = selectedSide
            busy = true
            Task {
                defer { busy = false; picking = nil }
                do { try store.putPhoto(CaptureDraftStore.jpeg(try await loadCaptureImage(pick)), piece: id, side: side) }
                catch { store.error = error.localizedDescription }
            }
        }
        .fullScreenCover(isPresented: $camera) {
            CameraPicker { image in
                if let image { act { try store.putPhoto(CaptureDraftStore.jpeg(image), piece: id, side: selectedSide) } }
                camera = false
            }.ignoresSafeArea()
        }
        .sheet(isPresented: $askOnline) {
            if let piece = store.piece(id) {
                let previouslySelected = Set(piece.onlineJob?.photos ?? []).intersection(piece.photos.values)
                GuestOnlineConsent(photos: piece.photos, selected: previouslySelected) { selection in
                    Task { await searchOnline(selection) }
                }
            }
        }
        .confirmationDialog(isDraft ? "Delete this draft?" : "Delete this piece?", isPresented: $askDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { act { try store.delete(id); done() } }
        }
        .confirmationDialog("Use this draft photo as the back?", isPresented: Binding(
            get: { pendingPair != nil }, set: { if !$0 { pendingPair = nil } }
        ), titleVisibility: .visible, presenting: pendingPair) { candidate in
            Button("Pair photos") { act { try store.pairDraft(candidate.id, with: id) } }
        } message: { _ in
            Text("The two drafts will become one piece, with both photos kept.")
        }
        .guestStorageAlert(store)
    }

    private var isDraft: Bool { store.active?.drafts.contains(where: { $0.id == id }) == true }

    private var draftTitle: String {
        let saved = store.active?.pieces.count ?? 0
        let drafts = store.active?.drafts ?? []
        let current = drafts.firstIndex { $0.id == id } ?? 0
        return "Piece \(saved + current + 1) of \(saved + drafts.count)"
    }

    private func photoSection(_ piece: GuestPiece) -> some View {
        Section("Photos") {
            ForEach(GuestSide.allCases) { side in
                if let photo = piece.photos[side], let image = UIImage(contentsOfFile: store.photoURL(photo).path) {
                    Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 220)
                        .accessibilityLabel(side.title + " photo")
                }
                HStack {
                    Button(side.title + (piece.photos[side] == nil ? " photo" : " retake"), systemImage: "camera") { take(side) }
                        .disabled(!UIImagePickerController.isSourceTypeAvailable(.camera))
                    Button("Import " + side.rawValue, systemImage: "photo") {
                        selectedSide = side
                        photoPicker = true
                    }
                }.buttonStyle(.borderless)
                if piece.photos[side] != nil {
                    Button("Remove " + side.rawValue, role: .destructive) { act { try store.removePhoto(side, from: id) } }
                }
                #if DEBUG
                if ProcessInfo.processInfo.arguments.contains("--guest-photo-fixtures"),
                   let image = UIImage(named: "DemoNickel") {
                    Button("Use sample " + side.rawValue) {
                        act { try store.putPhoto(CaptureDraftStore.jpeg(image), piece: id, side: side) }
                    }
                }
                #endif
            }
            if !piece.photos.isEmpty {
                Button("Swap front and back", systemImage: "arrow.left.arrow.right") { act { try store.swapPhotos(id) } }
            }
            if isDraft && piece.photos[.front] != nil && piece.photos[.back] == nil {
                let candidates = (store.active?.drafts ?? []).filter {
                    $0.id != id && $0.photos.count == 1 && $0.photos[.front] != nil &&
                    [$0.title, $0.notes, $0.serial, $0.purchasePrice, $0.purchaseCurrency, $0.issuer, $0.year, $0.denomination].allSatisfy(\.isEmpty)
                }
                if !candidates.isEmpty {
                    Menu("Pair back from another draft") {
                        ForEach(candidates) { other in
                            let position = (store.active?.drafts.firstIndex { $0.id == other.id } ?? 0) + 1
                            Button("Draft \(position)") { pendingPair = other }
                        }
                    }
                }
            }
        }.disabled(busy || lookingOnline)
    }

    private func matchesSection(_ piece: GuestPiece) -> some View {
        Section("Identification") {
            if lookingOnline || (!piece.photos.isEmpty && piece.recognition == nil && recognitionError == nil) {
                ProgressView("Finding matches…")
            } else if let result = piece.recognition {
                Text(result.likely ? "Likely match" : result.suggestions.isEmpty ? "Needs review" : "Possible matches")
                    .font(.headline)
                ForEach(result.suggestions) { suggestion in
                    VStack(alignment: .leading, spacing: 4) {
                        Button(suggestion.title) { apply(suggestion) }
                        if !suggestion.evidence.isEmpty {
                            Text(suggestion.evidence.joined(separator: " · ")).font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        if let reference = suggestion.reference { Link("View reference", destination: reference).font(.footnote) }
                    }
                }
                if !result.observations.isEmpty {
                    DisclosureGroup("Read from photos") {
                        Text(result.observations.joined(separator: "\n")).font(.footnote)
                    }
                }
            } else {
                Text("Needs review").font(.headline)
            }
            if let recognitionError { Text(recognitionError).font(.footnote) }
            if let onlineError { Text(onlineError).font(.footnote) }
            if !piece.photos.isEmpty && !lookingOnline {
                Button(piece.onlineJob == nil && onlineError == nil ? "Search online" : "Retry online search", systemImage: "magnifyingglass") {
                    askOnline = true
                }
                    .disabled(busy)
            }
        }
    }

    private var details: some View {
        Section("Details") {
            Picker("Type", selection: field(\.type)) { Text("Coin").tag("coin"); Text("Banknote").tag("banknote") }
                .pickerStyle(.segmented)
            TextField("Title", text: field(\.title))
            TextField("Issuer or country", text: field(\.issuer))
            TextField("Denomination", text: field(\.denomination))
            TextField("Year", text: field(\.year))
            TextField("Notes", text: field(\.notes), axis: .vertical)
            DisclosureGroup("Private details") {
                TextField("Serial number", text: field(\.serial))
                TextField("Purchase price", text: field(\.purchasePrice)).keyboardType(.decimalPad)
                TextField("Currency", text: field(\.purchaseCurrency)).textInputAutocapitalization(.characters)
            }
            if let reference = store.piece(id)?.reference { Link("Saved reference", destination: reference) }
        }
    }

    private func field(_ path: WritableKeyPath<GuestPiece, String>) -> Binding<String> {
        Binding(get: { store.piece(id)?[keyPath: path] ?? "" }, set: { input in
            act { try store.changePiece(id) { $0[keyPath: path] = input } }
        })
    }

    private func take(_ side: GuestSide) {
        selectedSide = side
        Task {
            let allowed = await AVCaptureDevice.requestAccess(for: .video)
            if allowed { camera = true }
            else { store.error = "Camera access is off. You can still import a photo or enter details." }
        }
    }

    private func photoVersion(_ piece: GuestPiece) -> [UUID] {
        GuestSide.allCases.compactMap { piece.photos[$0] }
    }

    private func recognize(_ piece: GuestPiece) async {
        guard !piece.photos.isEmpty, piece.recognition == nil else { return }
        recognitionError = nil
        onlineError = nil
        let version = photoVersion(piece)
        let urls = version.map { store.photoURL($0) }
        do {
            let result = try await Task.detached(priority: .userInitiated) {
                try LocalRecognition.bundledResult(for: urls)
            }.value
            guard !Task.isCancelled, let current = store.piece(id), photoVersion(current) == version,
                  current.recognition == nil else { return }
            try store.changePiece(id) { $0.recognition = result }
        } catch {
            if !Task.isCancelled { recognitionError = "Couldn’t read these photos. You can still enter details." }
        }
    }

    private func searchOnline(_ selected: Set<UUID>) async {
        guard !lookingOnline, let piece = store.piece(id) else { return }
        let version = photoVersion(piece)
        let photos = version.filter { selected.contains($0) }
        guard !photos.isEmpty else { return }
        let front = piece.photos[.front].flatMap { selected.contains($0) ? $0 : nil }
        let back = piece.photos[.back].flatMap { selected.contains($0) ? $0 : nil }
        lookingOnline = true
        onlineError = nil
        defer { lookingOnline = false }
        do {
            let job = piece.onlineJob.flatMap { $0.expired || $0.photos != photos ? nil : $0 } ?? GuestOnlineJob(photos: photos)
            try store.changePiece(id) { $0.onlineJob = job }
            let frontData = try front.map { try Data(contentsOf: store.photoURL($0)) }
            let backData = try back.map { try Data(contentsOf: store.photoURL($0)) }
            let result = try await api.searchGuestPhotos(id: job.id, key: job.key, front: frontData, back: backData)
            guard let current = store.piece(id), photoVersion(current) == version,
                  current.onlineJob?.id == job.id else { return }
            if result.state == "complete" {
                try store.changePiece(id) {
                    var matches = result.recognition
                    matches.observations = $0.recognition?.observations ?? []
                    if matches.suggestions.isEmpty { matches.suggestions = $0.recognition?.suggestions ?? [] }
                    $0.recognition = matches
                    $0.onlineJob = nil
                }
                if result.recognition.suggestions.isEmpty {
                    onlineError = "No online matches found. You can still use the local suggestions or enter details yourself."
                }
            } else {
                onlineError = "Search is still processing. Retry to pick up the result."
            }
        } catch let error as NumiError {
            switch error {
            case .request(409, _), .request(410, _):
                try? store.changePiece(id) { $0.onlineJob = nil }
            default: break
            }
            onlineError = error.localizedDescription
        } catch {
            onlineError = "Online search couldn’t finish. Your photos and edits are saved. Try again when connected."
        }
    }

    private func apply(_ suggestion: LocalSuggestion) {
        act {
            try store.changePiece(id) { piece in
                piece.type = suggestion.type
                piece.title = suggestion.title
                if !suggestion.issuer.isEmpty { piece.issuer = suggestion.issuer }
                if !suggestion.denomination.isEmpty { piece.denomination = suggestion.denomination }
                if !suggestion.year.isEmpty { piece.year = suggestion.year }
                piece.reference = suggestion.reference
            }
        }
    }

    private func save(_ status: GuestStatus) { act { try store.save(id, status: status); done() } }
    private func act(_ action: () throws -> Void) { do { try action() } catch { store.error = error.localizedDescription } }
}

extension View {
    @MainActor
    func guestStorageAlert(_ store: GuestStore) -> some View {
        alert("NumiAgent", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(store.error ?? "") }
    }
}
