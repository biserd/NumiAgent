import SwiftUI

private struct GuideResult: Decodable {
    struct Issue: Decodable, Identifiable { let id: Int; let label: String }
    struct Price: Decodable { let grade: String; let price: Double }
    let status: String
    let typeID, issueID: Int?
    let source: URL?
    let currency: String
    let issues: [Issue]?
    let candidates: [Issue]?
    let prices: [Price]?

    var message: String? {
        switch status {
        case "reference_required": return "Enter the N# from the Numista catalog."
        case "provider_not_configured": return "The Numista price guide is currently unavailable."
        case "not_found": return "Numista could not find that type or issue."
        case "no_issues": return "Numista has no issues listed for this type."
        case "no_prices": return "Numista has no grade estimates for this issue."
        case "rate_limited": return "The guide reached its request limit. Try again later."
        case "unavailable": return "Numista could not return a price guide. Try again later."
        default: return nil
        }
    }
}

extension Specimen {
    var guideIdentity: [String] {
        [id, reference, title, type, issuer, denomination, ruler, year,
         details?.referenceUrl ?? "", details?.mintMark ?? "", details?.mint ?? "", details?.variant ?? ""]
    }
}

@MainActor @Observable final class SpecimenGuideModel {
    var number = ""
    fileprivate var guide: GuideResult?
    var busy = false
    var error: String?
    private var requestID = UUID()

    func lookup(api: NumiAPI, item: Specimen, manual: Bool = false, issue: Int? = nil) async {
        if !manual && issue == nil { number = ""; guide = nil }
        let current = UUID()
        requestID = current
        busy = true
        error = nil
        defer { if requestID == current { busy = false } }
        let path = "/valuations/" + item.id + "/guide"
        do {
            let result: GuideResult
            if let issue, let type = guide?.typeID {
                result = try await api.post(path, payload: ["type": type, "issue": issue])
            } else {
                let query = manual ? URLQueryItem(name: "type", value: number) : URLQueryItem(name: "auto", value: "1")
                result = try await api.get(path, query: [query])
            }
            if current == requestID && !Task.isCancelled { guide = result }
        } catch {
            if current == requestID && !Task.isCancelled { self.error = error.localizedDescription }
        }
    }
}

struct SpecimenPriceGuide: View {
    let api: NumiAPI
    let item: Specimen
    @Bindable var model: SpecimenGuideModel
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Numista price guide by grade").font(.headline)
            if model.busy { ProgressView("Checking Numista") }
            if let error = model.error { Text(error).foregroundStyle(.secondary) }
            if let message = model.guide?.message { Text(message).font(.subheadline) }
            if let guide = model.guide {
                if let prices = guide.prices, !prices.isEmpty {
                    ForEach(prices, id: \.grade) { row in
                        LabeledContent(row.grade.uppercased()) { Text(row.price, format: .currency(code: guide.currency)) }
                    }
                }
                if let source = guide.source, let id = guide.typeID { Link("Numista N# \(id)", destination: source) }
                if let candidates = guide.candidates, !candidates.isEmpty {
                    Menu("Choose the catalog type") {
                        ForEach(candidates) { row in
                            Button(row.label + " · N# " + String(row.id)) {
                                model.number = String(row.id)
                                Task { await model.lookup(api: api, item: item, manual: true) }
                            }
                        }
                    }
                }
                if guide.status == "choose_issue", let choices = guide.issues {
                    Menu("Choose year, mint or variety") {
                        ForEach(choices) { issue in
                            Button(issue.label) { Task { await model.lookup(api: api, item: item, issue: issue.id) } }
                        }
                    }
                }
            }
            DisclosureGroup("Set or change the catalog match") {
                TextField("Numista N#", text: $model.number).keyboardType(.numberPad)
                Button("Find issues") { Task { await model.lookup(api: api, item: item, manual: true) } }.disabled(Int(model.number) == nil || model.busy)
            }
            if model.error != nil || model.guide?.status == "unavailable" || model.guide?.status == "rate_limited" {
                Button("Retry price guide") { Task { await model.lookup(api: api, item: item) } }
            }
        }
        .buttonStyle(.borderless)
    }
}
private struct AuctionWatch: Decodable, Identifiable {
    let id, query: String
    let slotKey, themeId, state: String?
    let alert: Int
    var subtitle: String {
        if state == "filled" { return "Paused · slot filled" }
        if state == "rule_changed" { return "Paused · checklist rule changed" }
        return alert == 1 ? "Watching · email alerts on" : "Watching · email alerts off"
    }
}

