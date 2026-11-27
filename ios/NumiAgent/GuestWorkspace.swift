import AVFoundation
import ImageIO
import PhotosUI
import SwiftUI
import UIKit

struct GuestWelcome: View {
    let api: NumiAPI
    @State private var samplePresented = false
    @State private var scanAfterSample = false
    let start: () -> Void
    let signIn: () -> Void
    let restore: () -> Void

    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        GeometryReader { window in
            if window.size.width >= 760 && !textSize.isAccessibilitySize {
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        identity
                        HStack(alignment: .center, spacing: 32) {
                            samplePhoto(height: 260)
                            VStack(alignment: .leading, spacing: 16) {
                                introduction
                                startButton
                                accountMenu
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .frame(maxWidth: 920).padding(32)
                    .frame(maxWidth: .infinity, minHeight: window.size.height)
                }
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        identity
                        introduction
                        samplePhoto(height: 190)
                        accountMenu
                    }.frame(maxWidth: 500, alignment: .leading).padding(20)
                        .frame(maxWidth: .infinity)
                }
                .safeAreaInset(edge: .bottom) {
                    startButton.frame(maxWidth: 500).padding()
                        .frame(maxWidth: .infinity).background(CollectorDesign.background)
                }
            }
        }.background(CollectorDesign.background)
        .sheet(isPresented: $samplePresented, onDismiss: {
            if scanAfterSample { scanAfterSample = false; start() }
        }) {
            if let sample = DemoCollection.specimens.first {
                NavigationStack {
                    SpecimenScreen(item: sample, api: api, demo: true, onChange: {})
                        .navigationTitle("Sample specimen")
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) { Button("Done") { samplePresented = false } }
                        }
                        .safeAreaInset(edge: .bottom) {
                            Button {
                                scanAfterSample = true
                                samplePresented = false
                            } label: {
                                Label("Scan my own piece", systemImage: "camera").font(.headline)
                                    .foregroundStyle(CollectorDesign.onTint)
                            }.buttonStyle(.borderedProminent).controlSize(.large)
                                .frame(maxWidth: .infinity).padding(8).background(.bar)
                        }
                }
            }
        }
    }

    private var identity: some View {
        HStack {
            Text("NumiAgent").font(.headline)
            Spacer()
            Label("Private", systemImage: "lock").font(.subheadline.weight(.semibold))
        }
    }

    private var introduction: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("See what your coin can tell you").font(.largeTitle.bold()).accessibilityAddTraits(.isHeader)
            Text("Scan a coin or banknote. Its photos stay on this device until you choose to search online.")
                .foregroundStyle(CollectorDesign.muted)
        }
    }

    private func samplePhoto(height: CGFloat) -> some View {
        Button { samplePresented = true } label: {
            VStack(alignment: .leading, spacing: 8) {
                Image("DemoOctavian").resizable().scaledToFit().frame(maxWidth: .infinity).frame(height: height)
                    .background(CollectorDesign.photoPlate, in: .rect(cornerRadius: 14))
                    .accessibilityHidden(true)
                Label("Explore a sample coin", systemImage: "magnifyingglass")
                    .font(.headline).frame(minHeight: 44)
            }
        }.buttonStyle(.plain).foregroundStyle(CollectorDesign.tint).accessibilityIdentifier("welcome-sample")
    }

    private var accountMenu: some View {
        Menu("Sign in or restore", systemImage: "person.crop.circle") {
            Button("Sign in with email", systemImage: "envelope", action: signIn)
            Button("Restore backup", systemImage: "arrow.down.doc", action: restore)
        }.frame(minHeight: 44)
    }

    private var startButton: some View {
        Button(action: start) {
            Label("Start scanning", systemImage: "camera").font(.headline)
                .foregroundStyle(CollectorDesign.onTint).frame(maxWidth: .infinity, minHeight: 44)
        }.buttonStyle(.borderedProminent)
    }
}

private enum GuestFilter: String, CaseIterable, Identifiable {
    case all = "All", coin = "Coins", banknote = "Banknotes", unidentified = "Unidentified"
    var id: Self { self }
}

