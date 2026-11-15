import SwiftUI

struct CatalogScreen: View {
    let api: NumiAPI
    let demo: Bool
    var workspaceSelection: WorkspaceListSelection<Specimen>? = nil
    @State private var query = ""
    @State private var adding = false
    @State private var managingFolders = false
    @State private var items: [Specimen] = []
    @State private var next: Int?
    @State private var loading = false
    @State private var error: String?
    @State private var preview: String?

    var body: some View {
        if workspaceSelection != nil { catalog }
        else {
            NavigationStack {
                catalog.navigationDestination(item: $preview) { id in
                    if let item = DemoCollection.specimens.first(where: { $0.id == id }) {
                        SpecimenScreen(item: item, api: api, demo: demo, onChange: {})
                    }
                }
            }
        }
    }

    private var catalog: some View {
        List(selection: workspaceSelection?.matching(items)) {
            if demo {
                Text("Demo collection").font(.footnote).foregroundStyle(.secondary)
            }
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
                }
            }
            if let next {
                Button("Load more specimens") { Task { await load(page: next, query: query) } }.disabled(loading)
            }
            if loading { ProgressView() }
            if let error { Text(error).foregroundStyle(.red) }
            if items.isEmpty && !loading && error == nil {
                ContentUnavailableView(
                    query.isEmpty ? "No specimens yet" : "No matching specimens",
                    systemImage: "square.grid.2x2",
                    description: Text(query.isEmpty ? "Add a specimen or capture a batch of photographs." : "Try a different name or reference.")
                )
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Collection")
        .searchable(text: $query, prompt: "Name, ruler, or reference")
        .toolbar {
            if !demo {
                ToolbarItem(placement: .primaryAction) {
                    Button("Add specimen", systemImage: "plus") { adding = true }
                }
                ToolbarItem(placement: .topBarLeading) {
                    Button("Manage collections", systemImage: "folder") { managingFolders = true }
                }
            }
        }
        .sheet(isPresented: $adding) { ItemEditor(api: api) { reload() } }
        .sheet(isPresented: $managingFolders, onDismiss: reload) { CollectionFoldersScreen(api: api) }
        .refreshable { await load(page: 0, query: query) }
        .task(id: LoadKey(query: query, revision: workspaceSelection?.revision ?? 0)) {
            let requestedQuery = query
            if !requestedQuery.isEmpty {
                do { try await Task.sleep(for: .milliseconds(300)) }
                catch { return }
            }
            await load(page: 0, query: requestedQuery)
            if workspaceSelection == nil && demo && PreviewLaunch.screen == .valuation {
                preview = DemoCollection.specimens.first?.id
            }
        }
    }

    private struct LoadKey: Equatable {
        let query: String
        let revision: Int
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

    private func reload() {
        Task { await load(page: 0, query: query) }
    }

    private func load(page: Int, query requestedQuery: String) async {
        if demo {
            items = DemoCollection.specimens.filter {
                requestedQuery.isEmpty || [$0.title, $0.ruler, $0.reference].contains {
                    $0.localizedCaseInsensitiveContains(requestedQuery)
                }
            }
            return
        }
        loading = true
        error = nil
        do {
            let result: CollectionPage = try await api.get("/items", query: [
                URLQueryItem(name: "q", value: requestedQuery),
                URLQueryItem(name: "page", value: String(page))
            ])
            guard !Task.isCancelled, requestedQuery == query else { return }
            items = page == 0 ? result.items : items + result.items.filter { resultItem in
                !items.contains(where: { $0.id == resultItem.id })
            }
            next = result.next
            loading = false
        } catch {
            guard !Task.isCancelled, requestedQuery == query else { return }
            self.error = error.localizedDescription
            loading = false
        }
    }
}

struct SpecimenImage: View {
    let api: NumiAPI
    let id: String?
    let sampleAsset: String?
    @State private var image: UIImage?

