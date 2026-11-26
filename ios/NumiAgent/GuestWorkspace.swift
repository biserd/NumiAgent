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
                    Text("Local identification runs on this device. Search online sends the photos shown for that piece to NumiAgent for processing by Cloudflare Workers AI.")
                }
                Section("Comparable sales") {
                    Text("When you check Numista, NumiAgent uses the piece type, issuer, denomination and year to look up completed auctions. Photos, notes and purchase details stay here.")
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

private struct GuestPieceScreen: View {
    @ObservedObject var store: GuestStore
    let api: NumiAPI
    let id: UUID
    let newPiece: (() -> Void)?
    let done: () -> Void
    @State private var picking: [PhotosPickerItem] = []
    @State private var photoPicker = false
    @State private var selectedSide = GuestSide.front
    @State private var camera = false
    @State private var busy = false
    @State private var lookingOnline = false
    @State private var catalogPicker = false
    @State private var askDelete = false
    @State private var recognitionError: String?
    @State private var onlineError: String?
    @State private var pendingPair: GuestPiece?
    @State private var zoomedSide: GuestSide?
    @State private var cardPresented = false
    @State private var salesPresented = false
    @State private var showAlternatives = false
    @State private var selectedMatch = false
    @State private var onlineCompleted = false

    var body: some View {
        Group {
            if let piece = store.piece(id) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(isDraft ? "Scan a piece" : piece.displayTitle)
                                .font(.largeTitle.bold()).accessibilityAddTraits(.isHeader)
                            if isDraft { Text("Coins and banknotes").foregroundStyle(.secondary) }
                        }
                        if !isDraft || !piece.denomination.isBlank || !piece.title.isBlank {
                            Button("Find comparable sales", systemImage: "chart.bar") { salesPresented = true }
                                .buttonStyle(.bordered)
                                .accessibilityIdentifier("guest-comparable-sales")
                        }
                        ViewThatFits(in: .horizontal) {
                            HStack(alignment: .top, spacing: 20) {
                                photoSection(piece).frame(maxWidth: .infinity, alignment: .topLeading)
                                recordSection(piece).frame(maxWidth: .infinity, alignment: .topLeading)
                            }.frame(minWidth: 660, maxWidth: .infinity)
                            VStack(alignment: .leading, spacing: 16) {
                                photoSection(piece)
                                recordSection(piece)
                            }
                        }
                    }
                    .frame(maxWidth: 1040, alignment: .leading).padding(20)
                    .frame(maxWidth: .infinity)
                }
                .background(CollectorDesign.background)
                .accessibilityIdentifier("guest-record-scroll")
                .scrollDismissesKeyboard(.interactively)
                .navigationTitle(isDraft ? draftTitle : piece.displayTitle)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu("Piece actions", systemImage: "ellipsis.circle") {
                            Button("Search offline catalog", systemImage: "books.vertical") { catalogPicker = true }
                            if let sold = soldListingsURL([piece.issuer, piece.denomination, piece.year].filter { !$0.isBlank }.joined(separator: " ")) {
                                Link("Compare sold listings on eBay", destination: sold)
                            }
                            if !piece.title.isBlank && !canConfirm(piece) {
                                Button("Confirm and save", systemImage: "checkmark") { save(.confirmed) }
                            }
                            if isDraft, let newPiece {
                                Button("Save and scan next", systemImage: "camera") {
                                    act { try store.save(id, status: canConfirm(piece) ? .confirmed : .unidentified); newPiece() }
                                }
                            }
                            if isDraft { Button("Save for later", systemImage: "tray") { done() } }
                            Button(isDraft ? "Delete draft" : "Delete piece", systemImage: "trash", role: .destructive) { askDelete = true }
                        }
                    }
                }
                .safeAreaInset(edge: .bottom, spacing: 0) { saveBar(piece) }
                .task(id: photoVersion(piece)) { await recognize(piece) }
            }
        }
        .photosPicker(isPresented: $photoPicker, selection: $picking,
                      maxSelectionCount: max(1, 2 - (store.piece(id)?.photos.count ?? 0)),
                      selectionBehavior: .ordered, matching: .images)
        .onChange(of: picking) { _, picks in
            guard !picks.isEmpty, !busy, let collectionID = store.activeID else { return }
            busy = true
            Task {
                defer { busy = false; picking = [] }
                var failed = 0
                for pick in picks {
                    do {
                        let photo = try await loadCaptureImage(pick)
                        guard store.activeID == collectionID, let piece = store.piece(id), let side = nextSide(piece) else { break }
                        try store.putPhoto(CaptureDraftStore.jpeg(photo), piece: id, side: side)
                    } catch { failed += 1 }
                }
                if failed > 0 { store.error = "\(failed) photos could not be imported. Accepted photos are saved." }
            }
        }
        .fullScreenCover(isPresented: $camera) {
            CameraPicker { image in
                if let image { act { try store.putPhoto(CaptureDraftStore.jpeg(image), piece: id, side: selectedSide) } }
                camera = false
            }.ignoresSafeArea()
        }
        .sheet(item: $zoomedSide) { side in
            if let id = store.piece(id)?.photos[side], let photo = UIImage(contentsOfFile: store.photoURL(id).path) {
                GuestPhotoPreview(photo: photo)
            }
        }
        .sheet(isPresented: $catalogPicker) {
            OfflineCatalogPicker { suggestion in
                apply(suggestion)
                catalogPicker = false
            }
        }
        .sheet(isPresented: $salesPresented) {
            if let piece = store.piece(id) { DeviceSaleResearch(api: api, piece: piece) }
        }
        .sheet(isPresented: $cardPresented) {
            if let piece = store.piece(id), let collection = store.activeID {
                OpinionCardSheet(record: OpinionCardRecord(piece)) {
                    try GuestSide.allCases.compactMap { side in
                        guard let photo = piece.photos[side] else { return nil }
                        return try CardPhotos.image(data: Data(contentsOf: store.photoURL(photo, in: collection)))
                    }
                }
            }
        }
        .confirmationDialog(isDraft ? "Delete this draft?" : "Delete this piece?", isPresented: $askDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { act { try store.delete(id); done() } }
        }
        .confirmationDialog("Add this draft photo to the piece?", isPresented: Binding(
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

    private func nextSide(_ piece: GuestPiece) -> GuestSide? {
        GuestSide.allCases.first { piece.photos[$0] == nil }
    }

    private func photoNumber(_ side: GuestSide) -> Int { side == .front ? 1 : 2 }

    private func photoSection(_ piece: GuestPiece) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Photos").font(.headline).accessibilityAddTraits(.isHeader)
                Spacer()
                Text("\(piece.photos.count) of 2").font(.subheadline).foregroundStyle(.secondary)
                    .accessibilityLabel("\(piece.photos.count) of 2 photos")
            }
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 8) {
                    ForEach(GuestSide.allCases) { side in
                        if let photo = piece.photos[side], let image = UIImage(contentsOfFile: store.photoURL(photo).path) {
                            Image(uiImage: image).resizable().scaledToFit()
                                .frame(maxWidth: .infinity).frame(height: 115)
                                .padding(6)
                                .background(CollectorDesign.highlight.opacity(0.5), in: .rect(cornerRadius: 12))
                                .accessibilityLabel("Photo \(photoNumber(side))")
                                .overlay(alignment: .bottomTrailing) {
                                    Button { zoomedSide = side } label: {
                                        Image(systemName: "magnifyingglass").frame(width: 44, height: 44)
                                            .background(CollectorDesign.surface, in: .rect(cornerRadius: 10))
                                            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(CollectorDesign.tint.opacity(0.35)))
                                    }.buttonStyle(.plain)
                                        .foregroundStyle(.tint).padding(5)
                                        .accessibilityLabel("Zoom photo \(photoNumber(side))")
                                }
                        } else {
                            Image(systemName: "photo").font(.title2).foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity).frame(height: 127)
                                .background(CollectorDesign.highlight.opacity(0.42), in: .rect(cornerRadius: 12))
                                .accessibilityHidden(true)
                        }
                    }
                }
                if let side = nextSide(piece) {
                    Text(piece.photos.isEmpty ? "Add one or both sides in any order." : "Add the other side to improve your match.")
                        .font(.subheadline).foregroundStyle(.secondary)
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 8) { photoActions(side, isEmpty: piece.photos.isEmpty) }
                        VStack(spacing: 8) { photoActions(side, isEmpty: piece.photos.isEmpty) }
                    }
                    #if DEBUG
                    if ProcessInfo.processInfo.arguments.contains("--guest-photo-fixtures"), let image = UIImage(named: "DemoNickel") {
                        scanButton("Add sample photo", icon: "photo") {
                            act { try store.putPhoto(CaptureDraftStore.jpeg(image), piece: id, side: side) }
                        }
                    }
                    #endif
                }
                if !piece.photos.isEmpty {
                    Button("Ask for a second opinion", systemImage: "square.and.arrow.up") {
                        cardPresented = true
                    }.buttonStyle(.bordered)
                    Menu {
                        ForEach(GuestSide.allCases) { side in
                            if piece.photos[side] != nil {
                                Button("Retake photo \(photoNumber(side))", systemImage: "camera") { take(side) }
                                    .disabled(!UIImagePickerController.isSourceTypeAvailable(.camera))
                                Button("Remove photo \(photoNumber(side))", role: .destructive) { act { try store.removePhoto(side, from: id) } }
                            }
                        }
                        if isDraft, piece.photos.count == 1 {
                            let candidates = store.active?.drafts.filter { other in
                                other.id != id && other.photos.count == 1 && other.photos[.front] != nil &&
                                [other.title, other.notes, other.serial, other.purchasePrice, other.purchaseCurrency,
                                 other.issuer, other.year, other.denomination, other.inscription ?? ""].allSatisfy(\.isEmpty)
                            } ?? []
                            if !candidates.isEmpty {
                                Menu("Pair a photo from another draft") {
                                    ForEach(candidates) { other in
                                        let position = (store.active?.drafts.firstIndex { $0.id == other.id } ?? 0) + 1
                                        Button("Draft \(position)") { pendingPair = other }
                                    }
                                }
                            }
                        }
                    } label: {
                        Label("Manage photos", systemImage: "photo.on.rectangle")
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(CollectorDesign.tint.opacity(0.35)))
                    }.buttonStyle(.plain).foregroundStyle(.tint)
                }
                if busy { ProgressView("Importing photos…") }
            }.padding(14).background(CollectorDesign.surface, in: .rect(cornerRadius: 16))
        }.disabled(busy || lookingOnline)
    }

    @ViewBuilder
    private func photoActions(_ side: GuestSide, isEmpty: Bool) -> some View {
        scanButton("Take photo", icon: "camera", prominent: isEmpty) { take(side) }
            .disabled(!UIImagePickerController.isSourceTypeAvailable(.camera))
        scanButton("Import photos", icon: "photo.on.rectangle") { photoPicker = true }
    }

    private func recordSection(_ piece: GuestPiece) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if piece.photos.isEmpty {
                CollectorNotice(title: "Identification starts automatically", message: "Add a photo to scan this piece on your device.", icon: "text.viewfinder")
            } else if lookingOnline {
                ProgressView("Searching online…").padding(12)
            } else if !busy, piece.recognition == nil && recognitionError == nil {
                ProgressView("Reading photos…").padding(12)
            } else if let onlineError {
                CollectorNotice(title: "Online search", message: onlineError, icon: "exclamationmark.circle", warning: true)
            } else if let recognitionError {
                CollectorNotice(title: "Needs review", message: recognitionError, icon: "exclamationmark.circle", warning: true)
            } else if piece.recognition?.likely == true || selectedMatch {
                CollectorNotice(title: selectedMatch ? "Match selected" : "Likely match",
                                message: "Review the filled details before saving.", icon: "checkmark.circle")
            } else if !busy {
                CollectorNotice(title: "Needs review", message: "Review the details the scan could read. Leave uncertain fields blank.",
                                icon: "info.circle", warning: true)
            }
            if !piece.photos.isEmpty && !lookingOnline && !onlineCompleted && piece.recognition?.likely != true {
                let retry = piece.onlineJob != nil || onlineError != nil
                let photoDescription = piece.photos.count == 1 ? "the photo shown" : "both photos shown"
                VStack(alignment: .leading, spacing: 6) {
                    Text("This sends \(photoDescription) to NumiAgent for processing by Cloudflare Workers AI. Notes and private details stay on this device.")
                        .font(.footnote).foregroundStyle(.secondary).accessibilityIdentifier("guest-online-disclosure")
                    scanButton(retry ? "Retry online search" : "Search online", icon: "magnifyingglass", prominent: true) {
                        Task { await searchOnline() }
                    }.accessibilityIdentifier("guest-search-online").disabled(busy)
                }
            }
            details
            if let result = piece.recognition, !result.suggestions.isEmpty, !result.likely {
                scanButton(showAlternatives ? "Hide possible matches" : "See possible matches",
                           icon: showAlternatives ? "chevron.up" : "chevron.down") { showAlternatives.toggle() }
                if showAlternatives {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(result.suggestions) { suggestion in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(suggestion.title).font(.headline)
                                if !suggestion.evidence.isEmpty {
                                    Text(suggestion.evidence.joined(separator: " · ")).font(.footnote).foregroundStyle(.secondary)
                                }
                                scanButton("Use match", icon: "checkmark") { apply(suggestion) }
                                if let reference = suggestion.reference { Link("View reference", destination: reference).font(.footnote) }
                            }
                        }
                    }.padding(14).background(CollectorDesign.surface, in: .rect(cornerRadius: 16))
                }
            }
            if let result = piece.recognition, !result.observations.isEmpty {
                DisclosureGroup("Read from photos") {
                    Text(result.observations.joined(separator: "\n")).font(.footnote).textSelection(.enabled)
                }.padding(.horizontal, 6)
            }
        }
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text("Record details").font(.headline).accessibilityAddTraits(.isHeader)
                Spacer()
                Text("Editable").font(.caption).foregroundStyle(.secondary)
            }
            Picker("Type", selection: field(.type)) { Text("Coin").tag("coin"); Text("Banknote").tag("banknote") }
                .pickerStyle(.segmented)
            detailRow("Name", field: .title)
            detailRow("Issuer or country", field: .issuer)
            detailRow("Denomination", field: .denomination)
            detailRow("Year", field: .year)
            DisclosureGroup("Inscription") {
                TextField("Inscription on the piece", text: Binding(
                    get: { store.piece(id)?.inscription ?? "" },
                    set: { input in act { try store.changePiece(id) { $0.inscription = String(input.prefix(180)) } } }
                ), axis: .vertical).textFieldStyle(.roundedBorder)
            }
            TextField("Notes", text: text(\.notes), axis: .vertical).padding(8)
            DisclosureGroup("Private details") {
                TextField("Serial number", text: text(\.serial))
                TextField("Purchase price", text: text(\.purchasePrice)).keyboardType(.decimalPad)
                TextField("Currency", text: text(\.purchaseCurrency)).textInputAutocapitalization(.characters)
            }
            if let reference = store.piece(id)?.reference { Link("Saved reference", destination: reference) }
        }.padding(14).background(CollectorDesign.surface, in: .rect(cornerRadius: 16))
    }

    private func detailRow(_ title: String, field key: GuestDetailField) -> some View {
        HStack(spacing: 8) {
            Text(title).foregroundStyle(.secondary).accessibilityHidden(true)
            TextField(title, text: field(key), prompt: Text("Enter value").foregroundStyle(.secondary))
                .multilineTextAlignment(.trailing)
                .accessibilityLabel(title).accessibilityIdentifier("guest-field-" + key.rawValue)
        }.padding(.horizontal, 9).frame(minHeight: 44)
            .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(Color.secondary.opacity(0.24)))
    }

    private func scanButton(_ title: String, icon: String, prominent: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon).font(.subheadline.weight(.semibold))
                .padding(.horizontal, 6).frame(maxWidth: .infinity, minHeight: 44)
                .foregroundStyle(prominent ? Color.white : CollectorDesign.tint)
                .background(prominent ? CollectorDesign.forest : CollectorDesign.surface, in: .rect(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(CollectorDesign.tint.opacity(prominent ? 0 : 0.45)))
                .contentShape(.rect(cornerRadius: 10))
        }.buttonStyle(.plain)
    }

    private func canConfirm(_ piece: GuestPiece) -> Bool {
        (piece.status == .confirmed || selectedMatch || piece.recognition?.likely == true) && !piece.title.isBlank
    }

    private func saveBar(_ piece: GuestPiece) -> some View {
        let confirmed = canConfirm(piece)
        return VStack(spacing: 4) {
            scanButton(confirmed ? "Save to collection" : "Save for review", icon: "checkmark",
                       prominent: confirmed) { save(confirmed ? .confirmed : .unidentified) }
                .accessibilityIdentifier("guest-save-record").disabled(busy || lookingOnline)
            Text(confirmed ? "You can edit this record later." : "Keep this piece even if the match is uncertain.")
                .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }.padding(.horizontal, 20).padding(.vertical, 9).frame(maxWidth: 1040).frame(maxWidth: .infinity)
            .background(CollectorDesign.surface)
    }

    private func field(_ field: GuestDetailField) -> Binding<String> {
        Binding(get: { store.piece(id)?[keyPath: field.field] ?? "" }, set: { input in
            act { try store.changePiece(id) { $0.edit(field, value: input) } }
        })
    }

    private func text(_ path: WritableKeyPath<GuestPiece, String>) -> Binding<String> {
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
        recognitionError = nil
        onlineError = nil
        onlineCompleted = false
        selectedMatch = false
        guard !piece.photos.isEmpty, piece.recognition == nil else { return }
        let version = photoVersion(piece)
        let urls = version.map { store.photoURL($0) }
        do {
            let result = try await Task.detached(priority: .userInitiated) {
                try LocalRecognition.bundledResult(for: urls)
            }.value
            guard !Task.isCancelled, let current = store.piece(id), photoVersion(current) == version,
                  current.recognition == nil else { return }
            try store.changePiece(id) {
                $0.recognition = result
                $0.fill(from: result)
            }
        } catch {
            if !Task.isCancelled { recognitionError = "Couldn’t read these photos. You can still enter details." }
        }
    }

    private func searchOnline() async {
        guard !lookingOnline, !busy, let piece = store.piece(id) else { return }
        let version = photoVersion(piece)
        guard !version.isEmpty else { return }
        lookingOnline = true
        onlineError = nil
        defer { lookingOnline = false }
        do {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--guest-consent-fixture") {
                let match = LocalSuggestion(id: "guest-fixture", type: "coin", title: "2007 Jefferson nickel", issuer: "United States",
                                            denomination: "5 cents", year: "2007", reference: nil, evidence: [])
                try store.changePiece(id) {
                    let result = LocalRecognitionResult(suggestions: [match], likely: true)
                    $0.recognition = result
                    $0.fill(from: result)
                }
                onlineCompleted = true
                return
            }
            #endif
            let job = piece.onlineJob.flatMap { $0.expired || $0.photos != version ? nil : $0 } ?? GuestOnlineJob(photos: version)
            try store.changePiece(id) { $0.onlineJob = job }
            let frontData = try piece.photos[.front].map { try Data(contentsOf: store.photoURL($0)) }
            let backData = try piece.photos[.back].map { try Data(contentsOf: store.photoURL($0)) }
            let result = try await api.searchGuestPhotos(id: job.id, key: job.key, front: frontData, back: backData)
            guard let current = store.piece(id), photoVersion(current) == version,
                  current.onlineJob?.id == job.id else { return }
            if result.state == "complete" {
                try store.changePiece(id) {
                    var matches = result.recognition
                    matches.observations = $0.recognition?.observations ?? []
                    matches.photoReading = $0.recognition?.photoReading
                    if matches.suggestions.isEmpty, let local = $0.recognition { matches = local }
                    $0.recognition = matches
                    $0.fill(from: matches)
                    $0.onlineJob = nil
                }
                onlineCompleted = true
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
                let fields: [(GuestDetailField, String)] = [(.type, suggestion.type), (.title, suggestion.title),
                    (.issuer, suggestion.issuer), (.denomination, suggestion.denomination), (.year, suggestion.year)]
                for (field, value) in fields where !value.isBlank {
                    guard piece.manuallyEditedFields?.contains(field) != true else { continue }
                    piece.edit(field, value: value)
                }
                piece.reference = suggestion.reference
                piece.automaticReference = nil
            }
            selectedMatch = true
            showAlternatives = false
        }
    }

    private func save(_ status: GuestStatus) { act { try store.save(id, status: status); done() } }
    private func act(_ action: () throws -> Void) { do { try action() } catch { store.error = error.localizedDescription } }
}

