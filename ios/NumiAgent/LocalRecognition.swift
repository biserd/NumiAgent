import Foundation
import ImageIO
import Vision

struct LocalReference: Codable, Identifiable, Sendable {
    let id, type, title, issuer, denomination, year: String
    let issuerWords, denominationWords: [String]
    let variantWords: [String]?
    let source: URL
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
        pattern: #"(?<![\p{L}\p{N}.,])((?:[0-9]{1,6}(?:[.,][0-9]{1,2})?|(?:(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and)[ -]){0,5}(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand))\s+(?:dollars?|dimes?|cents?|centavos?|centimes?|euros?|pesos?|pence|penn(?:y|ies)|pounds?|francs?|rupees?|riyals?|dirhams?|dinars?|taka|yen|yuan|won|rubl(?:es?|os?)|lei|złot(?:y|ych)|forints?|kron(?:a|e|er|or)))\b"#,
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
            lines.append(contentsOf: full)
            if full.count < 3 {
                request.regionOfInterest = CGRect(x: 0.12, y: 0.12, width: 0.76, height: 0.76)
                try handler.perform([request])
                lines.append(contentsOf: strongLines().filter { !full.contains($0) })
            }
        }
        return lines
    }

    static func normalized(_ value: String) -> String {
        value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }.joined(separator: " ")
    }

    static func bundledResult(for urls: [URL]) throws -> LocalRecognitionResult {
        let photos = try urls.map { try Data(contentsOf: $0) }
        let lines = try read(photos, detectLanguages: true)
        let references = try Bundle.main.url(forResource: "LocalCatalog", withExtension: "json")
            .flatMap { try? catalog(at: $0) } ?? []
        var scan = result(lines: lines, references: references)
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