struct ChecklistWatchesScreen: View {
    let api: NumiAPI
    let themeID: String
    @State private var watches: [AuctionWatch]?
    @State private var error: String?
    var body: some View {
        List {
            if let watches {
                if watches.isEmpty { Text("Automatic watches appear after the first scheduled check.") }
                ForEach(watches) { watch in
                    VStack(alignment: .leading) {
                        Text(watch.query).font(.headline)
                        Text(watch.subtitle).foregroundStyle(.secondary)
                        Button("Stop watching") {
                            Task {
                                do { try await api.write("/watchlists/" + watch.id, method: "DELETE"); await load() }
                                catch { self.error = error.localizedDescription }
                            }
                        }.buttonStyle(.borderless)
                    }
                }
            } else if error == nil { ProgressView() }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("Auction watches")
        .task { await load() }
        .refreshable { await load() }
    }
    private func load() async {
        do {
            let all: [AuctionWatch] = try await api.get("/watchlists")
            watches = all.filter { $0.themeId == themeID }
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}

struct GapAuctionScreen: View {
    let api: NumiAPI
    let themeID: String
    let slot: ThemeDetails.Slot
    let check: ThemeDetails.AuctionCheck?
    private struct Capabilities: Decodable { let emailAlerts: Bool }
    private struct Search: Decodable {
        struct Lot: Decodable { let title, state: String; let url: URL }
        let status: String
        let results: [Lot]
    }
    private struct Subscription: Encodable { let themeId, slotKey: String; let alert: Bool? }
    @State private var watch: AuctionWatch?
    @State private var stoppedHere = false
    @State private var ready = false
    @State private var busy = false
    @State private var emailAvailable = false
    @State private var search: Search?
    @State private var error: String?
    private var query: String { slot.query ?? slot.label }

    var body: some View {
        List {
            Section {
                Text(slot.label).font(.headline)
                if let watch {
                    Text(watch.subtitle)
                    if emailAvailable || watch.alert == 1 {
                        Button(watch.alert == 1 ? "Turn off email alerts" : "Email me new lots") {
                            Task { await update(email: watch.alert == 0) }
                        }
                    }
                    Button("Stop watching") { Task { await update(remove: true) } }
                } else if ready, slot.slotKey != nil {
                    if check?.paused == true || stoppedHere {
                        Button("Resume auction checks") { Task { await update() } }
                    } else { Text("Automatic watch scheduled") }
                }
            } footer: { Text("Alerts pause when you fill this slot. Check auction status on biddr for discovery leads.") }
            Section("Auctions") {
                if search == nil, let lots = check?.lots, !stoppedHere {
                    ForEach(lots, id: \.url) { lot in Link(lot.title + " · " + lot.label, destination: lot.url) }
                }
                Button("Refresh auction results") {
                    Task {
                        guard !busy else { return }
                        busy = true
                        defer { busy = false }
                        error = nil
                        do { search = try await api.get("/market/search", query: [.init(name: "q", value: query)]) }
                        catch { self.error = error.localizedDescription }
                    }
                }
                if let search {
                    if search.status == "unavailable" { Text("Automatic auction search is unavailable. Search the marketplaces below.") }
                    else if search.results.isEmpty { Text("No matching lots were found.") }
                    ForEach(search.results, id: \.url) { lot in
                        Link(destination: lot.url) {
                            VStack(alignment: .leading) {
                                Text(lot.title)
                                Text(lot.state == "unknown" ? "Status unverified" : lot.state.capitalized).font(.caption)
                            }
                        }
                    }
                }
                if let ebay = marketplace("https://www.ebay.com/sch/i.html", [.init(name: "_nkw", value: query), .init(name: "LH_Auction", value: "1")]) {
                    Link("Search eBay auctions", destination: ebay)
                }
                if let biddr = marketplace("https://www.biddr.com/search", [.init(name: "s", value: query)]) {
                    Link("Search biddr", destination: biddr)
                }
            }
            if busy { ProgressView() }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .disabled(busy)
        .navigationTitle("Auctions for this gap")
        .task { await load() }
        .refreshable { await load() }
    }
    private func marketplace(_ base: String, _ items: [URLQueryItem]) -> URL? {
        var url = URLComponents(string: base)
        url?.queryItems = items
        return url?.url
    }
    private func load() async {
        do {
            let all: [AuctionWatch] = try await api.get("/watchlists")
            watch = all.first { $0.themeId == themeID && $0.slotKey == slot.slotKey }
            ready = true
            let sources: Capabilities = try await api.get("/market/capabilities")
            emailAvailable = sources.emailAlerts
            error = nil
        } catch { self.error = error.localizedDescription }
    }
    private func update(email: Bool? = nil, remove: Bool = false) async {
        guard let key = slot.slotKey, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            if remove, let watch { try await api.write("/watchlists/" + watch.id, method: "DELETE") }
            else { try await api.write("/watchlists/gap", method: "POST", payload: Subscription(themeId: themeID, slotKey: key, alert: email)) }
            stoppedHere = remove
            await load()
        } catch { self.error = error.localizedDescription }
    }
}

private struct SaleDraft: Codable, Identifiable {
    let url: String
    var date: String
    var amount: Double
    var currency: String
    var basis: String
    var premium: Double?
    var house, auction, lot, grade, match: String
    var fx: ExchangeRate?
    var sourceChecked: Bool?
    var id: String { url }

    struct ExchangeRate: Codable {
        let currency: String
        let rate: Double
        let date: String
        let source: String
    }
}

private struct SaleResearch: Decodable {
    let status: String
    let results: [SaleDraft]
}

struct SaleResearchScreen: View {
    let api: NumiAPI
    let item: Specimen
    let onSave: () -> Void
    @State private var research: SaleResearch?
    @State private var selected: SaleDraft?
    @State private var error: String?
    @State private var saleEditor = false
    @State private var keywords: String

    init(api: NumiAPI, item: Specimen, onSave: @escaping () -> Void) {
        self.api = api
        self.item = item
        self.onSave = onSave
        let identity = [item.issuer, item.year, item.denomination].filter { !$0.isBlank }
        let keywords = identity.count >= 2 ? identity : [item.title] + identity.filter {
            !item.title.localizedCaseInsensitiveContains($0)
        }
        _keywords = State(initialValue: keywords.joined(separator: " "))
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(item.title).font(.title2.bold())
                    if !item.subtitle.isEmpty { Text(item.subtitle).foregroundStyle(.secondary) }
                }
            }
            .listRowBackground(CollectorDesign.surface)
            if let research {
                if research.results.isEmpty {
                    Section {
                        CollectorNotice(title: "No verified sales yet", message: explanation(research.status),
                                        icon: "chart.bar", warning: research.status != "no_matches")
                    }
                    .listRowBackground(CollectorDesign.surface)
                }
                ForEach(research.results) { sale in
                    Section {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("\(sale.house) · Lot \(sale.lot)").font(.headline)
                            Text(sale.amount, format: .currency(code: sale.currency))
                            Text("\(sale.date) · \(sale.basis == "hammer" ? "Hammer price" : "Includes buyer’s premium")")
                                .font(.footnote).foregroundStyle(.secondary)
                            if !sale.grade.isEmpty { Text(sale.grade).font(.footnote).foregroundStyle(.secondary) }
                        }
                        if let url = URL(string: sale.url), url.scheme == "https" {
                            Link(destination: url) { Label("Open original lot", systemImage: "arrow.up.right.square") }
                        }
                        Button("Review and add") { selected = sale }
                    }
                    .listRowBackground(CollectorDesign.surface)
                }
            } else if error == nil {
                ProgressView("Finding realized sales")
            }
            if let error { Text(error).foregroundStyle(.red) }
            Section {
                TextField("Search terms", text: $keywords)
                if let soldSearch, !keywords.isBlank {
                    Link(destination: soldSearch) { Label("Search sold listings on eBay", systemImage: "arrow.up.right.square") }
                }
                if let archive = URL(string: "https://www.numisbids.com/results") {
                    Link(destination: archive) { Label("Browse NumisBids auction results", systemImage: "arrow.up.right.square") }
                }
            } header: {
                Text("Look up completed sales")
            } footer: {
                Text("Compare the date, variety and condition before adding a result. Use the amount from a completed sale.")
            }
            .listRowBackground(CollectorDesign.surface)
        }
        .scrollContentBackground(.hidden)
        .background(CollectorDesign.background)
        .navigationTitle("Comparable sales")
        .safeAreaInset(edge: .bottom) {
            VStack {
                Button {
                    saleEditor = true
                } label: {
                    Label("Add a completed sale", systemImage: "plus").frame(maxWidth: .infinity, minHeight: 30)
                }
                .buttonStyle(.borderedProminent)
            }
            .padding(14)
            .background(CollectorDesign.surface)
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $selected) { sale in
            SaleEditor(api: api, itemID: item.id, sale: sale, onSave: onSave)
        }
        .sheet(isPresented: $saleEditor) {
            SaleEditor(api: api, itemID: item.id, onSave: onSave)
        }
    }

    private func load() async {
        error = nil
        do { research = try await api.get("/valuations/" + item.id + "/research") }
        catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }

    private func explanation(_ status: String) -> String {
        switch status {
        case "provider_not_configured": return "Automatic lookup is unavailable. Find a completed sale and add its original lot link."
        case "reference_required": return "Add a catalog reference to search the connected sale feed."
        case "no_matches": return "No verified sources matched this catalog reference."
        default: return "The connected sale feed couldn’t be reached. You can still look up sold listings below."
        }
    }

    private var soldSearch: URL? {
        soldListingsURL(keywords)
    }
}

