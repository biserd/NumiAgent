import SwiftUI
import ImageIO
import ImagePlayground
import UniformTypeIdentifiers

private func cardMoney(_ amount: Double?, _ code: String?) -> String? {
    let currency = (code ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    guard let amount, amount.isFinite, amount >= 0, Locale.commonISOCurrencyCodes.contains(currency) else { return nil }
    return currency + " " + amount.formatted(.number.precision(.fractionLength(0...2)))
}

struct CardPrice: Equatable {
    let label: String
    let amount: String
    let source: String

    init?(valuation: Valuation?, grade: String, demo: Bool) {
        guard let valuation else { return nil }
        let used = Set(valuation.used)
        if let range = valuation.range, used.count >= 3,
           let low = cardMoney(range.low, valuation.currency), range.high >= range.low {
            label = demo ? "DEMO MARKET ESTIMATE" : "ESTIMATED MARKET RANGE"
            amount = low + " – " + range.high.formatted(.number.precision(.fractionLength(0...2)))
            source = ["\(used.count) comparable sales incl. premium", valuation.asOf].compactMap { $0 }.joined(separator: " · ")
        } else {
            let sales = valuation.evidence.filter { sale in
                (used.contains(sale.id) || (sale.match == "strong" &&
                    (grade.isBlank || sale.grade?.localizedCaseInsensitiveCompare(grade) == .orderedSame))) &&
                    (valuation.asOf.map { sale.date <= $0 } ?? true)
            }
            guard let sale = sales.max(by: { $0.date < $1.date }), let price = cardMoney(sale.amount, sale.currency) else { return nil }
            label = "COMPARABLE AUCTION SALE"
            amount = price + (sale.basis == "hammer" ? " hammer" : " incl. premium")
            source = [sale.house, sale.auction, "Lot " + sale.lot, sale.date, sale.grade ?? ""].filter { !$0.isBlank }.joined(separator: " · ")
        }
    }
}

struct OpinionCardRecord {
    let title: String
    let issuer: String
    let denomination: String
    let year: String
    let banknote: Bool
    var facts: [(String, String)] = []
    var inscriptions: [(String, String)] = []
    var price: CardPrice?
    var paid: String?

    init(_ piece: GuestPiece) {
        let candidate = piece.manuallyEditedFields?.contains(.title) == true ? nil : piece.recognition?.suggestions.first
        self.init(title: piece.title.isBlank ? (candidate?.title ?? "") : piece.title,
                  issuer: piece.issuer, denomination: piece.denomination, year: piece.year,
                  banknote: piece.type == "banknote")
        addInscription("INSCRIPTION", piece.inscription)
        paid = cardMoney(Double(piece.purchasePrice.trimmingCharacters(in: .whitespacesAndNewlines)), piece.purchaseCurrency)
    }

    init(_ item: Specimen, valuation: Valuation?, demo: Bool) {
        self.init(title: item.title, issuer: item.issuer, denomination: item.denomination,
                  year: item.year, banknote: item.type == "banknote")
        let d = item.details
        func measure(_ value: Double?, _ unit: String) -> String? {
            value.flatMap { $0 > 0 ? $0.formatted(.number.precision(.fractionLength(0...3))) + " " + unit : nil }
        }
        let extra: [(String, String?)] = [("MINT", d?.mint), ("METAL", d?.metal),
            ("WEIGHT", measure(d?.weightG, "g")), ("DIAMETER", measure(d?.diameterMm, "mm")),
            ("SERIES", d?.series), ("SIGNATURES", d?.signatures), ("GRADE", item.grade),
            ("CATALOG REF.", item.reference), ("MINT MARK", d?.mintMark), ("RULER", item.ruler),
            ("VARIETY", d?.variant), ("DIE AXIS", d?.dieAxis.map { "\($0) h" })]
        for (label, value) in extra {
            if let value, !value.isBlank { facts.append((label, value)) }
        }
        addInscription(banknote ? "FACE" : "OBVERSE", d?.obverseLegend)
        addInscription(banknote ? "BACK" : "REVERSE", d?.reverseLegend)
        if let other = d?.inscriptions, !inscriptions.contains(where: { $0.1.caseInsensitiveCompare(other) == .orderedSame }) {
            addInscription("INSCRIPTION", other)
        }
        price = CardPrice(valuation: valuation, grade: item.grade, demo: demo)
        paid = cardMoney(d?.purchasePrice, d?.currency)
    }

    private init(title: String, issuer: String, denomination: String, year: String, banknote: Bool) {
        self.title = title.isBlank ? (banknote ? "Unidentified banknote" : "Unidentified coin") : title
        self.issuer = issuer
        self.denomination = denomination
        self.year = year
        self.banknote = banknote
        facts = [("ISSUER", issuer), ("DENOMINATION", denomination), ("DATE", year)].filter { !$0.1.isBlank }
    }

    private mutating func addInscription(_ label: String, _ text: String?) {
        if let text, !text.isBlank { inscriptions.append((label, text)) }
    }

    var suggestedStyle: CardStyle {
        if banknote { return .engraving }
        let words = [title, issuer, denomination, year].joined(separator: " ").lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
        let ancient = ["ancient", "roman", "byzantine", "hellenistic", "achaemenid", "ptolemaic", "seleucid",
                       "denarius", "aureus", "sestertius", "obol", "stater", "tetradrachm", "bce", "bc"]
        return words.contains(where: ancient.contains) ? .antiquity : .mint
    }

    var questions: [String] {
        banknote
            ? ["Which issue do you think this is?", "Do the signatures narrow down the series?", "Which catalog reference would you use?"]
            : ["What points you toward this identification?", "Can you place the mint or variety?", "Which catalog reference would you use?"]
    }

    var factRows: [[(String, String)]] {
        stride(from: 0, to: facts.count, by: 3).map { Array(facts[$0..<min($0+3, facts.count)]) }
    }
}

enum CardStyle: String, CaseIterable, Identifiable {
    case antiquity = "Antiquity", mint = "Mint cabinet", engraving = "Engraving"
    var id: Self { self }
    var asset: String {
        switch self { case .antiquity: "CardAntiquity"; case .mint: "CardMint"; case .engraving: "CardEngraving" }
    }
    var accent: Color {
        switch self {
        case .antiquity: Color(red: 0.92, green: 0.79, blue: 0.54)
        case .mint: Color(red: 0.78, green: 0.86, blue: 0.99)
        case .engraving: Color(red: 0.98, green: 0.84, blue: 0.71)
        }
    }
    var artDirection: String {
        switch self {
        case .antiquity: "Antique gold acanthus, a Greek key border and dark patinated bronze."
        case .mint: "Platinum Art Deco fans etched into midnight-blue enamel."
        case .engraving: "Fine rose-gold guilloché rosettes engraved on deep green paper."
        }
    }
}

enum CardPhotoError: LocalizedError {
    case unavailable
    var errorDescription: String? { "A photo could not be opened. Reopen the piece and try again." }
}

enum CardPhotos {
    // Decode an upright, bounded raster before applying the specimen's saved crop.
    static func image(data: Data, crop: PhotoCrop? = nil) throws -> UIImage {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 1800
              ] as CFDictionary) else { throw CardPhotoError.unavailable }
        guard let crop else { return UIImage(cgImage: image) }
        let width = CGFloat(image.width), height = CGFloat(image.height)
        let rect = CGRect(x: crop.x * width, y: crop.y * height,
                          width: crop.width * width, height: crop.height * height)
            .integral.intersection(CGRect(x: 0, y: 0, width: width, height: height))
        guard !rect.isEmpty, let cropped = image.cropping(to: rect) else { throw CardPhotoError.unavailable }
        return UIImage(cgImage: cropped)
    }

    static func sides(of item: Specimen) -> [PhotoLink] {
        let links = item.photos ?? []
        var ordered: [PhotoLink] = []
        for side in ["obverse", "reverse"] {
            if let photo = links.first(where: { $0.side == side }) { ordered.append(photo) }
        }
        for photo in links where ordered.count < 2 && !ordered.contains(where: { $0.id == photo.id }) {
            ordered.append(photo)
        }
        return ordered
    }
}

