import Foundation
import ImageIO
import Vision

struct LocalReference: Codable, Identifiable, Sendable {
    let id, type, title, issuer, denomination, year: String
    let issuerWords, denominationWords: [String]
    let variantWords: [String]?
    let source: URL
    var catalogScope: String? = nil
    var requiredWords: [String]? = nil
    var obverseLegend: String? = nil
    var reverseLegend: String? = nil
    var searchDetails: String? = nil
}

struct LocalSuggestion: Codable, Identifiable, Sendable {
    var id: String
    var type, title, issuer, denomination, year: String
    var reference: URL?
    var evidence: [String]
}

struct LocalRecognitionResult: Codable, Sendable {
    var suggestions: [LocalSuggestion] = []
    var likely = false
    var observations: [String] = []
    var photoReading: PhotoTextReading? = nil

    var textReading: PhotoTextReading { photoReading ?? PhotoTextReading.read(observations) }
}

struct PhotoTextReading: Codable, Sendable {
    var issuer: String?
    var denomination: String?
    var year: String?

    var hasDetails: Bool { issuer != nil || denomination != nil || year != nil }

    static func read(_ lines: [String]) -> Self {
        let text = lines.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        let issuer = unique(text.compactMap(issuingName))
        let denomination = unique(text.flatMap { captures(in: $0, using: denominationPattern) })
        let lastYear = Calendar(identifier: .gregorian).component(.year, from: Date())
        let years = text.compactMap { line -> String? in
            guard let year = captures(in: line, using: yearPattern).first,
                  let number = Int(year), number <= lastYear else { return nil }
            // A bare round number on a note often denotes its value.
            return line.hasPrefix(year) && year.hasSuffix("00") ? nil : year
        }
        return Self(issuer: issuer, denomination: denomination, year: unique(years))
    }

    private static let denominationPattern = try? NSRegularExpression(
        pattern: #"(?<![\p{L}\p{N}.,])((?:[0-9]{1,6}(?:[.,][0-9]{1,2})?|(?:(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and)[ -]){0,5}(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand))[\s-]+(?:dollars?|dimes?|cents?|centavos?|centimes?|euros?|pesos?|pence|penn(?:y|ies)|pounds?|francs?|rupees?|riyals?|dirhams?|dinars?|taka|yen|yuan|won|rubl(?:es?|os?)|lei|złot(?:y|ych)|forints?|kron(?:a|e|er|or)))\b"#,
        options: .caseInsensitive
    )
    private static let yearPattern = try? NSRegularExpression(
        pattern: #"^(?:(?:series(?:\s+of)?|year|dated|année|año|ano|jahr)\s*[:.]?\s*)?((?:1[5-9]|20)[0-9]{2})(?:\s*[A-Z])?$"#,
        options: .caseInsensitive
    )
    private static let issuerPattern = try? NSRegularExpression(
        pattern: #"^((?:central\s+bank\s+of|bank\s+of|federal\s+reserve\s+bank\s+of|(?:people.s\s+)?republic\s+of|banque\s+(?:de|du|des)|banco\s+(?:central\s+)?(?:de|del|do|da))\s+[\p{L}\p{M}.’' -]{2,55})$"#,
        options: .caseInsensitive
    )

    private static let regionNames: Set<String> = {
        let locales = ["en", "fr", "es", "pt", "de", "zh_Hant", "zh_Hans"].map(Locale.init(identifier:))
        let names = locales.flatMap { locale in
            Locale.Region.isoRegions.compactMap { locale.localizedString(forRegionCode: $0.identifier) }
        }
        return Set((names + ["United States of America", "HKSAR"]).map(LocalRecognition.normalized))
    }()

    private static func issuingName(_ text: String) -> String? {
        let name = LocalRecognition.normalized(text)
        if regionNames.contains(name) { return text }
        if name.hasSuffix(" bank"), regionNames.contains(String(name.dropLast(5))) { return text }
        return captures(in: text, using: issuerPattern).first
    }

    private static func captures(in text: String, using pattern: NSRegularExpression?) -> [String] {
        let search = NSRange(text.startIndex..<text.endIndex, in: text)
        return (pattern?.matches(in: text, range: search) ?? []).compactMap { match in
            Range(match.range(at: 1), in: text).map { String(text[$0]) }
        }
    }

    private static func unique(_ values: [String]) -> String? {
        guard let first = values.first else { return nil }
        let key = LocalRecognition.normalized(first)
        return values.allSatisfy { LocalRecognition.normalized($0) == key } ? first : nil
    }
}

enum LocalRecognition {
    static func catalog(at url: URL) throws -> [LocalReference] {
        try JSONDecoder().decode([LocalReference].self, from: Data(contentsOf: url))
    }