func soldListingsURL(_ keywords: String) -> URL? {
    let query = keywords.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return nil }
    var url = URLComponents(string: "https://www.ebay.com/sch/i.html")
    url?.queryItems = [.init(name: "_nkw", value: query), .init(name: "LH_Sold", value: "1"),
                       .init(name: "LH_Complete", value: "1"), .init(name: "_sop", value: "13")]
    return url?.url
}

struct SaleEditor: View {
    let api: NumiAPI
    let itemID: String
    let onSave: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var url = ""
    @State private var date = Date()
    @State private var amount: Double?
    @State private var currency = "USD"
    @State private var basis = "with_premium"
    @State private var premium: Double?
    @State private var house = ""
    @State private var auction = ""
    @State private var lot = ""
    @State private var grade = ""
    @State private var match = "possible"
    @State private var sourceChecked = false
    @State private var busy = false
    @State private var error: String?
    private var exchangeRate: SaleDraft.ExchangeRate?

    init(api: NumiAPI, itemID: String, onSave: @escaping () -> Void) {
        self.api = api
        self.itemID = itemID
        self.onSave = onSave
    }

    fileprivate init(api: NumiAPI, itemID: String, sale: SaleDraft, onSave: @escaping () -> Void) {
        self.init(api: api, itemID: itemID, onSave: onSave)
        _url = State(initialValue: sale.url)
        _date = State(initialValue: Self.day.date(from: sale.date) ?? Date())
        _amount = State(initialValue: sale.amount)
        _currency = State(initialValue: sale.currency)
        _basis = State(initialValue: sale.basis)
        _premium = State(initialValue: sale.premium)
        _house = State(initialValue: sale.house)
        _auction = State(initialValue: sale.auction)
        _lot = State(initialValue: sale.lot)
        _grade = State(initialValue: sale.grade)
        _match = State(initialValue: sale.match)
        exchangeRate = sale.fx
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Auction record") {
                    TextField("HTTPS source URL", text: $url)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    if let source = URL(string: url), source.scheme == "https" {
                        Link("Check auction listing", destination: source)
                    }
                    TextField("Auction house", text: $house)
                    TextField("Auction name", text: $auction)
                    TextField("Lot number", text: $lot)
                    DatePicker("Sale date", selection: $date, in: ...Date(), displayedComponents: .date)
                    TextField("Grade", text: $grade)
                }
                Section("Realized price") {
                    TextField("Amount paid", value: $amount, format: .number).keyboardType(.decimalPad)
                    TextField("Currency code", text: $currency)
                        .textInputAutocapitalization(.characters).autocorrectionDisabled()
                    Picker("Price basis", selection: $basis) {
                        Text("With buyer’s premium").tag("with_premium")
                        Text("Hammer price").tag("hammer")
                    }
                    if basis == "hammer" {
                        TextField("Buyer’s premium (%)", value: $premium, format: .number).keyboardType(.decimalPad)
                    }
                    Picker("Specimen match", selection: $match) {
                        Text("Possible match").tag("possible")
                        Text("Strong match").tag("strong")
                    }
                    Toggle("I checked the original sale", isOn: $sourceChecked)
                }
                if busy { ProgressView() }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .scrollContentBackground(.hidden)
            .background(CollectorDesign.background)
            .navigationTitle("Add a completed sale")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(busy || !sourceChecked || (amount ?? 0) <= 0 ||
                                  house.isBlank || auction.isBlank || lot.isBlank || url.isBlank)
                }
            }
            .interactiveDismissDisabled(busy)
        }
    }

    private static var day: DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }

    private func save() async {
        guard let amount else { return }
        busy = true
        error = nil
        defer { busy = false }
        let sale = SaleDraft(url: url.trimmingCharacters(in: .whitespacesAndNewlines), date: Self.day.string(from: date),
                             amount: amount, currency: currency.trimmingCharacters(in: .whitespaces).uppercased(),
                             basis: basis, premium: basis == "hammer" ? premium : nil,
                             house: house, auction: auction, lot: lot, grade: grade, match: match, fx: exchangeRate, sourceChecked: true)
        do {
            try await api.write("/valuations/" + itemID + "/sales", method: "POST", payload: [sale])
            onSave()
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
}
