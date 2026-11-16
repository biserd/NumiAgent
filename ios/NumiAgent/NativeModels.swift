import Foundation

struct APIIdentifier: Decodable { let id: String }

struct CollectionFolder: Decodable, Identifiable {
    let id: String
    let name: String
}

struct PhotoCrop: Codable {
    var x = 0.0
    var y = 0.0
    var width = 1.0
    var height = 1.0
}

struct PhotoLink: Codable, Identifiable {
    let photoId: String
    var side: String
    var crop: PhotoCrop?
    var id: String { photoId + side }
}

struct ItemDraft: Encodable {
    var type = "coin"
    var title = ""
    var ruler = ""
    var issuer = ""
    var denomination = ""
    var year = ""
    var reference = ""
    var grade = ""
    var notes = ""
    var tags = ""
    var collection_id: String?
    var details = Specimen.Details()
    var photos: [PhotoLink]?

    init() {}

    init(photos: [PhotoLink]) {
        self.photos = photos
    }

    init(item: Specimen) {
        type = item.type
        title = item.title
        ruler = item.ruler
        issuer = item.issuer
        denomination = item.denomination
        year = item.year
        reference = item.reference
        grade = item.grade
        notes = item.notes
        tags = item.tags ?? ""
        collection_id = item.collection_id
        details = item.details ?? .init()
        photos = item.photos
    }
}

struct ImportSummary: Decodable, Identifiable {
    let id: String
    let label: String
    let created: TimeInterval
    let total: Int
    let pending: Int?
    let suggestions: Int?
    let manual: Int?
    let failed: Int?
    let saved: Int?
    let cancelled: Int?
    let paired: Int?
    let expected_photos: Int?

    var isProcessing: Bool { cancelled != 1 && (pending ?? 0) > 0 }
    var isWaiting: Bool {
        guard cancelled != 1, let expected_photos else { return false }
        return total == 0 || (paired != 1 && total < expected_photos)
    }
    var reviewCount: Int { (suggestions ?? 0) + (manual ?? 0) + (failed ?? 0) }
    var requiresAttention: Bool { !isWaiting && reviewCount > 0 }
    var status: String {
        if isWaiting { return "Waiting for photos" }
        if isProcessing { return "Identification in progress" }
        if requiresAttention { return reviewCount == 1 ? "1 item needs review" : "\(reviewCount) items need review" }
        if let saved, saved > 0 { return "\(saved) added to your collection" }
        return cancelled == 1 ? "Analysis canceled" : "Open photo review"
    }

    var statusIcon: String {
        if isWaiting { return "arrow.up.circle" }
        if isProcessing { return "clock" }
        if requiresAttention { return "exclamationmark.circle" }
        return (saved ?? 0) > 0 ? "checkmark.circle" : "photo"
    }
}

struct PhotoImport: Decodable {
    let label: String
    let cancelled: Int
    let analyze: Int
    let photos: [ImportedPhoto]
    var paired: Int? = nil
    var expected_photos: Int? = nil

    var subjects: [ImportedPhoto] { paired == 1 ? photos.filter { $0.side == "obverse" } : photos }
    var awaitingPhotos: Bool {
        guard cancelled == 0, let expected = expected_photos ?? (paired == 1 ? 2 : nil) else { return false }
        return photos.filter { $0.state != "uploading" }.count < expected ||
            (!subjects.isEmpty && subjects.allSatisfy { $0.state == "manual" && $0.error == nil })
    }

    static let demoAutomatic = PhotoImport(label: "Example photo batch", cancelled: 0, analyze: 1, photos: [
        .init(id: "demo-photo-1", state: "saved", candidates: [], error: nil,
              record: .init(id: "demo-3", title: "Bank of Canada one-dollar note", type: "banknote",
                            year: "1935", issuer: "Bank of Canada", denomination: "1 dollar")),
        .init(id: "demo-photo-2", state: "review", candidates: [
            .init(type: "coin", title: "Jefferson nickel", ruler: nil, issuer: "United States",
                  denomination: "5 cents", year: nil, reference: nil, notes: nil, details: nil, confidence: 0.6, crop: nil)
        ], error: nil, record: nil)
    ])
}

struct ImportedRecord: Decodable {
    let id, title, type, year, issuer, denomination: String

    var subtitle: String {
        [type.capitalized, year, denomination, issuer].filter { !$0.isBlank }.joined(separator: " · ")
    }
}

struct ImportedPhoto: Decodable, Identifiable {
    let id: String
    let state: String
    let candidates: [PhotoCandidate]
    let error: String?
    let record: ImportedRecord?
    var side: String? = nil