struct GuestWorkspace: View {
    @Environment(\.dynamicTypeSize) private var textSize
    @ScaledMetric(relativeTo: .body) private var searchHeight: CGFloat = 48
    @AppStorage("collector-list-view") private var listView = false
    @ObservedObject var store: GuestStore
    let api: NumiAPI
    let accountTitle: String?
    let openAccount: () -> Void
    @Binding var scanOnOpen: Bool
    private enum Area: String, CaseIterable, Identifiable {
        case collection = "Collection", scan = "Scan", settings = "Settings"
        var id: Self { self }
        var symbol: String {
            switch self {
            case .collection: "square.grid.2x2"
            case .scan: "camera"
            case .settings: "gearshape"
            }
        }
    }
    @State private var area = Area.collection
    @State private var selected: UUID?
    @State private var firstCameraID: UUID?
    @State private var editor: GuestPiece?
    @State private var revealedPiece: UUID?
    @State private var deleteTarget: GuestPiece?
    @State private var search = ""
    @State private var filter = GuestFilter.all
    @State private var menu: GuestFileAction?
    @State private var showPrivacy = false
    @State private var imports: [PhotosPickerItem] = []
    @State private var importing = false

    var body: some View {
        GeometryReader { geometry in
            if geometry.size.width >= 1020 && !textSize.isAccessibilitySize {
                NavigationSplitView {
                    List(Area.allCases, selection: Binding<Area?>(get: { area }, set: { if let value = $0 { area = value } })) { item in
                        NavigationLink(value: item) { Label(item.rawValue, systemImage: item.symbol) }
                    }
                    .navigationTitle("NumiAgent").listStyle(.sidebar)
                    .navigationSplitViewColumnWidth(min: 160, ideal: 180, max: 240)
                } content: {
                    index(sidebar: true).navigationSplitViewColumnWidth(min: 220, ideal: 275, max: 350)
                } detail: { NavigationStack { destination } }
                .navigationSplitViewStyle(.balanced)
            } else if geometry.size.width >= 680 && !textSize.isAccessibilitySize {
                NavigationSplitView {
                    index(sidebar: true).safeAreaInset(edge: .top) {
                        Picker("Workspace", selection: $area) {
                            ForEach(Area.allCases) { item in Text(item.rawValue).tag(item) }
                        }.pickerStyle(.segmented).padding(.horizontal)
                    }
                } detail: { NavigationStack { destination } }
                .navigationSplitViewStyle(.balanced)
            } else {
                TabView(selection: $area) {
                    NavigationStack {
                        index(sidebar: false)
                            .navigationDestination(item: $selected) { id in savedPiece(id) }
                    }.tabItem { Label("Collection", systemImage: Area.collection.symbol) }.tag(Area.collection)
                    NavigationStack { scanHub }.tabItem { Label("Scan", systemImage: Area.scan.symbol) }.tag(Area.scan)
                    NavigationStack { settings }.tabItem { Label("Settings", systemImage: Area.settings.symbol) }.tag(Area.settings)
                }
            }
        }
        .task {
            if scanOnOpen {
                scanOnOpen = false
                act {
                    let id = try store.draft()
                    if UIImagePickerController.isSourceTypeAvailable(.camera) { firstCameraID = id }
                    editor = store.piece(id)
                }
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
        .sheet(item: $editor, onDismiss: { firstCameraID = nil }) { item in
            NavigationStack {
                GuestPieceScreen(store: store, api: api, id: item.id, openCameraOnArrival: firstCameraID == item.id, newPiece: {
                    startNew()
                }) { editor = nil }
                .id(item.id)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { editor = nil } } }
            }
        }
        .sheet(item: $menu) { action in GuestFiles(store: store, action: action) }
        .sheet(isPresented: $showPrivacy) { GuestPrivacyView() }
        .onChange(of: listView) { _, _ in revealedPiece = nil }
        .onChange(of: search) { _, _ in revealedPiece = nil }
        .onChange(of: filter) { _, _ in revealedPiece = nil }
        .onChange(of: store.activeID) { _, _ in revealedPiece = nil; deleteTarget = nil }
        .confirmPieceDeletion($deleteTarget, title: { $0.displayTitle }, message: "This removes the piece from the collection on this device.") { piece in
            act {
                try store.delete(piece.id)
                if selected == piece.id { selected = nil }
            }
        }
        .guestStorageAlert(store)
    }

