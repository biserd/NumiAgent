import SwiftUI
import PhotosUI
import ImageIO

struct CollectionCard<Photo: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let photo: () -> Photo

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Color.clear.aspectRatio(1.35, contentMode: .fit)
                .overlay { photo() }.clipped()
                .background(CollectorDesign.highlight.opacity(0.35))
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.headline).lineLimit(2)
                if !subtitle.isEmpty { Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
            }.frame(maxWidth: .infinity, alignment: .leading).padding(10)
        }.background(CollectorDesign.surface, in: .rect(cornerRadius: 12))
            .clipShape(.rect(cornerRadius: 12))
            .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(.secondary.opacity(0.22)) }
            .contentShape(Rectangle()).accessibilityElement(children: .combine)
    }
}

struct CollectionGrid<Content: View>: View {
    @Environment(\.dynamicTypeSize) private var textSize
    @Environment(\.horizontalSizeClass) private var widthClass
    let itemCount: Int
    @ViewBuilder let content: () -> Content
    private var columns: [GridItem] {
        if widthClass == .regular && (1...2).contains(itemCount) && !textSize.isAccessibilitySize {
            return Array(repeating: GridItem(.flexible(minimum: 120, maximum: 400), spacing: 12, alignment: .top), count: itemCount)
        }
        let minimum: CGFloat = textSize.isAccessibilitySize ? 270 : widthClass == .regular ? 180 : 140
        return [GridItem(.adaptive(minimum: minimum), spacing: 12, alignment: .top)]
    }
    var body: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 14, content: content)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// A gallery is a single List row. Each card needs its own trailing action.
private struct SwipeablePieceCard<ID: Hashable>: ViewModifier {
    let id: ID
    @Binding var revealed: ID?
    let requestDelete: () -> Void
    @Environment(\.layoutDirection) private var direction
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var travel: CGFloat = 0
    @ScaledMetric(relativeTo: .caption) private var actionWidth: CGFloat = 68

    func body(content: Content) -> some View {
        let open = revealed == id
        let sign: CGFloat = direction == .leftToRight ? -1 : 1
        let reveal = min(actionWidth, max(0, (open ? actionWidth : 0) + travel * sign))
        ZStack(alignment: .trailing) {
            if reveal > 0 {
                Button(role: .destructive) {
                    revealed = nil
                    requestDelete()
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: "trash")
                        Text("Delete").font(.caption.weight(.semibold))
                    }.frame(width: actionWidth).frame(maxHeight: .infinity)
                        .foregroundStyle(.white).background(Color(red: 0.72, green: 0.13, blue: 0.16))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Delete")
            }
            content
                .accessibilityAction(named: "Delete", requestDelete)
                .offset(x: sign * reveal)
        }
        .clipShape(.rect(cornerRadius: 12))
        .contentShape(Rectangle())
        .accessibilityElement(children: .contain)
        .background {
            CardPanArea { dx, finished in
                if finished {
                    withAnimation(reduceMotion ? nil : .easeOut(duration: 0.16)) {
                        travel = 0
                        if abs(dx) > 27 { revealed = dx * sign > 0 ? id : nil }
                    }
                } else { travel = dx }
            }
        }
    }
}

// List owns the surrounding scroll gesture. Observe horizontal pans on that same
// scroll view, scoped to this card’s bounds, so vertical scrolling and taps stay native.
private struct CardPanArea: UIViewRepresentable {
    var move: (CGFloat, Bool) -> Void

    func makeUIView(context: Context) -> Area { Area() }
    func updateUIView(_ view: Area, context: Context) { view.move = move }
    static func dismantleUIView(_ view: Area, coordinator: ()) { view.detach() }

    final class Area: UIView, UIGestureRecognizerDelegate {
        var move: ((CGFloat, Bool) -> Void)?
        private lazy var pan: UIPanGestureRecognizer = {
            let recognizer = UIPanGestureRecognizer(target: self, action: #selector(dragged))
            recognizer.maximumNumberOfTouches = 1
            recognizer.delegate = self
            return recognizer
        }()

        override func didMoveToWindow() {
            super.didMoveToWindow()
            detach()
            isUserInteractionEnabled = false
            guard window != nil else { return }
            var ancestor = superview
            while let candidate = ancestor, !(candidate is UIScrollView) { ancestor = candidate.superview }
            (ancestor ?? window)?.addGestureRecognizer(pan)
        }

        func detach() { pan.view?.removeGestureRecognizer(pan) }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            bounds.contains(touch.location(in: self))
        }

        override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            guard gestureRecognizer === pan else { return super.gestureRecognizerShouldBegin(gestureRecognizer) }
            let velocity = pan.velocity(in: self)
            return abs(velocity.x) > abs(velocity.y) * 1.5
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }

        @objc private func dragged() {
            let dx = pan.translation(in: self).x
            switch pan.state {
            case .began, .changed: move?(dx, false)
            case .ended: move?(dx, true)
            case .cancelled, .failed: move?(0, true)
            default: break
            }
        }
    }
}

extension View {
    @ViewBuilder
    func phoneCardDelete<ID: Hashable>(id: ID, revealed: Binding<ID?>, enabled: Bool = true,
                                       action: @escaping () -> Void) -> some View {
        if enabled && UIDevice.current.userInterfaceIdiom == .phone {
            modifier(SwipeablePieceCard(id: id, revealed: revealed, requestDelete: action))
        } else { self }
    }