    var body: some View {
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
        .accessibilityHidden(true)
        .task(id: id) {
            image = nil
            if let id, let data = try? await api.photo(id) {
                image = UIImage(data: data)
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
    @State private var saleEditor = false
    @State private var detailError: String?
    @State private var loaded = false
    @State private var valuation: Valuation?
    @State private var valuationError: String?

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
                let sample = demo ? DemoCollection.photo(for: item) : nil
                if let photos = item.photos, !photos.isEmpty {
                    if expanded {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 205), spacing: 12)], spacing: 12) {
                            ForEach(photos) { photo in galleryPhoto(photo, height: 220) }
                        }
                        .padding(.vertical, 8)
                    } else {
                        ForEach(photos) { photo in galleryPhoto(photo, height: 180) }
                    }
                } else if item.photo != nil || sample != nil {
                    SpecimenImage(api: api, id: item.photo, sampleAsset: sample)
                        .frame(height: expanded ? 300 : 200)
                        .listRowInsets(EdgeInsets())
                }
                Section("Specimen") {
                    field("Issuer", item.issuer)
                    field("Ruler", item.ruler)
                    field("Denomination", item.denomination)
                    field("Date", item.year)
                    field("Reference", item.reference)
                    field("Grade", item.grade)
                    field("Metal", item.details?.metal ?? "")
                    field("Mint", item.details?.mint ?? "")
                    if !item.notes.isEmpty { Text(item.notes) }
                }
            }
            Section("Auction valuation") {
                if let valuation {
                    if let range = valuation.range {
                        Text(range.low, format: .currency(code: valuation.currency)) +
                        Text(" – ") +
                        Text(range.high, format: .currency(code: valuation.currency))
                        Text(demo ? "Illustrative prices" : "Range includes the buyer’s premium.").font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("Insufficient comparable sales").foregroundStyle(.secondary)
                    }
                    ForEach(valuation.evidence) { sale in
                        let row = VStack(alignment: .leading, spacing: 4) {
                            Text("\(sale.house) · Lot \(sale.lot)").font(.headline)
                            Text(sale.amount, format: .currency(code: sale.currency))
                            Text("\(sale.date) · \(sale.basis == "hammer" ? "Hammer" : "With premium")")
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
            }
            if !demo {
                Section("Sale evidence") {
                    Button("Add realized sale") { saleEditor = true }
                    NavigationLink("Find comparable sales") {
                        SaleResearchScreen(api: api, itemID: item.id) { Task { await loadValuation() } }
                    }
                }
            }
            if let detailError { Text(detailError).foregroundStyle(.red) }
        }
        .navigationTitle(item.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !demo {
                ToolbarItem(placement: .primaryAction) {
                    Menu("Specimen actions", systemImage: "ellipsis.circle") {
                        Button("Edit specimen") { editing = true }.disabled(!loaded)
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
        .confirmationDialog("Delete this specimen?", isPresented: $deleting, titleVisibility: .visible) {
            Button("Delete specimen", role: .destructive) {
                Task {
                    do {
                        try await api.write("/items/" + item.id, method: "DELETE")
                        if let onDelete { onDelete() }
                        else { onChange(); dismiss() }
                    } catch { detailError = error.localizedDescription }
                }
            }
        }
    }

    private func galleryPhoto(_ photo: PhotoLink, height: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            SpecimenImage(api: api, id: photo.photoId, sampleAsset: nil)
                .frame(height: height)
                .clipShape(.rect(cornerRadius: 8))
            Text(photo.side.capitalized).font(.caption).foregroundStyle(.secondary)
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

struct ThemesScreen: View {
    let api: NumiAPI
    let demo: Bool
    var workspaceSelection: WorkspaceListSelection<ThemeSummary>? = nil
    @State private var adding = false
    @State private var themes: [ThemeSummary] = []
    @State private var loading = true
    @State private var error: String?
    @State private var preview: String?

    var body: some View {
        if workspaceSelection != nil { checklists }
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
                        ThemeScreen(api: api, theme: theme, demo: demo, onChange: { Task { await load() } })
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
    @Environment(\.dismiss) private var dismiss
    @State private var editing = false
    @State private var deleting = false
    @State private var details: ThemeDetails?
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
                }
                Section("Checklist") {
                    ForEach(details.slots.indices, id: \.self) { index in
                        let slot = details.slots[index]
                        VStack(alignment: .leading, spacing: 4) {
                            Label(slot.label, systemImage: slot.owned.isEmpty ? "circle" : "checkmark.circle.fill")
                                .font(.headline)
                            if slot.owned.isEmpty {
                                Text("Missing").foregroundStyle(.secondary)
                            } else {
                                ForEach(slot.owned) { match in
                                    Text(match.title).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            } else if error == nil {
                ProgressView()
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
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