    private func index(sidebar: Bool) -> some View {
        List {
            CabinetSearchBar(query: $search)
                .frame(height: max(48, searchHeight))
                .listRowInsets(EdgeInsets()).listRowBackground(CollectorDesign.background)
            Section {
                Label("On this device", systemImage: "lock").font(.caption.weight(.semibold)).foregroundStyle(CollectorDesign.tint)
                if sidebar, let draft = resumableDraft {
                    Button("Continue scanning", systemImage: "camera.viewfinder") { open(draft) }
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
                if !sidebar && !listView {
                    cabinetGallery
                        .listRowInsets(EdgeInsets()).listRowBackground(CollectorDesign.background)
                } else {
                    ForEach(filtered) { piece in
                        Button { area = .collection; selected = piece.id } label: {
                            HStack {
                                thumbnail(piece).frame(width: 46, height: 46).clipShape(.rect(cornerRadius: 8))
                                VStack(alignment: .leading) {
                                    Text(piece.displayTitle)
                                    Text([piece.issuer, piece.denomination, piece.year].filter { !$0.isEmpty }.joined(separator: " · "))
                                        .font(.footnote).foregroundStyle(.secondary)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(selected == piece.id ? CollectorDesign.highlight : CollectorDesign.surface)
                        .accessibilityAddTraits(selected == piece.id ? .isSelected : [])
                        .accessibilityIdentifier("list-piece-\(piece.id)")
                        .phoneRowDelete { deleteTarget = piece }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(CollectorDesign.background)
        .safeAreaInset(edge: .bottom) {
            if !sidebar { scanAction.padding(.horizontal, 16).padding(.vertical, 6).background(CollectorDesign.background) }
        }
        .navigationTitle(store.active?.name ?? "My collection")
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Menu("Collection menu", systemImage: "ellipsis.circle") {
                    Button(listView ? "Show gallery" : "Show list", systemImage: listView ? "square.grid.2x2" : "list.bullet") {
                        listView.toggle()
                    }
                    if store.collections.count > 1 {
                        Section("On this device") {
                            ForEach(store.collections) { collection in
                                Button(collection.name) { act { try store.select(collection.id); selected = nil } }
                            }
                        }
                    }

                }
            }
            ToolbarItem(placement: .primaryAction) {
                Menu("Add item", systemImage: "plus") {
                    if resumableDraft != nil {
                        Button("Start a new piece", systemImage: "plus") { startNew() }
                    }
                    PhotosPicker(selection: $imports, maxSelectionCount: 20, selectionBehavior: .ordered, matching: .images) {
                        Label("Import a photo batch", systemImage: "photo.on.rectangle")
                    }
                    Button("Enter details manually", systemImage: "square.and.pencil") { startNew() }
                }.disabled(importing)
            }
        }
    }

    @ViewBuilder private var destination: some View {
        switch area {
        case .settings: settings
        case .scan: scanHub
        case .collection:
            if let selected, store.piece(selected) != nil {
                savedPiece(selected)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Collection gallery", systemImage: "square.grid.2x2") { self.selected = nil }
                        }
                    }
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Label("On this device", systemImage: "lock").font(.caption.bold()).foregroundStyle(CollectorDesign.tint)
                        if filtered.isEmpty {
                            ContentUnavailableView("No pieces to show", systemImage: "square.grid.2x2")
                        } else { cabinetGallery }
                    }.padding()
                }.navigationTitle("Collection gallery").background(CollectorDesign.background)
                 .safeAreaInset(edge: .bottom) { scanAction.padding().background(CollectorDesign.background) }
            }
        }
    }

    private func savedPiece(_ id: UUID) -> some View {
        GuestPieceScreen(store: store, api: api, id: id, newPiece: nil) { selected = nil }.id(id)
    }

    private var resumableDraft: UUID? { store.active?.activeDraft ?? store.active?.drafts.first?.id }

    private var scanAction: some View {
        Button {
            if let draft = resumableDraft { open(draft) } else { start() }
        } label: {
            Label(resumableDraft == nil ? "Scan a piece" : "Continue scanning", systemImage: "camera")
                .font(.headline).frame(maxWidth: .infinity, minHeight: 44)
        }.buttonStyle(.borderedProminent).foregroundStyle(CollectorDesign.onTint).keyboardShortcut("n", modifiers: .command)
            .accessibilityIdentifier("cabinet-scan")
    }

    private var scanHub: some View {
        List {
            Section { scanAction }
            if let drafts = store.active?.drafts, !drafts.isEmpty {
                Section("Unfinished pieces") {
                    ForEach(drafts) { piece in
                        Button { open(piece.id) } label: {
                            Label(piece.title.isEmpty ? "Piece \(draftNumber(piece.id))" : piece.title, systemImage: "tray")
                        }
                    }
                }
            }
            Section {
                PhotosPicker(selection: $imports, maxSelectionCount: 20, selectionBehavior: .ordered, matching: .images) {
                    Label("Import a photo batch", systemImage: "photo.on.rectangle")
                }.disabled(importing)
            }
        }.navigationTitle("Scan").scrollContentBackground(.hidden).background(CollectorDesign.background)
    }

    private var settings: some View {
        List {
            Section("On this device") {
                Button("Privacy & browser access", systemImage: "hand.raised") { showPrivacy = true }
            }
            Section("Files") {
                Button("Back up collection", systemImage: "lock") { menu = .backup }
                Button("Restore backup", systemImage: "arrow.down.doc") { menu = .restore }
                Button("Export spreadsheet", systemImage: "tablecells") { menu = .csv }
            }
            Section {
                Button(accountTitle ?? "Sign in with email", systemImage: "person.crop.circle", action: openAccount)
            } footer: { Text("Your account collection is separate. Pieces saved on this device stay here when you sign in.") }
        }.navigationTitle("Settings").scrollContentBackground(.hidden).background(CollectorDesign.background)
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
            return matchesType && (search.isEmpty || [piece.displayTitle, piece.issuer, piece.denomination, piece.year, piece.inscription ?? ""]
                .contains { $0.localizedStandardContains(search) })
        }
    }

    private var cabinetGallery: some View {
        let pieces = Array(filtered.reversed())
        let featured = pieces.count != 2 ? pieces.first(where: { !$0.photos.isEmpty }) : nil
        return VStack(alignment: .leading, spacing: 12) {
            if let featured {
                galleryCard(featured, featured: true)
                if pieces.count > 1 { Text("Recently added").font(.headline).accessibilityAddTraits(.isHeader) }
            }
            let remaining = pieces.filter { $0.id != featured?.id }
            CollectionGrid(itemCount: remaining.count) {
                ForEach(remaining) { piece in galleryCard(piece, featured: false) }
            }
        }
    }

    private func galleryCard(_ piece: GuestPiece, featured: Bool) -> some View {
        let activate = {
            if revealedPiece != nil { revealedPiece = nil }
            else { selected = piece.id }
        }
        return Button(action: activate) {
            CollectionCard(featured: featured, title: piece.displayTitle, subtitle: [piece.issuer, piece.year].filter { !$0.isBlank }.joined(separator: " · ")) {
                thumbnail(piece)
            }
        }.buttonStyle(.plain)
            .accessibilityLabel(piece.displayTitle)
            .accessibilityValue([piece.issuer, piece.year].filter { !$0.isBlank }.joined(separator: ", "))
            .accessibilityIdentifier("gallery-piece-\(piece.id)")
            .phoneCardDelete(id: piece.id, revealed: $revealedPiece, activate: activate) { deleteTarget = piece }
    }

    private func thumbnail(_ piece: GuestPiece) -> some View {
        let photo = GuestSide.allCases.compactMap { piece.photos[$0] }.first
        return LocalThumbnail(url: photo.map { store.photoURL($0) }, type: piece.type)
    }

    private func draftNumber(_ id: UUID) -> Int {
        let index = store.active?.drafts.firstIndex { $0.id == id } ?? 0
        return (store.active?.pieces.count ?? 0) + index + 1
    }

    private func startNew() { act { editor = store.piece(try store.draft(resumeActive: false)) } }
    private func start() { act { let id = try store.draft(); editor = store.piece(id) } }
    private func open(_ id: UUID) { act { try store.resume(id); editor = store.piece(id) } }
    private func act(_ action: () throws -> Void) {
        do { try action() } catch { store.error = error.localizedDescription }
    }
}

private struct CabinetSearchBar: UIViewRepresentable {
    @Binding var query: String