    static func read(_ photos: [Data], detectLanguages: Bool = false) throws -> [String] {
        var lines: [String] = []
        for photo in photos {
            var photoLines: [String] = []
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = false
            request.automaticallyDetectsLanguage = detectLanguages
            let languages = (try? request.supportedRecognitionLanguages()) ?? []
            request.recognitionLanguages = ["en-US", "fr-FR", "zh-Hant"].filter(languages.contains)
            let source = CGImageSourceCreateWithData(photo as CFData, nil)
            let properties = source.flatMap { CGImageSourceCopyPropertiesAtIndex($0, 0, nil) as? [String: Any] }
            let orientation = (properties?[kCGImagePropertyOrientation as String] as? UInt32)
                .flatMap(CGImagePropertyOrientation.init(rawValue:)) ?? .up
            let handler = VNImageRequestHandler(data: photo, orientation: orientation, options: [:])
            try handler.perform([request])
            func strongLines() -> [String] {
                (request.results ?? []).compactMap { observation in
                    guard let text = observation.topCandidates(1).first, text.confidence >= 0.3 else { return nil }
                    return text.string
                }
            }
            let full = strongLines()
            photoLines.append(contentsOf: full)
            if full.count < 3 {
                request.regionOfInterest = CGRect(x: 0.12, y: 0.12, width: 0.76, height: 0.76)
                try handler.perform([request])
                photoLines.append(contentsOf: strongLines().filter { !full.contains($0) })
            }
            if detectLanguages {
                let reading = PhotoTextReading.read(photoLines)
                if reading.denomination == nil || reading.issuer == nil {
                    let fallback = (try? layoutText(photo)) ?? []
                    photoLines.append(contentsOf: fallback.filter { !photoLines.contains($0) })
                }
            }
            lines.append(contentsOf: photoLines)
        }
        return lines
    }

    private static func layoutText(_ data: Data) throws -> [String] {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 1280
              ] as CFDictionary) else { return [] }
        let wide = Double(image.width) / Double(image.height)
        let layouts: [CGImage]
        if (0.82...1.22).contains(wide) {
            layouts = circularLegends(image)
        } else {
            // A tighter frame increases the size of small printed details for Vision.
            let crop = CGRect(x: image.width / 6, y: image.height / 5,
                              width: image.width * 4 / 6, height: image.height * 3 / 5)
            let header = CGRect(x: image.width / 8, y: 0, width: image.width * 3 / 4, height: image.height * 2 / 5)
            layouts = [image.cropping(to: crop), image.cropping(to: header), image].compactMap { $0 }
        }
        return try layouts.flatMap { variant -> [String] in
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            request.automaticallyDetectsLanguage = true
            request.minimumTextHeight = 0.012
            try VNImageRequestHandler(cgImage: variant, options: [:]).perform([request])
            return (request.results ?? []).compactMap { observation in
                guard let text = observation.topCandidates(1).first, text.confidence >= 0.4 else { return nil }
                return text.string
            }
        }
    }

    private static func circularLegends(_ image: CGImage) -> [CGImage] {
        let width = image.width, height = image.height
        let space = CGColorSpaceCreateDeviceGray()
        var source = [UInt8](repeating: 0, count: width * height)
        let drew = source.withUnsafeMutableBytes { bytes -> Bool in
            guard let context = CGContext(data: bytes.baseAddress, width: width, height: height,
                                          bitsPerComponent: 8, bytesPerRow: width, space: space,
                                          bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard drew else { return [] }
        let radius = Double(min(width, height)) * 0.47
        let outWidth = 640, outHeight = 160
        return [false, true].compactMap { bottom in
            var strip = [UInt8](repeating: 255, count: outWidth * outHeight)
            for x in 0..<outWidth {
                let angle = (148 - 116 * Double(x) / Double(outWidth - 1)) * Double.pi / 180
                let dx = cos(angle), dy = sin(angle) * (bottom ? 1 : -1)
                for y in 0..<outHeight {
                    let t = Double(y) / Double(outHeight - 1)
                    let distance = radius * (bottom ? 0.44 + 0.56 * t : 1 - 0.56 * t)
                    let px = Int(Double(width) * 0.5 + distance * dx)
                    let py = Int(Double(height) * 0.5 + distance * dy)
                    strip[y * outWidth + x] = source[py * width + px]
                }
            }
            guard let provider = CGDataProvider(data: Data(strip) as CFData) else { return nil }
            return CGImage(width: outWidth, height: outHeight, bitsPerComponent: 8, bitsPerPixel: 8,
                           bytesPerRow: outWidth, space: space, bitmapInfo: [], provider: provider,
                           decode: nil, shouldInterpolate: false, intent: .defaultIntent)
        }
    }

    static func normalized(_ value: String) -> String {
        value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }.joined(separator: " ")
    }

    static func bundledResult(for urls: [URL]) throws -> LocalRecognitionResult {
        let photos = try urls.map { try Data(contentsOf: $0) }
        let lines = try read(photos, detectLanguages: true)
        var scan = OfflineCatalog.shared.identify(lines)
        scan.photoReading = PhotoTextReading.read(lines)
        return scan
    }

    static func evidence(_ reference: LocalReference, lines: [String]) -> [String] {
        let words = " " + normalized(lines.joined(separator: " ")) + " "
        func containsAny(_ choices: [String]) -> Bool {
            choices.contains { !$0.isEmpty && words.contains(" " + normalized($0) + " ") }
        }
        var supported: [String] = []
        if containsAny(reference.issuerWords) { supported.append("Issuer") }
        if containsAny(reference.denominationWords) { supported.append("Denomination") }
        if containsAny([reference.year]) { supported.append("Year") }
        if let variants = reference.variantWords, containsAny(variants) { supported.append("Series or design") }
        return supported
    }

    static func result(lines: [String], references: [LocalReference]) -> LocalRecognitionResult {
        var ranked: [(reference: LocalReference, observed: [String])] = []
        for reference in references {
            let observed = evidence(reference, lines: lines)
            if observed.count >= 2 && (observed.contains("Issuer") || observed.contains("Series or design")) {
                ranked.append((reference, observed))
            }
        }
        ranked.sort { left, right in
            if left.observed.count == right.observed.count { return left.reference.id < right.reference.id }
            return left.observed.count > right.observed.count
        }
        let suggestions: [LocalSuggestion] = ranked.prefix(3).map { row in
            let entry = row.reference
            return LocalSuggestion(id: entry.id, type: entry.type, title: entry.title,
                                   issuer: entry.issuer, denomination: entry.denomination, year: entry.year,
                                   reference: entry.source, evidence: row.observed)
        }
        let strongest = ranked.first?.observed ?? []
        let likely = strongest.contains("Issuer") && strongest.contains("Denomination") && strongest.contains("Year") &&
            strongest.count > (ranked.dropFirst().first?.observed.count ?? 0)
        return LocalRecognitionResult(suggestions: suggestions, likely: likely, observations: Array(lines.prefix(12)))
    }
}