private struct GuestPhotoPreview: View {
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1
    @GestureState private var magnification: CGFloat = 1
    let photo: UIImage

    var body: some View {
        NavigationStack {
            GeometryReader { proxy in
                ScrollView([.horizontal, .vertical]) {
                    Image(uiImage: photo).resizable().scaledToFit()
                        .frame(width: proxy.size.width * zoom, height: proxy.size.height * zoom)
                        .accessibilityLabel("Coin or banknote photo")
                }.gesture(MagnificationGesture().updating($magnification) { amount, state, _ in state = amount }
                    .onEnded { scale = min(max(scale * $0, 1), 5) })
                    .onTapGesture(count: 2) { scale = scale == 1 ? 2 : 1 }
            }
            .background(Color(uiColor: .systemBackground))
            .navigationTitle("Photo").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    Button(scale == 1 ? "Zoom in" : "Reset zoom", systemImage: scale == 1 ? "plus.magnifyingglass" : "minus.magnifyingglass") {
                        scale = scale == 1 ? 2 : 1
                    }
                }
            }
        }
    }

    private var zoom: CGFloat { min(max(scale * magnification, 1), 5) }
}

struct PhotoTextDetails: View {
    let result: LocalRecognitionResult

    var body: some View {
        let reading = result.textReading
        if let issuer = reading.issuer { LabeledContent("Issuer read", value: issuer) }
        if let denomination = reading.denomination { LabeledContent("Denomination read", value: denomination) }
        if let year = reading.year { LabeledContent("Year read", value: year) }
        if !result.observations.isEmpty {
            DisclosureGroup("Read from photos") {
                Text(result.observations.joined(separator: "\n"))
                    .font(.footnote)
                    .textSelection(.enabled)
            }
        }
    }
}

