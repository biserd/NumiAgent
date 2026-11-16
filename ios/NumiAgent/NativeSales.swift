import SwiftUI

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
            if let research {
                if research.results.isEmpty {
                    Text(explanation(research.status)).foregroundStyle(.secondary)
                }
                ForEach(research.results) { sale in
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(sale.house) · Lot \(sale.lot)").font(.headline)
                        Text(sale.amount, format: .currency(code: sale.currency))
                        Text(sale.date).font(.footnote).foregroundStyle(.secondary)
                        if let url = URL(string: sale.url), url.scheme == "https" {
                            Link("Open auction source", destination: url)
                        }
                        Button("Review and add") { selected = sale }
                    }
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
                Button("Add realized sale", systemImage: "plus") { saleEditor = true }
            } header: {
                Text("Look up completed sales")
            } footer: {
                Text("Compare the date, variety and condition before adding a result. Use the amount from a completed sale.")
            }
        }
        .navigationTitle("Comparable sales")
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
        case "provider_not_configured": return "NumiAgent doesn’t have a completed-sales feed connected. You can still look up sold listings or add a sale below."
        case "reference_required": return "Add a catalog reference to search the connected sale feed."
        case "no_matches": return "No verified sources matched this catalog reference."
        default: return "The connected sale feed couldn’t be reached. You can still look up sold listings below."
        }
    }

    private var soldSearch: URL? {
        var components = URLComponents(string: "https://www.ebay.com/sch/i.html")
        components?.queryItems = [
            .init(name: "_nkw", value: keywords.trimmingCharacters(in: .whitespacesAndNewlines)),
            .init(name: "LH_Sold", value: "1"), .init(name: "LH_Complete", value: "1"),
            .init(name: "_sop", value: "13")
        ]
        return components?.url
    }
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
            .navigationTitle("Add sale evidence")
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