struct OfflineCatalog: Sendable {
    static let shared = OfflineCatalog(bundle: .main)
    static let packNames = ["ModernMoney", "AncientCoins", "HistoricBanknotes"]

    private struct Entry: Sendable {
        let reference: LocalReference
        let searchText: String
    }

    private let searchEntries: [Entry]
    private let ordinary: [LocalReference]
    private let inscriptions: [String: [LocalReference]]
    let packCounts: [String: Int]

    init(bundle: Bundle) {
        let legacy = bundle.url(forResource: "LocalCatalog", withExtension: "json")
            .flatMap { try? LocalRecognition.catalog(at: $0) } ?? []
        let packs = Dictionary(uniqueKeysWithValues: Self.packNames.map { name in
            let rows = bundle.url(forResource: name, withExtension: "json", subdirectory: "OfflineCatalog")
                .flatMap { try? LocalRecognition.catalog(at: $0) } ?? []
            return (name, rows)
        })
        packCounts = packs.mapValues(\.count)
        let all = legacy + Self.packNames.flatMap { packs[$0] ?? [] }
        ordinary = all.filter { $0.catalogScope != "ancient" }
        searchEntries = all.map { record in
            let details = [record.title, record.issuer, record.denomination, record.year,
                           record.searchDetails ?? "", record.obverseLegend ?? "", record.reverseLegend ?? ""]
            return Entry(reference: record, searchText: LocalRecognition.normalized(details.joined(separator: " ")))
        }
        var index: [String: [LocalReference]] = [:]
        for record in packs["AncientCoins"] ?? [] {
            let keys = Set([record.obverseLegend, record.reverseLegend].compactMap { $0 }.map(Self.legendKey))
            for key in keys where key.count >= 6 { index[key, default: []].append(record) }
        }
        inscriptions = index
    }

    static func legendKey(_ text: String) -> String {
        LocalRecognition.normalized(text).filter { !$0.isWhitespace }
    }

    func search(_ query: String) -> [LocalSuggestion] {
        let normalized = LocalRecognition.normalized(query)
        let terms = normalized.split(separator: " ")
        guard normalized.count >= 2, !terms.isEmpty else { return [] }
        return searchEntries.lazy.filter { entry in
            terms.allSatisfy { entry.searchText.contains($0) }
        }.prefix(40).map { suggestion($0.reference, evidence: []) }
    }