private struct OfflineCatalogPicker: View {
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [LocalSuggestion] = []
    @State private var searched = false
    let select: (LocalSuggestion) -> Void

    var body: some View {
        NavigationStack {
            List {
                if query.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 {
                    Text("Enter a country, denomination, year, inscription, or catalog number.")
                        .foregroundStyle(.secondary)
                } else if searched && results.isEmpty {
                    Text("No catalog entries found.").foregroundStyle(.secondary)
                }
                ForEach(results) { result in
                    Button {
                        select(result)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(result.title)
                            Text(result.type == "coin" ? "Coin" : "Banknote")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                NavigationLink("Catalog sources") {
                    ScrollView {
                        Text(Self.credits).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                            .padding()
                    }.navigationTitle("Catalog sources")
                }
            }
            .searchable(text: $query, prompt: "Search coins and banknotes")
            .navigationTitle("Offline catalog")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
            .task(id: query) {
                searched = false
                let term = query
                let matches = await Task.detached(priority: .userInitiated) { OfflineCatalog.shared.search(term) }.value
                guard !Task.isCancelled else { return }
                results = matches
                searched = true
            }
        }
    }

    private static var credits: String {
        guard let url = Bundle.main.url(forResource: "Credits", withExtension: "txt", subdirectory: "OfflineCatalog") else {
            return "Catalog sources are unavailable."
        }
        return (try? String(contentsOf: url, encoding: .utf8)) ?? "Catalog sources are unavailable."
    }
}

extension View {
    @MainActor
    func guestStorageAlert(_ store: GuestStore) -> some View {
        alert("NumiAgent", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(store.error ?? "") }
    }
}