private struct CardFile: Transferable {
    let png: Data
    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .png) { (file: CardFile) in file.png }
            .suggestedFileName("NumiAgent-second-opinion.png")
    }
}

private struct OpinionCardFace: View {
    let record: OpinionCardRecord
    let photos: [UIImage]
    let style: CardStyle
    let artwork: UIImage?
    let question: String
    let includePaid: Bool

    private var height: CGFloat {
        let legends = record.inscriptions.reduce(0) { $0 + 36 + 20 * max(1, ($1.1.count + 33) / 34) }
        return CGFloat(600 + max(0, record.factRows.count - 1) * 50 + legends +
                       (record.price == nil ? 0 : 100) + (includePaid && record.paid != nil ? 35 : 0))
    }

    var body: some View {
        ZStack {
            Color(red: 0.06, green: 0.08, blue: 0.08)
            (artwork.map { Image(uiImage: $0) } ?? Image(style.asset))
                .resizable().frame(width: 480, height: height)
            LinearGradient(colors: [.black.opacity(0.30), .black.opacity(0.10), .black.opacity(0.62)],
                           startPoint: .top, endPoint: .bottom)
            Rectangle().strokeBorder(style.accent.opacity(0.52), lineWidth: 0.7).padding(15)
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("NUMIAGENT").font(.system(size: 12, weight: .semibold)).tracking(3)
                    Spacer()
                    Text("SECOND OPINION").font(.system(size: 10, weight: .medium)).tracking(2)
                }.foregroundStyle(style.accent)
                Rectangle().fill(style.accent.opacity(0.48)).frame(height: 0.7).padding(.vertical, 16)
                Text("TENTATIVE IDENTIFICATION").font(.system(size: 10, weight: .bold)).tracking(1.7)
                    .foregroundStyle(style.accent)
                Text(verbatim: record.title).font(.system(size: 36, weight: .medium, design: .serif))
                    .lineLimit(2).minimumScaleFactor(0.63).padding(.top, 4)
                Group {
                    if record.banknote || photos.count == 1 {
                        VStack(spacing: 6) { photoViews }
                    } else {
                        HStack(spacing: 8) { photoViews }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity).padding(.vertical, 12)
                evidence
                Rectangle().fill(style.accent.opacity(0.52)).frame(height: 0.7)
                Text(verbatim: question).font(.system(size: 23, weight: .medium, design: .serif))
                    .lineLimit(2).minimumScaleFactor(0.8).padding(.top, 12)
            }.foregroundStyle(.white).padding(34)
        }
        .frame(width: 480, height: height).clipped()
        .environment(\.colorScheme, .dark).environment(\.dynamicTypeSize, .medium)
    }

    @ViewBuilder private var evidence: some View {
        if !record.inscriptions.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(record.inscriptions, id: \.0) { label, value in
                    Text(verbatim: label).font(.system(size: 10, weight: .bold)).tracking(1.6).foregroundStyle(style.accent)
                    Text(verbatim: value).font(.system(size: 19, design: .serif)).fixedSize(horizontal: false, vertical: true)
                }
            }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
                .background(.black.opacity(0.52)).overlay(alignment: .leading) { Rectangle().fill(style.accent).frame(width: 2) }
                .padding(.bottom, 12)
        }
        Grid(alignment: .topLeading, horizontalSpacing: 10, verticalSpacing: 9) {
            ForEach(Array(record.factRows.enumerated()), id: \.offset) { _, row in
                GridRow {
                    ForEach(row, id: \.0) { label, value in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(verbatim: label).font(.system(size: 9, weight: .bold)).tracking(1).foregroundStyle(style.accent)
                            Text(verbatim: value).font(.system(size: 15, weight: .medium)).lineLimit(2).minimumScaleFactor(0.78)
                        }.frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }.padding(.bottom, record.facts.isEmpty ? 0 : 12)
        if let price = record.price {
            VStack(alignment: .leading, spacing: 4) {
                Text(price.label).font(.system(size: 10, weight: .bold)).tracking(1.5)
                Text(price.amount).font(.system(size: 27, weight: .medium, design: .serif)).foregroundStyle(style.accent)
                Text(price.source).font(.system(size: 13)).lineLimit(2).minimumScaleFactor(0.8)
            }.padding(12).frame(maxWidth: .infinity, alignment: .leading).background(.black.opacity(0.62))
                .overlay { Rectangle().strokeBorder(style.accent.opacity(0.7), lineWidth: 0.8) }.padding(.bottom, 12)
        }
        if includePaid, let paid = record.paid {
            Text("Purchase price · \(paid)").font(.system(size: 15, weight: .medium)).padding(.bottom, 10)
        }
    }

    @ViewBuilder private var photoViews: some View {
        ForEach(photos.indices, id: \.self) { index in
            Image(uiImage: photos[index]).resizable().scaledToFit()
                .overlay { Rectangle().strokeBorder(style.accent.opacity(0.85), lineWidth: 0.65) }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

struct OpinionCardSheet: View {
    let record: OpinionCardRecord
    let loadPhotos: @MainActor () async throws -> [UIImage]
    @Environment(\.dismiss) private var dismiss
    @State private var photos: [UIImage] = []
    @State private var style: CardStyle
    @State private var question: String
    @State private var artwork: UIImage?
    @State private var preview: UIImage?
    @State private var error: String?
    @State private var attempt = 0
    @State private var includePaid = false

    private var cardDescription: String {
        var words = ["Tentative identification: \(record.title)", "\(photos.count) specimen photos"]
        words += (record.inscriptions + record.facts).map { $0.0 + " " + $0.1 }
        if let price = record.price { words += [price.label, price.amount, price.source] }
        if includePaid, let paid = record.paid { words.append("Purchase price " + paid) }
        return (words + [question]).joined(separator: ". ")
    }

    init(record: OpinionCardRecord, loadPhotos: @escaping @MainActor () async throws -> [UIImage]) {
        self.record = record
        self.loadPhotos = loadPhotos
        _style = State(initialValue: record.suggestedStyle)
        _question = State(initialValue: record.questions[0])
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let preview {
                        Image(uiImage: preview).resizable().scaledToFit().frame(maxWidth: 410)
                            .frame(maxWidth: .infinity).accessibilityIdentifier("opinion-card-preview")
                            .accessibilityLabel(cardDescription)
                    }
                    if let error {
                        Text(error).foregroundStyle(.secondary)
                        Button("Try again") { attempt += 1 }
                    }
                    if !photos.isEmpty {
                        Picker("Card style", selection: $style) {
                            ForEach(CardStyle.allCases) { Text($0.rawValue).tag($0) }
                        }.pickerStyle(.segmented)
                        Picker("Ask the collector", selection: $question) {
                            ForEach(record.questions, id: \.self) { Text($0).tag($0) }
                        }.pickerStyle(.menu)
                        if record.paid != nil { Toggle("Include my purchase price", isOn: $includePaid) }
                        if #available(iOS 18.1, *) {
                            PersonalizedArtworkButton(style: style, photos: photos) { image in
                                artwork = image
                                render()
                            }
                        }
                        if artwork != nil {
                            Button("Use original frame") { artwork = nil; render() }
                        }
                        Text("Share this image with a friend or coin club. Check the photos for visible serial numbers or personal details.")
                            .font(.footnote).foregroundStyle(.secondary)
                    } else if error == nil {
                        ProgressView("Preparing your photos…")
                    }
                }.frame(maxWidth: 560).padding().frame(maxWidth: .infinity)
            }
            .safeAreaInset(edge: .bottom) {
                if let preview, let data = shareData {
                    ShareLink(item: CardFile(png: data), preview: SharePreview("NumiAgent second opinion", image: Image(uiImage: preview))) {
                        Label("Share card", systemImage: "square.and.arrow.up")
                            .font(.headline).frame(maxWidth: 520).frame(minHeight: 36)
                    }.buttonStyle(.borderedProminent).padding(.horizontal).padding(.vertical, 6)
                        .frame(maxWidth: .infinity).background(.bar)
                }
            }
            .navigationTitle("Second opinion card").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
            .task(id: attempt) {
                do {
                    error = nil
                    let loaded = try await loadPhotos()
                    try Task.checkCancellation()
                    guard !loaded.isEmpty else { throw CardPhotoError.unavailable }
                    photos = loaded
                    render()
                } catch {
                    if !Task.isCancelled { self.error = error.localizedDescription }
                }
            }
            .onChange(of: style) { _, _ in artwork = nil; render() }
            .onChange(of: question) { _, _ in render() }
            .onChange(of: includePaid) { _, _ in render() }
            .onChange(of: record.price) { _, _ in if !photos.isEmpty { render() } }
        }
    }

    @State private var shareData: Data?

    @MainActor private func render() {
        let face = OpinionCardFace(record: record, photos: photos, style: style, artwork: artwork, question: question, includePaid: includePaid)
        let renderer = ImageRenderer(content: face)
        renderer.scale = 3
        renderer.isOpaque = true
        guard let image = renderer.uiImage, let png = image.pngData() else {
            preview = nil
            shareData = nil
            error = "The card could not be rendered. Please try again."
            return
        }
        error = nil
        preview = image
        shareData = png
    }
}