    var isPending: Bool { ["queued", "running", "uploading"].contains(state) }
    var canCatalog: Bool { ["review", "manual", "failed"].contains(state) }
    var statusLabel: String {
        switch state {
        case "queued": return "Waiting for AI"
        case "running": return "Analyzing photo"
        case "uploading": return "Uploading"
        case "review": return candidates.isEmpty ? "No identification found" : "Needs review"
        case "manual": return "Awaiting identification"
        case "failed": return "Identification couldn’t finish"
        case "saved": return record == nil ? "Cataloged previously" : "In your collection"
        case "cancelled": return "Canceled"
        default: return state.capitalized
        }
    }
}

struct PhotoCandidate: Decodable {
    let type, title: String
    let ruler, issuer, denomination, year, reference, notes: String?
    let details: Specimen.Details?
    let confidence: Double
    let crop: PhotoCrop?
    var catalogMatches: [CoinCatalogMatch]? = nil
    var catalogMatchCount: Int? = nil
    var catalogEvidence: String? = nil

    var hasOpenRomanVariant: Bool {
        issuer == "Roman Empire" && (reference ?? "").isBlank && ruler?.isBlank == false && denomination?.isBlank == false
    }

    func draft(using record: CoinCatalogMatch? = nil, updating item: Specimen? = nil) -> ItemDraft {
        var draft = item.map { ItemDraft(item: $0) } ?? ItemDraft()
        draft.type = type
        draft.title = title
        draft.ruler = ruler.flatMap { $0.isBlank ? nil : $0 } ?? draft.ruler
        draft.issuer = issuer.flatMap { $0.isBlank ? nil : $0 } ?? draft.issuer
        draft.denomination = denomination.flatMap { $0.isBlank ? nil : $0 } ?? draft.denomination
        draft.year = year.flatMap { $0.isBlank ? nil : $0 } ?? draft.year
        if let record {
            draft.reference = record.id
            draft.details.referenceUrl = record.source.absoluteString
        } else if let reference, !reference.isBlank {
            draft.reference = reference
            draft.details.referenceUrl = details?.referenceUrl
        }
        if draft.notes.isBlank { draft.notes = notes ?? "" }
        if let details {
            func observed(_ value: String?, or existing: String?) -> String? {
                guard let value, !value.isBlank else { return existing }
                return value
            }
            draft.details.metal = observed(details.metal, or: draft.details.metal)
            draft.details.mint = observed(details.mint, or: draft.details.mint)
            draft.details.mintMark = observed(details.mintMark, or: draft.details.mintMark)
            draft.details.variant = observed(details.variant, or: draft.details.variant)
            draft.details.series = observed(details.series, or: draft.details.series)
            draft.details.serial = observed(details.serial, or: draft.details.serial)
            draft.details.signatures = observed(details.signatures, or: draft.details.signatures)
            draft.details.inscriptions = observed(details.inscriptions, or: draft.details.inscriptions)
            draft.details.obverse = observed(details.obverse, or: draft.details.obverse)
            draft.details.reverse = observed(details.reverse, or: draft.details.reverse)
            draft.details.obverseLegend = observed(details.obverseLegend, or: draft.details.obverseLegend)
            draft.details.reverseLegend = observed(details.reverseLegend, or: draft.details.reverseLegend)
            if let from = details.dateFrom, let to = details.dateTo {
                draft.details.dateFrom = from
                draft.details.dateTo = to
            }
        }
        return draft
    }
}

func isRomanImperialCoin(type: String, issuer: String, title: String) -> Bool {
    type == "coin" && (issuer + " " + title).range(
        of: #"\b(?:roman (?:empire|imperial|silver|bronze|gold)|ancient rome)\b"#,
        options: [.regularExpression, .caseInsensitive]
    ) != nil
}

struct CoinCatalogMatch: Decodable, Identifiable {
    struct Side: Decodable {
        let legend, description: String?
    }

    let id, label, attribution: String
    let source: URL
    let obverse, reverse: Side
}

struct ChecklistRule: Codable, Identifiable {
    var id = UUID()
    var label = ""
    var ruler, reference, issuer, denomination, year, metal, series: String?
    var type, source: String?
    var aliases, denominationAliases: [String]?
    var dateFrom, dateTo: Int?

    private enum CodingKeys: String, CodingKey {
        case label, ruler, reference, issuer, denomination, year, metal, series, type, source
        case aliases, denominationAliases, dateFrom, dateTo
    }

    var isValid: Bool {
        !label.isBlank && ([ruler, reference, issuer, denomination, year, type, metal, series]
            .contains(where: { $0?.isBlank == false }) || dateFrom != nil || dateTo != nil)
    }
}

struct ChecklistDraft: Codable {
    var name: String
    var slots: [ChecklistRule]
}

struct AccountUsage: Decodable {
    struct Meter: Decodable, Identifiable {
        let action: String
        let limit: Int
        let used: Int
        var id: String { action }
    }
    let resetsAt: String
    let meters: [Meter]
}

struct AccountDevice: Decodable, Identifiable {
    let id: String
    let created, expires: TimeInterval
    let current: Int
}

extension String {
    var isBlank: Bool { trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
}