    @ViewBuilder
    func phoneRowDelete(enabled: Bool = true, action: @escaping () -> Void) -> some View {
        if enabled && UIDevice.current.userInterfaceIdiom == .phone {
            swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button(action: action) { Label("Delete", systemImage: "trash") }.tint(.red)
            }
        } else { self }
    }

    func confirmPieceDeletion<Item>(_ item: Binding<Item?>, title: (Item) -> String,
                                    message: String, delete: @escaping (Item) -> Void) -> some View {
        alert(item.wrappedValue.map { "Delete “" + title($0) + "”?" } ?? "Delete piece?",
              isPresented: Binding(get: { item.wrappedValue != nil }, set: { if !$0 { item.wrappedValue = nil } }),
              presenting: item.wrappedValue) { target in
            Button("Delete", role: .destructive) { delete(target) }
            Button("Cancel", role: .cancel) {}
        } message: { _ in Text(message) }
    }
}

@MainActor final class CatalogResults: ObservableObject {
    @Published var items: [Specimen] = []
    @Published var next: Int?
    @Published var loading = false
    @Published var error: String?
    @Published var requestedMore = 0
    var loadGeneration = 0
}

struct CatalogScreen: View {
    @ObservedObject var results: CatalogResults
    private enum AddSheet: String, Identifiable {
        case actions, manual
        var id: String { rawValue }
    }

    let api: NumiAPI
    let demo: Bool
    @ObservedObject var capture: CaptureDraftStore
    @Binding var query: String
    @Binding var openedItemID: String?
    let openCapture: (String?) -> Void
    let openAccount: (() -> Void)?
    let itemCreated: (String) -> Void
    var revision = 0
    var workspaceSelection: WorkspaceListSelection<Specimen>? = nil
    @State private var addSheet: AddSheet?
    @State private var managingFolders = false
    @State private var revealedItem: String?
    @State private var deleteTarget: Specimen?
    @State private var deletingIDs = Set<String>()
    @State private var deletionError: String?
    @State private var type = ""
    @State private var folder = ""
    @State private var folders: [CollectionFolder] = []
    @AppStorage("collector-list-view") private var listView = false
    private var items: [Specimen] { results.items }
    private var loading: Bool { results.loading }
    private var next: Int? { results.next }
    private var error: String? { results.error }

    var body: some View {
        if workspaceSelection != nil { catalog }
        else {
            NavigationStack {
                catalog.navigationDestination(item: $openedItemID) { id in
                    ItemByIDScreen(api: api, id: id, demo: demo, onChange: reload)
                }
            }
        }
    }