    func identify(_ lines: [String]) -> LocalRecognitionResult {
        let normalizedLines = lines.map(LocalRecognition.normalized).filter { !$0.isEmpty }
        let words = normalizedLines.map { " " + $0 + " " }
        let compactLines = Set(normalizedLines.map(Self.legendKey))
        func contains(_ choices: [String]) -> Bool {
            choices.contains { phrase in
                let value = LocalRecognition.normalized(phrase)
                guard !value.isEmpty else { return false }
                if words.contains(where: { $0.contains(" " + value + " ") }) { return true }
                let compact = Self.legendKey(value)
                return compact.count >= 10 && (compactLines.contains(compact) || compactLines.contains("the" + compact))
            }
        }
        let paperClue = contains(["federal reserve note", "bank of canada", "banque du canada", "silver certificate",
                                  "this certifies that there has been deposited in the treasury of"])

        struct Candidate {
            let record: LocalReference
            let evidence: [String]
            let score: Int
            let precise: Bool
        }
        let candidates = ordinary.compactMap { record -> Candidate? in
            guard !paperClue || record.type == "banknote" else { return nil }
            let scope = record.catalogScope
            let issuer = contains(record.issuerWords)
            let value = contains(record.denominationWords)
            let design = contains(record.variantWords ?? [])
            let year = !record.year.isEmpty && contains([record.year])
            let required = record.requiredWords.map(contains) ?? true
            guard required, value, issuer || design else { return nil }
            guard scope != nil || year, scope != "series" || year || design else { return nil }
            let labels = [(issuer, "Issuer"), (value, "Denomination"), (design, "Series or design"), (year, "Year")]
                .compactMap { $0.0 ? $0.1 : nil }
            let precise = scope == nil && issuer && year
            // A visible date or series clue distinguishes an issue from its general family.
            let score = (precise ? 20 : 0) + (year ? 8 : 0) + (design ? 4 : 0) + (issuer ? 2 : 0)
                + (record.requiredWords != nil ? 1 : 0)
            return Candidate(record: record, evidence: labels, score: score, precise: precise)
        }
        let bestScore = candidates.map(\.score).max()
        let best = candidates.filter { $0.score == bestScore }
        let transcript = Array(lines.prefix(12))
        if !best.isEmpty {
            let groups = Dictionary(grouping: best) { familyKey($0.record) }
            guard groups.count <= 3 else { return .init(observations: transcript) }
            let choices = groups.values.map { group in
                let first = group[0]
                if group.count == 1, first.record.catalogScope != "historical" {
                    return suggestion(first.record, evidence: first.evidence)
                }
                return family(first.record, evidence: first.evidence)
            }.sorted { $0.title < $1.title }
            return .init(suggestions: choices, likely: best.count == 1 && best[0].precise, observations: transcript)
        }

        let legends = Set(normalizedLines.map(Self.legendKey))
        var ancient: [String: (reference: LocalReference, evidence: Set<String>)] = [:]
        for key in legends {
            for row in inscriptions[key] ?? [] {
                if ancient[row.id] == nil { ancient[row.id] = (row, []) }
                ancient[row.id]?.evidence.insert(key)
            }
        }
        let paired = ancient.values.filter { $0.evidence.count >= 2 }
        if paired.count == 1, let match = paired.first {
            return .init(suggestions: [suggestion(match.reference, evidence: ["Matching legends on both sides"])],
                         observations: transcript)
        }
        let possible = paired.isEmpty ? Array(ancient.values) : paired
        let groups = Dictionary(grouping: possible) { familyKey($0.reference) }
        if groups.count == 1, let row = possible.first?.reference, !row.issuer.isEmpty, !row.denomination.isEmpty {
            return .init(suggestions: [family(row, evidence: ["Matching inscription"])], observations: transcript)
        }
        return .init(observations: transcript)
    }

    private func familyKey(_ record: LocalReference) -> String {
        [record.type, record.issuer, record.denomination].map(LocalRecognition.normalized).joined(separator: ":")
    }

    private func family(_ record: LocalReference, evidence: [String]) -> LocalSuggestion {
        let title = [record.issuer, record.denomination].filter { !$0.isEmpty }.joined(separator: " · ")
        return .init(id: "family-" + familyKey(record), type: record.type, title: title, issuer: record.issuer,
                     denomination: record.denomination, year: "", reference: nil, evidence: evidence)
    }

    private func suggestion(_ record: LocalReference, evidence: [String]) -> LocalSuggestion {
        .init(id: record.id, type: record.type, title: record.title, issuer: record.issuer,
              denomination: record.denomination, year: record.year, reference: record.source, evidence: evidence)
    }
}
