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
}

struct PhotoImport: Decodable {
    let label: String
    let cancelled: Int
    let analyze: Int
    let photos: [ImportedPhoto]

    static let demoAutomatic = PhotoImport(label: "Example photo batch", cancelled: 0, analyze: 1, photos: [
        .init(id: "demo-photo-1", state: "saved", candidates: [], error: nil,
              record: .init(id: "demo-3", title: "Bank of Canada one-dollar note", type: "banknote",
                            year: "1935", issuer: "Bank of Canada", denomination: "1 dollar")),
        .init(id: "demo-photo-2", state: "review", candidates: [
            .init(type: "coin", title: "Roman bronze coin", ruler: nil, issuer: "Roman Empire",
                  denomination: nil, year: nil, reference: nil, notes: nil, details: nil, confidence: 0.6, crop: nil)
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

    func draft() -> ItemDraft {
        var draft = ItemDraft()
        draft.type = type
        draft.title = title
        draft.ruler = ruler ?? ""
        draft.issuer = issuer ?? ""
        draft.denomination = denomination ?? ""
        draft.year = year ?? ""
        draft.reference = reference ?? ""
        draft.notes = notes ?? ""
        draft.details = details ?? .init()
        return draft
    }
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
