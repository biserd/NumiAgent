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
}

enum LocalRecognition {
    static func catalog(at url: URL) throws -> [LocalReference] {
        try JSONDecoder().decode([LocalReference].self, from: Data(contentsOf: url))
    }

    static func read(_ photos: [Data]) throws -> [String] {
        var lines: [String] = []
        for photo in photos {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = false
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
        let references = try Bundle.main.url(forResource: "LocalCatalog", withExtension: "json")
            .map(catalog(at:)) ?? []
        return result(lines: try read(photos), references: references)
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