    private var catalog: some View {
        List(selection: workspaceSelection?.matching(items)) {
            if demo {
                Text("Demo collection").font(.footnote).foregroundStyle(.secondary)
            } else {
                Text("Saved to your NumiAgent account").font(.footnote).foregroundStyle(.secondary)
            }
            if !demo, query.isEmpty, type.isEmpty, folder.isEmpty {
                collectionStart
                captureActivity
            }
            if !items.isEmpty {
                Section {
                    if workspaceSelection == nil && !listView {
                        CollectionGrid(itemCount: items.count) {
                            ForEach(items) { item in
                                Button {
                                    if revealedItem != nil { revealedItem = nil } else { openedItemID = item.id }
                                } label: {
                                    accountCard(item, api: api, demo: demo)
                                }.buttonStyle(.plain).accessibilityIdentifier("specimen-\(item.id)")
                                    .phoneCardDelete(id: item.id, revealed: $revealedItem, enabled: !demo) { deleteTarget = item }
                                    .disabled(deletingIDs.contains(item.id))
                            }
                        }.listRowInsets(EdgeInsets()).listRowBackground(CollectorDesign.background)
                    } else {
                        ForEach(items) { item in
                            if workspaceSelection != nil {
                                NavigationLink(value: item.id) { row(item) }
                                    .accessibilityIdentifier("specimen-\(item.id)")
                            } else {
                                NavigationLink {
                                    SpecimenScreen(item: item, api: api, demo: demo, onChange: reload)
                                } label: {
                                    row(item)
                                }
                                .phoneRowDelete(enabled: !demo) { deleteTarget = item }
                                .disabled(deletingIDs.contains(item.id))
                            }
                        }
                    }
                    if let next {
                        Button("Load more items") { Task { await load(page: next, key: loadKey) } }.disabled(loading)
                    }
                } header: {
                    Text("Items")
                }
                .listRowBackground(CollectorDesign.surface)
            }
            if loading { ProgressView() }
            if let error { Text(error).foregroundStyle(.red) }
            if items.isEmpty && !loading && error == nil && (!query.isEmpty || !type.isEmpty || !folder.isEmpty) {
                ContentUnavailableView("No matching items", systemImage: "magnifyingglass",
                                       description: Text("Try a different search or clear a filter."))
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(CollectorDesign.background)
        .navigationTitle("Collection")
        .onChange(of: listView) { _, _ in revealedItem = nil }
        .onChange(of: loadKey) { _, _ in revealedItem = nil }
        .confirmPieceDeletion($deleteTarget, title: { $0.title }, message: "This removes the piece from your NumiAgent account.") { item in
            Task { await deletePiece(item) }
        }
        .alert("Couldn’t delete piece", isPresented: Binding(get: { deletionError != nil }, set: { if !$0 { deletionError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(deletionError ?? "") }
        .onChange(of: results.requestedMore) { _, _ in
            if let next, !loading { Task { await load(page: next, key: loadKey) } }
        }
        .searchable(text: $query, prompt: "Name, date, issuer or reference")
        .toolbar {
            if let openAccount {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Account", systemImage: "person.crop.circle", action: openAccount)
                }
            }
            if !demo {
                ToolbarItem(placement: .primaryAction) {
                    Button("Add item", systemImage: "plus") { addSheet = .actions }
                        .accessibilityIdentifier("collection-add-toolbar")
                    filterMenu
                }
            }
        }
        .sheet(item: $addSheet) { presented in
            if presented == .actions {
                AddItemActions(hasDraft: capture.hasDraft) { photos in
                    if photos {
                        addSheet = nil
                        openCapture(nil)
                    } else { addSheet = .manual }
                }
            } else { ItemEditor(api: api, onCreated: itemCreated, onSave: reload) }
        }
        .sheet(isPresented: $managingFolders, onDismiss: {
            reload()
            Task { await loadFolders() }
        }) { CollectionFoldersScreen(api: api) }
        .refreshable {
            await load(page: 0, key: loadKey)
            if !demo { await capture.refreshActivity(api: api) }
        }
        .task(id: loadKey) {
            let key = loadKey
            if !key.query.isEmpty {
                do { try await Task.sleep(for: .milliseconds(300)) }
                catch { return }
            }
            await load(page: 0, key: key)
            if workspaceSelection == nil && demo && PreviewLaunch.screen == .valuation {
                openedItemID = DemoCollection.specimens.first?.id
            }
        }
        .task {
            guard !demo else { return }
            await loadFolders()
            await monitorCaptureActivity()
        }
    }

    private struct LoadKey: Equatable {
        let query: String
        let type: String
        let folder: String
        let revision: Int
    }

    private var loadKey: LoadKey {
        .init(query: query, type: type, folder: folder, revision: workspaceSelection?.revision ?? revision)
    }

    private var collectionStart: some View {
        Section {
            if items.isEmpty && !loading {
                CollectorNotice(title: "Add your first item", message: "Start with photos of a coin or banknote.",
                                icon: "camera")
            }
            Button {
                addSheet = .actions
            } label: {
                Label("Add item", systemImage: "plus").frame(maxWidth: .infinity, minHeight: 30)
            }
            .buttonStyle(.borderedProminent)
            .accessibilityIdentifier("collection-add")
        }
        .listRowBackground(CollectorDesign.surface)
    }

    @ViewBuilder
    private var captureActivity: some View {
        if capture.hasDraft || !capture.activity.isEmpty {
            Section("Capture activity") {
                if capture.hasDraft {
                    Button { openCapture(nil) } label: {
                        Label(capture.uploading ? "Uploading draft" :
                                capture.draft.submittedName == nil ? "Resume photo draft" :
                                capture.draft.submittedAnalysis == false ? "Continue manual entry" : "Resume upload",
                              systemImage: "photo.on.rectangle")
                    }
                }
                ForEach(capture.activity) { batch in
                    Button { openCapture(batch.id) } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Label(batch.status, systemImage: batch.statusIcon).font(.headline)
                            Text(batch.label).font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .listRowBackground(CollectorDesign.surface)
        }
    }

    private var filterMenu: some View {
        Menu("Filter collection", systemImage: "line.3.horizontal.decrease.circle") {
            Button(listView ? "Show gallery" : "Show list", systemImage: listView ? "square.grid.2x2" : "list.bullet") {
                listView.toggle()
            }
            Picker("Item type", selection: $type) {
                Text("All items").tag("")
                Text("Coins").tag("coin")
                Text("Banknotes").tag("banknote")
            }
            Picker("Folder", selection: $folder) {
                Text("All folders").tag("")
                ForEach(folders) { folder in Text(folder.name).tag(folder.id) }
            }
            Button("Manage folders", systemImage: "folder") { managingFolders = true }
        }
    }

    private func row(_ item: Specimen) -> some View {
        HStack(spacing: 12) {
            SpecimenImage(api: api, id: item.photo, sampleAsset: demo ? DemoCollection.photo(for: item) : nil)
                .frame(width: 49, height: 49)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title).font(.headline)
                if !item.subtitle.isEmpty {
                    Text(item.subtitle).font(.subheadline).foregroundStyle(.secondary)
                }
            }
        }
    }

    private func deletePiece(_ item: Specimen) async {
        guard !demo, deletingIDs.insert(item.id).inserted else { return }
        defer { deletingIDs.remove(item.id) }
        do {
            try await api.deleteSpecimen(item.id)
            results.items.removeAll { $0.id == item.id }
            await load(page: 0, key: loadKey)
        } catch { deletionError = error.localizedDescription }
    }

    private func reload() {
        Task { await load(page: 0, key: loadKey) }
    }

    private func loadFolders() async {
        if let result: [CollectionFolder] = try? await api.get("/collections"), !Task.isCancelled {
            folders = result
            if !folder.isEmpty && !result.contains(where: { $0.id == folder }) { folder = "" }
        }
    }

    private func monitorCaptureActivity() async {
        while !Task.isCancelled {
            await capture.refreshActivity(api: api)
            do { try await Task.sleep(for: capture.imports.contains(where: \.isProcessing) ? .seconds(8) : .seconds(30)) }
            catch { return }
        }
    }

    private func load(page: Int, key: LoadKey) async {
        if demo {
            results.items = DemoCollection.specimens.filter {
                key.query.isEmpty || [$0.title, $0.issuer, $0.year, $0.ruler, $0.reference].contains {
                    $0.localizedCaseInsensitiveContains(key.query)
                }
            }
            return
        }
        if page == 0 { results.loadGeneration += 1 }
        let generation = results.loadGeneration
        results.loading = true
        results.error = nil
        do {
            let result: CollectionPage = try await api.get("/items", query: [
                URLQueryItem(name: "q", value: key.query),
                URLQueryItem(name: "type", value: key.type),
                URLQueryItem(name: "collection", value: key.folder),
                URLQueryItem(name: "page", value: String(page))
            ])
            guard !Task.isCancelled, key == loadKey, generation == results.loadGeneration else { return }
            results.items = page == 0 ? result.items : items + result.items.filter { resultItem in
                !items.contains(where: { $0.id == resultItem.id })
            }
            results.next = result.next
            results.loading = false
        } catch {
            guard !Task.isCancelled, key == loadKey, generation == results.loadGeneration else { return }
            results.error = error.localizedDescription
            results.loading = false
        }
    }
}

@MainActor func accountCard(_ item: Specimen, api: NumiAPI, demo: Bool) -> some View {
    CollectionCard(title: item.title, subtitle: item.subtitle) {
        SpecimenImage(api: api, id: item.photo, sampleAsset: demo ? DemoCollection.photo(for: item) : nil)
    }
}

struct ItemByIDScreen: View {
    let api: NumiAPI
    let id: String
    let demo: Bool
    var expanded = false
    let onChange: () -> Void
    @State private var item: Specimen?
    @State private var error: String?

    var body: some View {
        Group {
            if let item {
                SpecimenScreen(item: item, api: api, demo: demo, expanded: expanded, onChange: onChange)
            } else if let error {
                ContentUnavailableView {
                    Label("Couldn’t open the item", systemImage: "exclamationmark.circle")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try again") { Task { await load() } }
                }
            } else { ProgressView("Opening item") }
        }
        .task(id: id) { await load() }
    }

    private func load() async {
        error = nil
        if demo { item = DemoCollection.specimens.first(where: { $0.id == id }); return }
        do { item = try await api.get("/items/" + id) }
        catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}

struct SpecimenImage: View {
    let api: NumiAPI
    let id: String?
    let sampleAsset: String?
    var zoomLabel: String? = nil
    @State private var image: UIImage?
    @State private var inspecting = false

    var body: some View {
        Group {
            if let zoomLabel {
                Button { inspecting = true } label: {
                    thumbnail.overlay(alignment: .bottomTrailing) {
                        Image(systemName: "magnifyingglass").padding(8)
                            .background(.regularMaterial, in: .circle).padding(6)
                    }.contentShape(Rectangle())
                }.buttonStyle(.plain).accessibilityLabel(zoomLabel)
                    .disabled(image == nil && sampleAsset == nil)
            } else { thumbnail.accessibilityHidden(true) }
        }
        .task(id: id) {
            image = nil
            guard let id, let data = try? await api.photo(id), !Task.isCancelled else { return }
            if zoomLabel != nil {
                image = UIImage(data: data)
            } else {
                let preview = await Task.detached(priority: .utility) {
                    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil as CGImage? }
                    return CGImageSourceCreateThumbnailAtIndex(source, 0, [
                        kCGImageSourceCreateThumbnailFromImageAlways: true,
                        kCGImageSourceCreateThumbnailWithTransform: true,
                        kCGImageSourceThumbnailMaxPixelSize: 560
                    ] as CFDictionary)
                }.value
                if let preview, !Task.isCancelled { image = UIImage(cgImage: preview) }
            }
        }
        .fullScreenCover(isPresented: $inspecting) {
            if let photo = image ?? sampleAsset.flatMap({ UIImage(named: $0) }) { PiecePhotoViewer(photo: photo) }
        }
    }

    private var thumbnail: some View {
        ZStack {
            Rectangle().fill(Color.secondary.opacity(0.08))
            if let image {
                Image(uiImage: image).resizable().scaledToFit()
            } else if let sampleAsset {
                Image(sampleAsset).resizable().scaledToFit()
            } else {
                Image(systemName: "photo").foregroundStyle(.secondary)
            }
        }
    }
}

struct SpecimenScreen: View {
    @State private var item: Specimen
    let api: NumiAPI
    let demo: Bool
    let onChange: () -> Void
    let onDelete: (() -> Void)?
    let expanded: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var editing = false
    @State private var deleting = false
    @State private var merging = false
    @State private var identifying = false
    @State private var cardPresented = false
    @State private var saleEditor = false
    @State private var detailError: String?
    @State private var loaded = false
    @State private var valuation: Valuation?
    @State private var priceGuide = SpecimenGuideModel()
    @State private var valuationError: String?
    @State private var additionalView: PhotosPickerItem?
    @State private var addingView = false

    private var previewingValuation: Bool { demo && PreviewLaunch.screen == .valuation }

    init(item: Specimen, api: NumiAPI, demo: Bool, expanded: Bool = false,
         onChange: @escaping () -> Void, onDelete: (() -> Void)? = nil) {
        _item = State(initialValue: item)
        self.api = api
        self.demo = demo
        self.expanded = expanded
        self.onChange = onChange
        self.onDelete = onDelete
    }

    var body: some View {
        List {
            if !previewingValuation {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Label(item.type == "banknote" ? "Banknote" : "Coin",
                              systemImage: item.type == "banknote" ? "banknote" : "circle")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(CollectorDesign.tint)
                        Text(item.title).font(.title2.bold()).accessibilityAddTraits(.isHeader)
                        if !item.subtitle.isEmpty { Text(item.subtitle).foregroundStyle(.secondary) }
                    }
                    .padding(.vertical, 6)
                    photosSection
                    if (demo && DemoCollection.photo(for: item) != nil) ||
                        (loaded && (item.photo != nil || item.photos?.isEmpty == false)) {
                        Button("Ask for a second opinion", systemImage: "square.and.arrow.up") { cardPresented = true }
                            .buttonStyle(.bordered)
                    }
                    if !demo && loaded && (item.photos?.count ?? 0) < 12 {
                        PhotosPicker(selection: $additionalView, matching: .images) {
                            Label(addingView ? "Adding photo…" : item.photos?.count == 1 ? "Add the other side" : "Add a photo",
                                  systemImage: "photo.badge.plus")
                        }
                        .disabled(addingView)
                    }
                }
                .listRowBackground(CollectorDesign.surface)
                if !demo { itemActions }
                Section("Identification") {
                    field("Issuer", item.issuer)
                    field("Ruler", item.ruler)
                    field("Denomination", item.denomination)
                    field("Date", item.year)
                    if let referenceURL = item.details?.referenceUrl, let source = URL(string: referenceURL),
                       source.scheme == "https", !item.reference.isBlank {
                        Link(item.reference, destination: source)
                    } else {
                        field("Reference", item.reference)
                    }
                    field("Grade", item.grade)
                    field("Metal", item.details?.metal ?? "")
                    field("Mint", item.details?.mint ?? "")
                    field("Mint mark", item.details?.mintMark ?? "")
                    field("Series", item.details?.series ?? "")
                    field("Serial number", item.details?.serial ?? "")
                    field("Signatures", item.details?.signatures ?? "")
                    field("Obverse legend", item.details?.obverseLegend ?? "")
                    field("Reverse legend", item.details?.reverseLegend ?? "")
                    if !item.notes.isEmpty { Text(item.notes) }
                }
                .listRowBackground(CollectorDesign.surface)
            }
            Section("Sale evidence") {
                if let valuation {
                    if let range = valuation.range {
                        Text(range.low, format: .currency(code: valuation.currency)) +
                        Text(" – ") +
                        Text(range.high, format: .currency(code: valuation.currency))
                        if !demo {
                            LabeledContent("Median of \(valuation.used.count) comparable lots") {
                                Text(range.median, format: .currency(code: valuation.currency))
                            }
                        }
                        Text(demo ? "Illustrative prices" : "Range includes the buyer’s premium.").font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        Text(valuation.evidence.isEmpty ? "No verified sales yet" : "More comparable sales are needed for a range.")
                            .foregroundStyle(.secondary)
                        if item.grade.isBlank && !valuation.evidence.isEmpty {
                            Text("Add the specimen’s grade to compare sales in the same condition.").font(.footnote)
                        }
                    }
                    ForEach(valuation.evidence) { sale in
                        let row = VStack(alignment: .leading, spacing: 4) {
                            Text("\(sale.house) · Lot \(sale.lot)").font(.headline)
                            Text(sale.amount, format: .currency(code: sale.currency))
                            Text("\(sale.date) · \(sale.basis == "hammer" ? "Hammer price" : "Includes buyer’s premium")")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        if demo { row }
                        else { Link(destination: sale.url) { row } }
                    }
                } else if let valuationError {
                    Text(valuationError).foregroundStyle(.secondary)
                    Button("Retry valuation") { Task { await loadValuation() } }
                } else {
                    ProgressView()
                }
                if !demo {
                    SpecimenPriceGuide(api: api, item: item, model: priceGuide)
                    Button("Add a completed sale", systemImage: "plus") { saleEditor = true }
                }
            }
            .listRowBackground(CollectorDesign.surface)
            if let detailError { Text(detailError).foregroundStyle(.red) }
        }
        .scrollContentBackground(.hidden)
        .background(CollectorDesign.background)
        .task(id: loaded ? item.guideIdentity : []) {
            if loaded && !demo { await priceGuide.lookup(api: api, item: item) }
        }
        .navigationTitle(item.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !demo {
                ToolbarItem(placement: .primaryAction) {
                    Menu("Specimen actions", systemImage: "ellipsis.circle") {
                        Button("Edit specimen") { editing = true }.disabled(!loaded)
                        if item.photos?.isEmpty == false {
                            Button("Improve identification", systemImage: "viewfinder") { identifying = true }
                        }
                        Button("Merge with another record") { merging = true }.disabled(!loaded)
                        Button("Delete specimen", role: .destructive) { deleting = true }
                    }
                }
            }
        }
        .task {
            await loadDetail()
            await loadValuation()
        }
        .refreshable {
            await loadDetail()
            await loadValuation()
        }
        .onChange(of: additionalView) { _, pick in
            if let pick { Task { await attach(pick) } }
        }
        .sheet(isPresented: $editing) {
            ItemEditor(api: api, itemID: item.id, draft: ItemDraft(item: item)) {
                onChange()
                Task {
                    await loadDetail()
                    await loadValuation()
                }
            }
        }
        .sheet(isPresented: $saleEditor) {
            SaleEditor(api: api, itemID: item.id) { Task { await loadValuation() } }
        }
        .sheet(isPresented: $merging) {
            SpecimenMergeSheet(api: api, target: item) { merged in
                item = merged
                onChange()
                Task { await loadValuation() }
            }
        }
        .sheet(isPresented: $identifying) {
            SpecimenIdentificationSheet(api: api, item: item) {
                onChange()
                Task {
                    await loadDetail()
                    await loadValuation()
                }
            }
        }
        .sheet(isPresented: $cardPresented) {
            OpinionCardSheet(record: OpinionCardRecord(item, valuation: valuation, demo: demo)) {
                if demo, let name = DemoCollection.photo(for: item), let image = UIImage(named: name) {
                    return [image]
                }
                let links = CardPhotos.sides(of: item)
                if links.isEmpty, let id = item.photo {
                    return [try CardPhotos.image(data: await api.photo(id))]
                }
                var images: [UIImage] = []
                for link in links {
                    images.append(try CardPhotos.image(data: await api.photo(link.photoId), crop: link.crop))
                }
                return images
            }
        }
        .confirmationDialog("Delete this specimen?", isPresented: $deleting, titleVisibility: .visible) {
            Button("Delete specimen", role: .destructive) {
                Task {
                    do {
                        try await api.deleteSpecimen(item.id)
                        if let onDelete { onDelete() }
                        else { onChange(); dismiss() }
                    } catch { detailError = error.localizedDescription }
                }
            }
        }
    }

    private func attach(_ pick: PhotosPickerItem) async {
        guard !addingView else { return }
        addingView = true
        detailError = nil
        defer { additionalView = nil; addingView = false }
        do {
            let image = try await loadCaptureImage(pick)
            let data = try CaptureDraftStore.jpeg(image)
            let batch = UUID()
            try await api.createImport(id: batch, name: "Additional specimen photo", analyze: false,
                                       autoCatalog: false, paired: false, expectedPhotos: nil)
            let photo = try await api.uploadPhoto(data, batch: batch)
            let current = item.photos ?? []
            let side = current.isEmpty ? "obverse" : current.count == 1 ?
                (current[0].side == "reverse" ? "obverse" : "reverse") : "overview"
            let _: APIIdentifier = try await api.post("/items/" + item.id + "/photo-links",
                                                       payload: ["photoId": photo, "side": side])
            await loadDetail()
            onChange()
            identifying = true
        } catch { detailError = error.localizedDescription }
    }

    @ViewBuilder
    private var photosSection: some View {
        let sample = demo ? DemoCollection.photo(for: item) : nil
        if let photos = item.photos, !photos.isEmpty {
            let minimum: CGFloat = expanded ? 158 : 116
            LazyVGrid(columns: [GridItem(.adaptive(minimum: minimum), spacing: 10)], spacing: 12) {
                ForEach(photos) { photo in
                    galleryPhoto(photo, height: expanded ? 205 : 126)
                }
            }
            .padding(.vertical, 6)
        } else if item.photo != nil || sample != nil {
            SpecimenImage(api: api, id: item.photo, sampleAsset: sample, zoomLabel: "Zoom specimen photo")
                .frame(height: expanded ? 245 : 180)
                .clipShape(.rect(cornerRadius: 12))
        }
    }

    private var itemActions: some View {
        Section {
            NavigationLink {
                SaleResearchScreen(api: api, item: item) { Task { await loadValuation() } }
            } label: {
                Label("Find comparable sales", systemImage: "chart.bar")
            }
            NavigationLink {
                ThemesScreen(api: api, demo: false, embedded: true)
            } label: {
                Label("See checklist progress", systemImage: "checklist")
            }
            if loaded {
                Button("Edit identification", systemImage: "square.and.pencil") { editing = true }
            }
        }
        .listRowBackground(CollectorDesign.surface)
    }

    private func galleryPhoto(_ photo: PhotoLink, height: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            SpecimenImage(api: api, id: photo.photoId, sampleAsset: nil, zoomLabel: "Zoom " + photo.side + " photo")
                .frame(height: height)
                .clipShape(.rect(cornerRadius: 8))
            Text(photo.side == "obverse" ? "Front" : photo.side == "reverse" ? "Back" : "Detail")
                .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func field(_ name: String, _ value: String) -> some View {
        if !value.isEmpty { LabeledContent(name, value: value) }
    }

    private func loadValuation() async {
        valuationError = nil
        if demo { valuation = DemoCollection.value(for: item); return }
        do { valuation = try await api.get("/valuations/" + item.id) }
        catch { valuationError = error.localizedDescription }
    }

    private func loadDetail() async {
        guard !demo else { return }
        detailError = nil
        do {
            item = try await api.get("/items/" + item.id)
            loaded = true
        } catch { if !Task.isCancelled { detailError = error.localizedDescription } }
    }
}

private struct SpecimenMergeSheet: View {
    let api: NumiAPI
    let target: Specimen
    let onMerge: (Specimen) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var records: [Specimen] = []
    @State private var nextPage: Int?
    @State private var search = ""
    @State private var source: Specimen?
    @State private var confirming = false
    @State private var loading = true
    @State private var merging = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                Section("Keep this record") { recordLabel(target) }
                Section {
                    ForEach(records) { record in
                        Button {
                            source = record
                            confirming = true
                        } label: {
                            recordLabel(record)
                        }
                        .buttonStyle(.plain)
                    }
                    if let nextPage {
                        Button("Load more") { Task { await load(page: nextPage, query: search) } }
                            .disabled(loading)
                    }
                    if loading || merging { ProgressView() }
                    if !loading && records.isEmpty && error == nil { Text("No matching records").foregroundStyle(.secondary) }
                } header: {
                    Text("Choose the other record")
                } footer: {
                    Text("Select another record of this same physical item. Its photos and sale evidence will move to the record you keep.")
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .disabled(merging)
            .navigationTitle("Merge records")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, prompt: "Find the other record")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(merging) }
            }
            .task(id: search) {
                let submitted = search
                if !submitted.isEmpty {
                    do { try await Task.sleep(for: .milliseconds(250)) }
                    catch { return }
                }
                await load(page: 0, query: submitted)
            }
            .confirmationDialog("Merge these two records?", isPresented: $confirming, titleVisibility: .visible, presenting: source) { source in
                Button("Merge records") { Task { await merge(source) } }
            } message: { source in
                Text("Keep “\(target.title)” and combine it with “\(source.title)”. Filled fields on the record you keep take priority.")
            }
        }
        .interactiveDismissDisabled(merging)
    }