@available(iOS 18.1, *)
private struct PersonalizedArtworkButton: View {
    let style: CardStyle
    let photos: [UIImage]
    let apply: (UIImage) -> Void
    @Environment(\.supportsImagePlayground) private var supported
    @State private var showing = false
    @State private var reference: UIImage?
    @State private var error: String?

    var body: some View {
        if supported {
            VStack(alignment: .leading, spacing: 4) {
                Button("Generate custom frame", systemImage: "wand.and.stars") {
                    // Send only a small color study to the system editor; keep all legible specimen details local.
                    let format = UIGraphicsImageRendererFormat()
                    format.scale = 1
                    format.opaque = true
                    let size = CGSize(width: max(1, photos.count) * 4, height: 4)
                    let study = UIGraphicsImageRenderer(size: size, format: format).image { _ in
                        for (i, photo) in photos.enumerated() {
                            photo.draw(in: CGRect(x: i * 4, y: 0, width: 4, height: 4))
                        }
                    }
                    reference = UIGraphicsImageRenderer(size: CGSize(width: 256, height: 128), format: format).image { context in
                        context.cgContext.interpolationQuality = .none
                        study.draw(in: CGRect(x: 0, y: 0, width: 256, height: 128))
                    }
                    error = nil
                    showing = true
                }.buttonStyle(.bordered)
                Text("Uses colors sampled from your photos in Apple’s Image Playground.")
                    .font(.footnote).foregroundStyle(.secondary)
                if let error { Text(error).foregroundStyle(.secondary) }
            }
            .imagePlaygroundSheet(isPresented: $showing,
                concepts: [.text("\(style.artDirection) Ornamental outer corners around a dark empty center. Use the reference colors as accents. No objects or lettering.")],
                sourceImage: reference.map { Image(uiImage: $0) },
                onCompletion: { url in
                    do { apply(try CardPhotos.image(data: Data(contentsOf: url))) }
                    catch { self.error = "The generated frame could not be opened. You can try again." }
                })
        }
    }
}