    func makeCoordinator() -> Coordinator { Coordinator(query: $query) }

    func makeUIView(context: Context) -> UISearchBar {
        let bar = UISearchBar()
        bar.searchBarStyle = .minimal
        bar.placeholder = "Name, year or inscription"
        bar.searchTextField.accessibilityLabel = "Search collection"
        bar.searchTextField.adjustsFontForContentSizeCategory = true
        bar.searchTextField.font = .preferredFont(forTextStyle: .body)
        bar.autocapitalizationType = .none
        bar.delegate = context.coordinator
        return bar
    }

    func updateUIView(_ bar: UISearchBar, context: Context) {
        context.coordinator.query = $query
        if bar.text != query { bar.text = query }
    }

    final class Coordinator: NSObject, UISearchBarDelegate {
        var query: Binding<String>
        init(query: Binding<String>) { self.query = query }
        func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) {
            query.wrappedValue = searchText
        }
        func searchBarSearchButtonClicked(_ searchBar: UISearchBar) { searchBar.resignFirstResponder() }
    }
}

private struct LocalThumbnail: View {
    let url: URL?
    let type: String
    @State private var thumbnail: UIImage?
    var body: some View {
        ZStack {
            Color.secondary.opacity(0.06)
            if let thumbnail { Image(uiImage: thumbnail).resizable().scaledToFit() }
            else { Image(systemName: type == "coin" ? "circle.circle" : "banknote").font(.title2).foregroundStyle(.secondary) }
        }
        .accessibilityHidden(true)
        .task(id: url) {
            thumbnail = nil
            guard let url else { return }
            let image = await Task.detached(priority: .utility) { () -> UIImage? in
                guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
                      let bitmap = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                        kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true,
                        kCGImageSourceThumbnailMaxPixelSize: 480
                      ] as CFDictionary) else { return nil }
                return UIImage(cgImage: bitmap)
            }.value
            if !Task.isCancelled { thumbnail = image }
        }
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
    var openCameraOnArrival = false
    @State private var startedCamera = false
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
    @State private var editingRecord = false
    @State private var displayedSide = GuestSide.front
    @Environment(\.dynamicTypeSize) private var textSize
    @State private var showAlternatives = false
    @State private var selectedMatch = false
    @State private var onlineCompleted = false

    var body: some View {
        Group {
            if let piece = store.piece(id) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        VStack(alignment: .leading, spacing: 4) {
                            Label("On this device", systemImage: "lock").font(.caption.bold()).foregroundStyle(CollectorDesign.tint)
                            Text(isDraft ? "Scan a piece" : piece.displayTitle)
                                .font(.largeTitle.bold()).accessibilityAddTraits(.isHeader)
                            if isDraft { Text("Coins and banknotes").foregroundStyle(CollectorDesign.muted) }
                            else {
                                Text([piece.issuer, piece.year].filter { !$0.isBlank }.joined(separator: " · "))
                                    .font(.subheadline).foregroundStyle(CollectorDesign.muted)
                            }
                        }
                        if !isDraft { comparableSalesButton }
                        if !isDraft && !editingRecord {
                            inspection(piece)
                        } else {
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
                        if isDraft && (!piece.denomination.isBlank || !piece.title.isBlank) {
                            comparableSalesButton
                        }
                    }
                    .frame(maxWidth: 1040, alignment: .leading).padding(20)
                    .frame(maxWidth: .infinity)
                }
                .background(CollectorDesign.background)
                .accessibilityIdentifier("guest-record-scroll")
                .scrollDismissesKeyboard(.interactively)
                .navigationTitle(isDraft ? draftTitle : editingRecord ? "Edit record" : "Specimen")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu("Piece actions", systemImage: "ellipsis.circle") {
                            Button("Search offline catalog", systemImage: "books.vertical") { catalogPicker = true }
                            if let sold = soldListingsURL([piece.issuer, piece.denomination, piece.year].filter { !$0.isBlank }.joined(separator: " ")) {
                                Link("Compare sold listings on eBay", destination: sold)
                            }
                            if !piece.title.isBlank && piece.status != .confirmed {
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
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    if isDraft { saveBar(piece) }
                    else if editingRecord {
                        scanButton("Done editing", icon: "checkmark", prominent: true) {
                            editingRecord = false
                        }.padding().background(CollectorDesign.surface)
                    }
                }
                .task {
                    guard openCameraOnArrival, !startedCamera, piece.photos.isEmpty else { return }
                    startedCamera = true
                    if AVCaptureDevice.authorizationStatus(for: .video) != .denied &&
                        AVCaptureDevice.authorizationStatus(for: .video) != .restricted { take(.front) }
                }
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
        .fullScreenCover(item: $zoomedSide) { side in
            if let piece = store.piece(id) {
                GuestPhotoReader(store: store, piece: piece, initialSide: side)
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

    @ViewBuilder private func onlineSearch(_ piece: GuestPiece) -> some View {
        if !piece.photos.isEmpty && !lookingOnline && !onlineCompleted && piece.recognition?.likely != true {
            let retry = piece.onlineJob != nil || onlineError != nil
            let photoDescription = piece.photos.count == 1 ? "the photo shown" : "both photos shown"
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    ForEach(GuestSide.allCases) { side in
                        if let photo = piece.photos[side] {
                            LocalThumbnail(url: store.photoURL(photo), type: piece.type)
                                .frame(width: 52, height: 44).clipShape(.rect(cornerRadius: 6))
                        }
                    }
                }.accessibilityHidden(true)
                Text("This sends \(photoDescription) to NumiAgent for processing by Cloudflare Workers AI. Notes and private details stay on this device.")
                    .font(.footnote).foregroundStyle(.secondary).accessibilityIdentifier("guest-online-disclosure")
                scanButton(retry ? "Retry online search" : "Search online", icon: "magnifyingglass", prominent: true) {
                    Task { await searchOnline() }
                }.accessibilityIdentifier("guest-search-online").disabled(busy)
            }
        }
    }

    private var comparableSalesButton: some View {
        scanButton("Find comparable sales", icon: "chart.bar") { salesPresented = true }
            .accessibilityIdentifier("guest-comparable-sales")
    }

    private func inspection(_ piece: GuestPiece) -> some View {
        let available = GuestSide.allCases.filter { piece.photos[$0] != nil }
        let side = available.contains(displayedSide) ? displayedSide : available.first
        return VStack(alignment: .leading, spacing: 12) {
            if let side, let photo = piece.photos[side] {
                Button { zoomedSide = side } label: {
                    LocalThumbnail(url: store.photoURL(photo), type: piece.type)
                        .frame(maxWidth: .infinity).frame(height: 220)
                        .background(CollectorDesign.photoPlate)
                        .overlay(alignment: .bottomTrailing) {
                            Image(systemName: "plus.magnifyingglass").padding(10)
                                .background(CollectorDesign.surface, in: .circle).padding(8)
                        }.clipShape(.rect(cornerRadius: 12))
                }.buttonStyle(.plain).accessibilityLabel("Zoom photo \(photoNumber(side))")
                HStack {
                    Text("Photo \((available.firstIndex(of: side) ?? 0) + 1) of \(available.count)")
                        .font(.caption.bold()).foregroundStyle(CollectorDesign.muted)
                    Spacer()
                    if let other = available.first(where: { $0 != side }) {
                        Button("Other side", systemImage: "arrow.triangle.2.circlepath") { displayedSide = other }
                            .frame(minHeight: 44)
                    }
                }
            }
            let confirmed = piece.status == .confirmed
            Label(confirmed ? "Confirmed" : piece.title.isBlank ? "Needs review" : "Tentative identification",
                  systemImage: confirmed ? "checkmark.circle" : "magnifyingglass")
                .font(.subheadline.bold()).padding(10)
                .background(confirmed ? CollectorDesign.highlight : CollectorDesign.warning, in: .capsule)
            VStack(alignment: .leading, spacing: 10) {
                fact("Piece type", piece.type == "coin" ? "Coin" : "Banknote")
                if !piece.denomination.isBlank { fact("Denomination", piece.denomination) }
                if let inscription = piece.inscription, !inscription.isBlank {
                    fact("Inscription", inscription)
                }
                if let reference = piece.reference { Link("Saved reference", destination: reference) }
            }.padding().background(CollectorDesign.surface, in: .rect(cornerRadius: 12))
            if !available.isEmpty {
                scanButton("Ask for a second opinion", icon: "square.and.arrow.up") { cardPresented = true }
            }
            scanButton("Edit record", icon: "square.and.pencil") { editingRecord = true }
                .accessibilityIdentifier("cabinet-edit-record")
            if lookingOnline { ProgressView("Searching online…") }
            if let onlineError { CollectorNotice(title: "Online search", message: onlineError, icon: "info.circle", warning: true) }
            onlineSearch(piece)
        }.frame(maxWidth: 760, alignment: .leading)
    }

    @ViewBuilder private func fact(_ label: String, _ value: String) -> some View {
        if textSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 4) {
                Text(label).font(.caption.bold()).foregroundStyle(CollectorDesign.muted)
                Text(value)
            }.accessibilityElement(children: .combine)
        } else { LabeledContent(label, value: value) }
    }

    private func photoSection(_ piece: GuestPiece) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Photos").font(.headline).accessibilityAddTraits(.isHeader)
                Spacer()
                Text("\(piece.photos.count) of 2").font(.subheadline).foregroundStyle(.secondary)
                    .accessibilityLabel("\(piece.photos.count) of 2 photos")
            }
            VStack(alignment: .leading, spacing: 12) {
                if !piece.photos.isEmpty {
                    HStack(alignment: .top, spacing: 8) {
                        ForEach(GuestSide.allCases) { side in
                            if let photo = piece.photos[side], let image = UIImage(contentsOfFile: store.photoURL(photo).path) {
                                Button { zoomedSide = side } label: {
                                    Image(uiImage: image).resizable().scaledToFit()
                                        .frame(maxWidth: .infinity).frame(height: 115).padding(6)
                                        .background(CollectorDesign.highlight.opacity(0.5), in: .rect(cornerRadius: 12))
                                        .overlay(alignment: .bottomTrailing) {
                                            Image(systemName: "magnifyingglass").padding(9)
                                                .background(CollectorDesign.surface, in: .circle).padding(5)
                                        }
                                        .contentShape(Rectangle())
                                }.buttonStyle(.plain).accessibilityLabel("Zoom photo \(photoNumber(side))")
                            }
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
            } else if let result = piece.recognition, !result.suggestions.isEmpty {
                CollectorNotice(title: "Possible match", message: "Review the details the matches share. Choose a suggestion to use its full identification.",
                                icon: "magnifyingglass", warning: true)
            } else if !busy {
                CollectorNotice(title: "Needs review", message: "Review the details the scan could read. Leave uncertain fields blank.",
                                icon: "info.circle", warning: true)
            }
            onlineSearch(piece)
            details(piece)
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

    private func details(_ piece: GuestPiece) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text("Record details").font(.headline).accessibilityAddTraits(.isHeader)
                Spacer()
                Text("Editable").font(.caption).foregroundStyle(.secondary)
            }
            if piece.hasIdentifiedType {
                LabeledContent("Piece type", value: piece.type == "coin" ? "Coin" : "Banknote")
                    .accessibilityIdentifier("identified-piece-type")
            } else {
                Picker("Type", selection: field(.type)) { Text("Coin").tag("coin"); Text("Banknote").tag("banknote") }
                    .pickerStyle(.segmented)
            }
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
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption.bold()).foregroundStyle(CollectorDesign.muted).accessibilityHidden(true)
            TextField(title, text: field(key), prompt: Text("Enter value").foregroundStyle(.secondary))
                .multilineTextAlignment(.leading)
                .accessibilityLabel(title).accessibilityIdentifier("guest-field-" + key.rawValue)
        }.padding(9).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(Color.secondary.opacity(0.24)))
    }

    private func scanButton(_ title: String, icon: String, prominent: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon).font(.subheadline.weight(.semibold))
                .padding(.horizontal, 6).frame(maxWidth: .infinity, minHeight: 44)
                .foregroundStyle(prominent ? CollectorDesign.onTint : CollectorDesign.tint)
                .background(prominent ? CollectorDesign.tint : CollectorDesign.surface, in: .rect(cornerRadius: 10))
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
                $0.acceptRecognition(result)
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
                    $0.acceptRecognition(result)
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
                    $0.acceptRecognition(matches)
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
        guard let current = store.piece(id), !current.hasIdentifiedType || current.type == suggestion.type else {
            store.error = "Choose a match with the same piece type."
            return
        }
        act {
            try store.changePiece(id) { piece in
                piece.type = suggestion.type
                piece.typeLocked = true
                let fields: [(GuestDetailField, String)] = [(.title, suggestion.title),
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

private struct GuestPhotoReader: View {
    let store: GuestStore
    let piece: GuestPiece
    @State private var side: GuestSide

    init(store: GuestStore, piece: GuestPiece, initialSide: GuestSide) {
        self.store = store
        self.piece = piece
        _side = State(initialValue: initialSide)
    }

    var body: some View {
        let sides = GuestSide.allCases.filter { piece.photos[$0] != nil }
        if let id = piece.photos[side], let image = UIImage(contentsOfFile: store.photoURL(id).path) {
            let other = sides.first { $0 != side }
            PiecePhotoViewer(photo: image, title: "Photo \((sides.firstIndex(of: side) ?? 0) + 1) of \(sides.count)",
                             changeSide: other.map { next in { side = next } })
                .id(id)
        } else {
            NavigationStack { ContentUnavailableView("Photo unavailable", systemImage: "photo")
                .toolbar { PhotoReaderCloseButton() } }
        }
    }
}

private struct PhotoReaderCloseButton: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View { Button("Done") { dismiss() } }
}

struct PiecePhotoViewer: View {
    let photo: UIImage
    var title = "Photo"
    var changeSide: (() -> Void)?
    @Environment(\.dismiss) private var dismiss
    @State private var factor: CGFloat = 1
    @State private var command: PhotoZoomCommand?

    var body: some View {
        NavigationStack {
            InteractivePhoto(photo: photo, command: command) { factor = $0 }
                .background(.black)
                .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                    if let changeSide {
                        ToolbarItem(placement: .primaryAction) { Button("Other side", action: changeSide) }
                    }
                }
                .safeAreaInset(edge: .bottom) {
                    HStack(spacing: 20) {
                        Button { issue(factor / 2) } label: {
                            Image(systemName: "minus.magnifyingglass").frame(width: 44, height: 44)
                        }.disabled(factor <= 1.001).accessibilityLabel("Zoom out")
                        Button("Fit") { issue(1) }.frame(minWidth: 44, minHeight: 44).accessibilityLabel("Fit photo")
                        Button { issue(factor * 2) } label: {
                            Image(systemName: "plus.magnifyingglass").frame(width: 44, height: 44)
                        }.disabled(factor >= 7.999).accessibilityLabel("Zoom in")
                    }.buttonStyle(.bordered).frame(maxWidth: .infinity).padding(8).background(.bar)
                }
        }
    }

    private func issue(_ scale: CGFloat) { command = PhotoZoomCommand(scale: min(8, max(1, scale))) }
}

private struct PhotoZoomCommand { let id = UUID(); let scale: CGFloat }

private struct InteractivePhoto: UIViewRepresentable {
    let photo: UIImage
    let command: PhotoZoomCommand?
    let changed: (CGFloat) -> Void

    func makeUIView(context: Context) -> PhotoViewport {
        PhotoViewport(photo: photo, changed: changed)
    }

    func updateUIView(_ view: PhotoViewport, context: Context) {
        guard let command, command.id != view.lastCommand else { return }
        view.lastCommand = command.id
        view.zoom(to: command.scale, at: view.midpoint)
    }
}

private final class PhotoViewport: UIView {
    private let picture: UIImageView
    private let changed: (CGFloat) -> Void
    private var scale: CGFloat = 1
    private var offset = CGPoint.zero
    private var previousPinch = CGPoint.zero
    var lastCommand: UUID?
    var midpoint: CGPoint { CGPoint(x: bounds.midX, y: bounds.midY) }

    init(photo: UIImage, changed: @escaping (CGFloat) -> Void) {
        self.picture = UIImageView(image: photo)
        self.changed = changed
        super.init(frame: .zero)
        clipsToBounds = true
        isMultipleTouchEnabled = true
        backgroundColor = .black
        picture.contentMode = .scaleAspectFit
        addSubview(picture)
        addGestureRecognizer(UIPinchGestureRecognizer(target: self, action: #selector(pinched(_:))))
        let pan = UIPanGestureRecognizer(target: self, action: #selector(dragged(_:)))
        pan.maximumNumberOfTouches = 1
        addGestureRecognizer(pan)
        let tap = UITapGestureRecognizer(target: self, action: #selector(doubleTapped(_:)))
        tap.numberOfTapsRequired = 2
        addGestureRecognizer(tap)
        isAccessibilityElement = true
        accessibilityIdentifier = "photo-zoom-surface"
        accessibilityLabel = "Specimen photo"
        accessibilityTraits = [.image, .adjustable]
        accessibilityValue = "100 percent"
    }

    required init?(coder: NSCoder) { nil }

    override func layoutSubviews() {
        super.layoutSubviews()
        positionPicture()
    }

    private func positionPicture() {
        guard let size = picture.image?.size, size.width > 0, size.height > 0 else { return }
        let fit = min(bounds.width / size.width, bounds.height / size.height)
        let width = size.width * fit * scale, height = size.height * fit * scale
        let maxX = max(0, (width - bounds.width) / 2), maxY = max(0, (height - bounds.height) / 2)
        offset.x = min(maxX, max(-maxX, offset.x))
        offset.y = min(maxY, max(-maxY, offset.y))
        picture.frame = CGRect(x: bounds.midX + offset.x - width / 2, y: bounds.midY + offset.y - height / 2,
                               width: width, height: height)
    }

    func zoom(to proposed: CGFloat, at anchor: CGPoint, movingTo newAnchor: CGPoint? = nil) {
        let next = min(8, max(1, proposed))
        let ratio = next / scale, destination = newAnchor ?? anchor
        offset.x = destination.x - bounds.midX + (offset.x - anchor.x + bounds.midX) * ratio
        offset.y = destination.y - bounds.midY + (offset.y - anchor.y + bounds.midY) * ratio
        let previous = scale
        scale = next
        positionPicture()
        if next != previous {
            accessibilityValue = "\(Int((next * 100).rounded())) percent"
            changed(next)
        }
    }

    @objc private func pinched(_ gesture: UIPinchGestureRecognizer) {
        guard gesture.numberOfTouches >= 2 else { return }
        let center = gesture.location(in: self)
        switch gesture.state {
        case .began:
            previousPinch = center
            zoom(to: scale * gesture.scale, at: center)
        case .changed:
            zoom(to: scale * gesture.scale, at: previousPinch, movingTo: center)
            previousPinch = center
        default:
            return
        }
        gesture.scale = 1
    }

    @objc private func dragged(_ gesture: UIPanGestureRecognizer) {
        guard scale > 1 else { return }
        let delta = gesture.translation(in: self)
        offset.x += delta.x
        offset.y += delta.y
        gesture.setTranslation(.zero, in: self)
        positionPicture()
    }

    @objc private func doubleTapped(_ gesture: UITapGestureRecognizer) {
        zoom(to: scale > 1.01 ? 1 : 3, at: gesture.location(in: self))
    }

    override func accessibilityIncrement() { zoom(to: scale * 2, at: midpoint) }
    override func accessibilityDecrement() { zoom(to: scale / 2, at: midpoint) }
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