    private func recordLabel(_ item: Specimen) -> some View {
        HStack {
            SpecimenImage(api: api, id: item.photo, sampleAsset: nil)
                .frame(width: 54, height: 54)
            VStack(alignment: .leading) {
                Text(item.title).font(.headline)
                if !item.subtitle.isEmpty { Text(item.subtitle).font(.subheadline).foregroundStyle(.secondary) }
            }
        }
        .contentShape(Rectangle())
    }

    private func load(page: Int, query: String) async {
        loading = true
        error = nil
        do {
            let result: CollectionPage = try await api.get("/items", query: [
                .init(name: "q", value: query), .init(name: "type", value: target.type), .init(name: "page", value: String(page))
            ])
            guard !Task.isCancelled, query == search else { return }
            let other = result.items.filter { $0.id != target.id }
            records = page == 0 ? other : records + other.filter { candidate in !records.contains { $0.id == candidate.id } }
            nextPage = result.next
        } catch {
            guard !Task.isCancelled, query == search else { return }
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func merge(_ source: Specimen) async {
        merging = true
        error = nil
        defer { merging = false }
        do {
            let item: Specimen = try await api.post("/items/" + target.id + "/merge", payload: ["sourceId": source.id])
            onMerge(item)
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

struct ThemesScreen: View {
    let api: NumiAPI
    let demo: Bool
    var embedded = false
    var workspaceSelection: WorkspaceListSelection<ThemeSummary>? = nil
    var captureForSlot: ((String) -> Void)? = nil
    var findForSlot: ((String) -> Void)? = nil
    @State private var adding = false
    @State private var themes: [ThemeSummary] = []
    @State private var loading = true
    @State private var error: String?
    @State private var preview: String?

    var body: some View {
        if workspaceSelection != nil || embedded { checklists }
        else {
            NavigationStack {
                checklists.navigationDestination(item: $preview) { _ in
                    ThemeScreen(api: api, theme: DemoCollection.theme, demo: demo, onChange: {})
                }
            }
        }
    }

    private var checklists: some View {
        List(selection: workspaceSelection?.matching(themes)) {
            ForEach(themes) { theme in
                if workspaceSelection != nil {
                    NavigationLink(theme.name, value: theme.id)
                } else {
                    NavigationLink(theme.name) {
                        ThemeScreen(api: api, theme: theme, demo: demo, onChange: { Task { await load() } },
                                    captureForSlot: captureForSlot, findForSlot: findForSlot)
                    }
                }
            }
            if loading { ProgressView() }
            if let error { Text(error).foregroundStyle(.red) }
            if themes.isEmpty && !loading && error == nil {
                ContentUnavailableView("No checklists yet", systemImage: "checklist",
                                       description: Text("Create a checklist to track the pieces you still need."))
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(CollectorDesign.background)
        .navigationTitle("Checklists")
        .toolbar {
            if !demo {
                ToolbarItem(placement: .primaryAction) { Button("New checklist", systemImage: "plus") { adding = true } }
            }
        }
        .sheet(isPresented: $adding) { ChecklistEditor(api: api) { Task { await load() } } }
        .refreshable { await load() }
        .task(id: workspaceSelection?.revision ?? 0) {
            await load()
            if workspaceSelection == nil && demo && PreviewLaunch.screen == .checklists {
                preview = DemoCollection.theme.id
            }
        }
    }

    private func load() async {
        defer { loading = false }
        error = nil
        if demo { themes = [DemoCollection.theme]; return }
        do { themes = try await api.get("/themes") }
        catch { self.error = error.localizedDescription }
    }
}

struct ThemeScreen: View {
    let api: NumiAPI
    let theme: ThemeSummary
    let demo: Bool
    let onChange: () -> Void
    var onDelete: (() -> Void)? = nil
    var captureForSlot: ((String) -> Void)? = nil
    var findForSlot: ((String) -> Void)? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var editing = false
    @State private var deleting = false
    @State private var details: ThemeDetails?
    @State private var savingEmail = false
    @State private var error: String?

    var body: some View {
        List {
            if let details {
                Section("Progress") {
                    ProgressView(value: Double(details.percent), total: 100) {
                        Text("\(details.owned) of \(details.slots.count) slots filled")
                    }
                    if details.missingReferences > 0 {
                        Text("\(details.missingReferences) matching specimens need a catalog reference.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    if !demo {
                        if let email = details.emailNewLots {
                            Text("Missing items are checked for auction lots automatically.").font(.subheadline)
                            Button(email ? "Turn off checklist emails" : "Email me new lots for this checklist") {
                                Task {
                                    savingEmail = true
                                    defer { savingEmail = false }
                                    do {
                                        try await api.write("/watchlists/themes/" + theme.id + "/email", method: "PUT", payload: ["enabled": !email])
                                        await load()
                                    } catch { self.error = error.localizedDescription }
                                }
                            }.disabled(savingEmail || (!email && details.auctionEmailAvailable == false))
                        }
                        NavigationLink("Manage auction watches") { ChecklistWatchesScreen(api: api, themeID: theme.id) }
                    }
                }
                .listRowBackground(CollectorDesign.surface)
                let missing = details.slots.filter { $0.owned.isEmpty }
                let owned = details.slots.filter { !$0.owned.isEmpty }
                if !missing.isEmpty {
                    Section("Still needed") {
                        ForEach(missing.indices, id: \.self) { index in
                            missingSlot(missing[index])
                        }
                    }
                    .listRowBackground(CollectorDesign.surface)
                }
                if !owned.isEmpty {
                    Section("Owned") {
                        ForEach(owned.indices, id: \.self) { index in
                            let slot = owned[index]
                            Label(slot.label, systemImage: "checkmark.circle.fill").font(.headline)
                            ForEach(slot.owned) { match in
                                NavigationLink(match.title) {
                                    ItemByIDScreen(api: api, id: match.id, demo: demo, onChange: onChange)
                                }
                            }
                        }
                    }
                    .listRowBackground(CollectorDesign.surface)
                }
            } else if error == nil {
                ProgressView()
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .scrollContentBackground(.hidden)
        .background(CollectorDesign.background)
        .navigationTitle(details?.name ?? theme.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .toolbar {
            if !demo, details != nil {
                ToolbarItem(placement: .primaryAction) {
                    Menu("Checklist actions", systemImage: "ellipsis.circle") {
                        Button("Edit checklist") { editing = true }
                        Button("Delete checklist", role: .destructive) { deleting = true }
                    }
                }
            }
        }
        .sheet(isPresented: $editing) {
            if let details {
                ChecklistEditor(api: api, checklistID: theme.id,
                                draft: .init(name: details.name, slots: details.slots.compactMap(\.rule))) {
                    onChange()
                    Task { await load() }
                }
            }
        }
        .confirmationDialog("Delete this checklist?", isPresented: $deleting, titleVisibility: .visible) {
            Button("Delete checklist", role: .destructive) {
                Task {
                    do {
                        try await api.write("/themes/" + theme.id, method: "DELETE")
                        if let onDelete { onDelete() }
                        else { onChange(); dismiss() }
                    } catch { self.error = error.localizedDescription }
                }
            }
        }
    }

    private func missingSlot(_ slot: ThemeDetails.Slot) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(slot.label, systemImage: "circle").font(.headline)
            Text("Missing").font(.subheadline).foregroundStyle(.secondary)
            if !demo {
                let check = details?.auctionChecks?[slot.slotKey ?? ""]
                if check?.paused == true {
                    Text("Auction checks paused")
                } else if details?.auctionChecksAvailable == false || check?.status == "unavailable" {
                    Text("Auction source unavailable. We’ll check again.")
                } else if let lots = check?.lots {
                    if lots.isEmpty { Text("No matching lots found at the last check.") }
                    ForEach(lots.prefix(3), id: \.url) { lot in Link(lot.title + " · " + lot.label, destination: lot.url) }
                } else { Text("Waiting for the first automatic auction check").font(.footnote) }
                NavigationLink("Auction results and settings") {
                    GapAuctionScreen(api: api, themeID: theme.id, slot: slot, check: check)
                }
                if let captureForSlot {
                    Button("Add a photo for this slot", systemImage: "camera") { captureForSlot(slot.label) }
                        .buttonStyle(.borderless)
                }
                if let findForSlot {
                    Button("Find an item in Collection", systemImage: "magnifyingglass") {
                        // Search the most specific single field supported by the collection search.
                        findForSlot(slot.rule?.reference ?? slot.rule?.year ?? slot.rule?.ruler ?? slot.rule?.issuer ?? slot.label)
                    }
                    .buttonStyle(.borderless)
                }
            }
        }
    }

    private func load() async {
        if demo { details = DemoCollection.checklist; return }
        error = nil
        do { details = try await api.get("/themes/" + theme.id) }
        catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}

enum DemoCollection {
    static let specimens: [Specimen] = [
        .init(id: "demo-1", title: "Octavian denarius", type: "coin", ruler: "Octavian",
              issuer: "Roman Republic", denomination: "Denarius", year: "29–27 BCE",
              reference: "The Met 08.170.89", grade: "", notes: "Example record for exploring the catalog.", photo: nil,
              details: .init(metal: "Silver")),
        .init(id: "demo-2", title: "Mark Antony legionary denarius", type: "coin", ruler: "Mark Antony",
              issuer: "Roman Republic", denomination: "Denarius", year: "32–31 BCE",
              reference: "The Met 08.170.69", grade: "", notes: "Example record for exploring the catalog.", photo: nil,
              details: .init(metal: "Silver")),
        .init(id: "demo-3", title: "Bank of Canada one-dollar note", type: "banknote", ruler: "",
              issuer: "Bank of Canada", denomination: "1 dollar", year: "1935",
              reference: "", grade: "", notes: "Example banknote record.", photo: nil, details: nil)
    ]

    static let theme = ThemeSummary(id: "demo-theme", name: "Late Republican denarii")
    static let checklist = ThemeDetails(
        name: theme.name,
        slots: specimens.prefix(2).map { item in
            ThemeDetails.Slot(label: item.ruler, owned: [.init(id: item.id, title: item.title, hasReference: true)])
        } + [.init(label: "Sextus Pompey", owned: [])],
        owned: 2, percent: 67, missingReferences: 0
    )

    static func photo(for item: Specimen) -> String? {
        switch item.id {
        case "demo-1": return "DemoOctavian"
        case "demo-2": return "DemoAntony"
        default: return nil
        }
    }

    static func value(for item: Specimen) -> Valuation {
        guard item.id == "demo-1" else { return .init(currency: "USD", range: nil, evidence: [], used: []) }
        let prices: [Double] = [210, 245, 280]
        let sources = prices.enumerated().map { index, amount in
            Valuation.Sale(id: String(index), url: URL(string: "https://example.test")!, house: "Demo auction",
                           auction: "Sample sale", lot: String(31 + index), date: "Sample date",
                           amount: amount, currency: "USD", basis: "with_premium", premium: nil)
        }
        return .init(currency: "USD", range: .init(low: 227.5, median: 245, high: 262.5),
                     evidence: sources, used: sources.map(\.id))
    }
}
