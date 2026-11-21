import Combine
import CryptoKit
import Foundation
import ImageIO
#if DEBUG
import UIKit
#endif

enum GuestSide: String, Codable, CaseIterable, Identifiable {
    case front, back
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
}

enum GuestStatus: String, Codable {
    case unidentified, confirmed
    var title: String { self == .confirmed ? "Confirmed" : "Unidentified" }
}

struct GuestOnlineJob: Codable {
    let id: String
    let key: String
    let created: Date
    let photos: [UUID]

    init(photos: [UUID], now: Date = Date()) {
        func randomPart() -> String { UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased() }
        id = "\(Int(now.timeIntervalSince1970))-\(UUID().uuidString.lowercased())"
        key = randomPart() + randomPart()
        created = now
        self.photos = photos
    }

    var expired: Bool { Date().timeIntervalSince(created) >= 19 * 60 }
}

struct GuestScanResult: Decodable {
    let state: String
    let candidates: [PhotoCandidate]

    var recognition: LocalRecognitionResult {
        let matches = candidates.prefix(3).enumerated().map { index, item in
            let evidence = [item.details?.obverseLegend, item.details?.reverseLegend,
                            item.details?.obverse, item.details?.reverse].compactMap { $0 }.filter { !$0.isEmpty }
            let reference = item.details?.referenceUrl.flatMap { URL(string: $0) }.flatMap { $0.scheme == "https" ? $0 : nil }
            return LocalSuggestion(id: "online-\(index)", type: item.type, title: item.title,
                                   issuer: item.issuer ?? "", denomination: item.denomination ?? "",
                                   year: item.year ?? "", reference: reference, evidence: evidence)
        }
        return .init(suggestions: matches, observations: [])
    }
}

struct GuestPiece: Codable, Identifiable {
    var id = UUID()
    var type = "coin"
    var title = ""
    var issuer = ""
    var denomination = ""
    var year = ""
    var notes = ""
    var serial = ""
    var purchasePrice = ""
    var purchaseCurrency = ""
    var status = GuestStatus.unidentified
    var reference: URL?
    var photos: [GuestSide: UUID] = [:]
    var recognition: LocalRecognitionResult?
    var onlineJob: GuestOnlineJob?

    var displayTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? (type == "banknote" ? "Unidentified banknote" : "Unidentified coin") : title
    }
}

struct GuestCollection: Codable, Identifiable {
    var id = UUID()
    var name = "My collection"
    var drafts: [GuestPiece] = []
    var pieces: [GuestPiece] = []
    var activeDraft: UUID?
    var restoreFingerprint: String?

    var photoIDs: Set<UUID> { Set((pieces + drafts).flatMap { $0.photos.values }) }
}

enum GuestStorageError: LocalizedError {
    case unavailable, invalidBackup, wrongKey, space, tooLarge, missingPhoto

    var errorDescription: String? {
        switch self {
        case .unavailable: return "NumiAgent couldn’t access this collection. Unlock the device or free up space and try again."
        case .invalidBackup: return "This file is damaged or uses an unsupported backup format."
        case .wrongKey: return "The recovery key is incorrect or the file is damaged."
        case .space: return "Free up some device storage and try restoring again."
        case .tooLarge: return "This file is too large to open or export on this device."
        case .missingPhoto: return "A photo could not be read. The collection has been kept."
        }
    }
}

@MainActor
final class GuestStore: ObservableObject {
    @Published private(set) var collections: [GuestCollection] = []
    @Published private(set) var activeID: UUID?
    @Published var error: String?
    private let root: URL
    private let files = FileManager.default
    private let protection: Data.WritingOptions = [.atomic, .completeFileProtection]
    private var loaded = false

    init(root: URL? = nil) {
        let appSupport = URL.applicationSupportDirectory
        #if DEBUG
        let testID = ProcessInfo.processInfo.arguments.compactMap { value -> UUID? in
            guard value.hasPrefix("--guest-test-") else { return nil }
            return UUID(uuidString: String(value.dropFirst("--guest-test-".count)))
        }.first
        let name = testID.map { "NumiAgentTest-" + $0.uuidString } ?? "NumiAgentLocal"
        #else
        let name = "NumiAgentLocal"
        #endif
        self.root = root ?? appSupport.appending(path: name, directoryHint: .isDirectory)
        reload()
        #if DEBUG
        if root == nil, testID != nil, active == nil,
           ProcessInfo.processInfo.arguments.contains("--guest-consent-fixture") {
            do {
                guard let image = UIImage(named: "DemoNickel") else { throw GuestStorageError.missingPhoto }
                let photo = try CaptureDraftStore.jpeg(image)
                try openCollection()
                let id = try draft()
                try putPhoto(photo, piece: id, side: .front)
                try putPhoto(photo, piece: id, side: .back)
                try changePiece(id) { $0.recognition = LocalRecognitionResult() }
            } catch { self.error = error.localizedDescription }
        }
        #endif
    }

    var active: GuestCollection? { collections.first { $0.id == activeID } }

    private var selection: URL { root.appending(path: "selection.json") }
    private func directory(_ id: UUID) -> URL { root.appending(path: id.uuidString, directoryHint: .isDirectory) }
    private func manifest(_ folder: URL) -> URL { folder.appending(path: "collection.json") }

    func reload() {
        guard !loaded else { return }
        do {
            try files.createDirectory(at: root, withIntermediateDirectories: true,
                                      attributes: [.protectionKey: FileProtectionType.complete])
            var protectedRoot = root
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try protectedRoot.setResourceValues(values)
            var restored: [GuestCollection] = []
            for folder in try files.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) {
                let name = folder.lastPathComponent
                if name.hasPrefix("."), UUID(uuidString: String(name.dropFirst())) != nil {
                    try? files.removeItem(at: folder)
                    continue
                }
                guard let id = UUID(uuidString: name) else { continue }
                let collection = try JSONDecoder().decode(GuestCollection.self, from: Data(contentsOf: manifest(folder)))
                guard collection.id == id else { throw GuestStorageError.unavailable }
                restored.append(collection)
                let referenced = collection.photoIDs
                if let contents = try? files.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) {
                    for image in contents where image.pathExtension == "jpg" {
                        guard let photo = UUID(uuidString: image.deletingPathExtension().lastPathComponent),
                              !referenced.contains(photo) else { continue }
                        try? files.removeItem(at: image)
                    }
                }
            }
            let chosen = (try? JSONDecoder().decode(UUID.self, from: Data(contentsOf: selection)))
            collections = restored.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            activeID = collections.first(where: { $0.id == chosen })?.id ?? collections.first?.id
            loaded = true
            error = nil
        } catch { self.error = error.localizedDescription }
    }

    func select(_ id: UUID) throws {
        try JSONEncoder().encode(id).write(to: selection, options: protection)
        activeID = id
    }

    func openCollection() throws {
        reload()
        guard loaded else { throw GuestStorageError.unavailable }
        guard active == nil else { return }
        try insert(GuestCollection(), photos: [:])
    }

    func piece(_ id: UUID) -> GuestPiece? {
        active?.drafts.first { $0.id == id } ?? active?.pieces.first { $0.id == id }
    }

    func draft() throws -> UUID {
        if let id = active?.activeDraft { return id }
        let piece = GuestPiece()
        try change { collection in
            collection.drafts.append(piece)
            collection.activeDraft = piece.id
        }
        return piece.id
    }

    func importDraft(_ data: Data) throws {
        guard let collection = active else { throw GuestStorageError.unavailable }
        let photo = UUID()
        let url = photoURL(photo, in: collection.id)
        var piece = GuestPiece()
        piece.photos[.front] = photo
        try data.write(to: url, options: protection)
        do {
            try change {
                $0.drafts.append(piece)
                if $0.activeDraft == nil { $0.activeDraft = piece.id }
            }
        } catch {
            try? files.removeItem(at: url)
            throw error
        }
    }

    func pairDraft(_ source: UUID, with target: UUID) throws {
        try change { collection in
            guard source != target,
                  let other = collection.drafts.first(where: { $0.id == source }),
                  other.photos.count == 1, other.title.isEmpty, other.notes.isEmpty,
                  other.serial.isEmpty, other.purchasePrice.isEmpty, other.purchaseCurrency.isEmpty,
                  other.issuer.isEmpty, other.denomination.isEmpty, other.year.isEmpty,
                  let photo = other.photos[.front],
                  let index = collection.drafts.firstIndex(where: { $0.id == target }),
                  collection.drafts[index].photos[.back] == nil else { throw GuestStorageError.unavailable }
            collection.drafts[index].photos[.back] = photo
            collection.drafts[index].onlineJob = nil
            collection.drafts[index].recognition = nil
            collection.drafts.removeAll { $0.id == source }
            collection.activeDraft = target
        }
    }

    func resume(_ id: UUID) throws {
        try change { collection in
            guard collection.drafts.contains(where: { $0.id == id }) else { throw GuestStorageError.unavailable }
            collection.activeDraft = id
        }
    }

    func changePiece(_ id: UUID, _ update: (inout GuestPiece) -> Void) throws {
        try change { collection in
            if let index = collection.drafts.firstIndex(where: { $0.id == id }) {
                update(&collection.drafts[index])
            } else if let index = collection.pieces.firstIndex(where: { $0.id == id }) {
                update(&collection.pieces[index])
            } else { throw GuestStorageError.unavailable }
        }
    }

    func putPhoto(_ data: Data, piece id: UUID, side: GuestSide) throws {
        guard let collection = active else { throw GuestStorageError.unavailable }
        let old = piece(id)?.photos[side]
        let photo = UUID()
        let url = photoURL(photo, in: collection.id)
        try data.write(to: url, options: protection)
        do {
            try changePiece(id) { piece in
                piece.photos[side] = photo
                piece.recognition = nil
                piece.onlineJob = nil
            }
        } catch {
            try? files.removeItem(at: url)
            throw error
        }
        if let old { removeUnreferenced([old], from: collection.id) }
    }

    func removePhoto(_ side: GuestSide, from id: UUID) throws {
        guard let collection = active, let old = piece(id)?.photos[side] else { return }
        try changePiece(id) { piece in
            piece.photos[side] = nil
            piece.recognition = nil
            piece.onlineJob = nil
        }
        removeUnreferenced([old], from: collection.id)
    }

    func swapPhotos(_ id: UUID) throws {
        try changePiece(id) { piece in
            let front = piece.photos[.front]
            piece.photos[.front] = piece.photos[.back]
            piece.photos[.back] = front
            piece.onlineJob = nil
            piece.recognition = nil
        }
    }

    func photoURL(_ photo: UUID, in collectionID: UUID? = nil) -> URL {
        directory(collectionID ?? activeID ?? UUID()).appending(path: photo.uuidString + ".jpg")
    }

    func save(_ id: UUID, status: GuestStatus) throws {
        try change { collection in
            if let index = collection.drafts.firstIndex(where: { $0.id == id }) {
                var piece = collection.drafts.remove(at: index)
                piece.status = status
                piece.onlineJob = nil
                collection.pieces.append(piece)
                collection.activeDraft = collection.drafts.last?.id
            } else if let index = collection.pieces.firstIndex(where: { $0.id == id }) {
                collection.pieces[index].status = status
                collection.pieces[index].onlineJob = nil
            } else { throw GuestStorageError.unavailable }
        }
    }

    func park(_ id: UUID) throws {
        try change { collection in
            if collection.activeDraft == id { collection.activeDraft = nil }
        }
    }

    func delete(_ id: UUID) throws {
        guard let collection = active, let piece = piece(id) else { return }
        try change {
            $0.pieces.removeAll { $0.id == id }
            $0.drafts.removeAll { $0.id == id }
            if $0.activeDraft == id { $0.activeDraft = $0.drafts.last?.id }
        }
        removeUnreferenced(Array(piece.photos.values), from: collection.id)
    }

    private func removeUnreferenced(_ ids: [UUID], from collectionID: UUID) {
        let current = collections.first { $0.id == collectionID }?.photoIDs ?? []
        for photo in ids where !current.contains(photo) { try? files.removeItem(at: photoURL(photo, in: collectionID)) }
    }

    private func change(_ update: (inout GuestCollection) throws -> Void) throws {
        guard let activeID, let index = collections.firstIndex(where: { $0.id == activeID }) else {
            throw GuestStorageError.unavailable
        }
        var collection = collections[index]
        try update(&collection)
        try JSONEncoder().encode(collection).write(to: manifest(directory(collection.id)), options: protection)
        collections[index] = collection
    }

    func snapshot() throws -> GuestArchive.Snapshot {
        guard var collection = active else { throw GuestStorageError.unavailable }
        collection.drafts = collection.drafts.map { original in
            var piece = original
            piece.onlineJob = nil
            return piece
        }
        collection.pieces = collection.pieces.map { original in
            var piece = original
            piece.onlineJob = nil
            return piece
        }
        var photos: [String: Data] = [:]
        var total = 0
        for id in collection.photoIDs {
            let url = photoURL(id, in: collection.id)
            guard let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize,
                  size > 0, size <= GuestArchive.maxPhoto else { throw GuestStorageError.missingPhoto }
            total += size
            guard total <= GuestArchive.maxFile / 2 else { throw GuestStorageError.tooLarge }
            photos[id.uuidString] = try Data(contentsOf: url)
        }
        return .init(collection: collection, photos: photos)
    }

    func restore(_ verified: GuestArchive.Restore) throws {
        reload()
        guard loaded else { throw GuestStorageError.unavailable }
        if let existing = collections.first(where: { $0.restoreFingerprint == verified.fingerprint }) {
            try select(existing.id)
            return
        }
        var collection = verified.snapshot.collection
        if !collections.isEmpty {
            collection.id = UUID()
            collection.name = "Restored · " + collection.name
        }
        collection.restoreFingerprint = verified.fingerprint
        let total = verified.snapshot.photos.values.reduce(0) { $0 + $1.count }
        let available = try root.resourceValues(forKeys: [.volumeAvailableCapacityKey]).volumeAvailableCapacity
        guard let available, available > total + 1024 * 1024 else { throw GuestStorageError.space }
        try insert(collection, photos: verified.snapshot.photos)
    }

    private func insert(_ collection: GuestCollection, photos: [String: Data]) throws {
        let staging = root.appending(path: "." + UUID().uuidString, directoryHint: .isDirectory)
        let final = directory(collection.id)
        try files.createDirectory(at: staging, withIntermediateDirectories: false,
                                  attributes: [.protectionKey: FileProtectionType.complete])
        defer { try? files.removeItem(at: staging) }
        for (id, data) in photos {
            try data.write(to: staging.appending(path: id + ".jpg"), options: protection)
        }
        try JSONEncoder().encode(collection).write(to: manifest(staging), options: protection)
        try files.moveItem(at: staging, to: final)
        collections.append(collection)
        try select(collection.id)
    }
}

enum GuestArchive {
    static let maxFile = 128 * 1024 * 1024
    static let maxPhoto = 6 * 1024 * 1024
    private static let header = Data("NUMIAGENT-1\n".utf8)

    struct Snapshot: Codable { var collection: GuestCollection; let photos: [String: Data] }
    struct Restore { let snapshot: Snapshot; let fingerprint: String }

    static func seal(_ snapshot: Snapshot) throws -> (archive: Data, recoveryKey: String) {
        let key = SymmetricKey(size: .bits256)
        let bytes = try JSONEncoder().encode(snapshot)
        guard bytes.count < maxFile - 1024 else { throw GuestStorageError.tooLarge }
        let box = try AES.GCM.seal(bytes, using: key, authenticating: header)
        guard let ciphertext = box.combined else { throw GuestStorageError.invalidBackup }
        return (header + ciphertext, key.withUnsafeBytes { Data($0).base64EncodedString() })
    }

    static func open(_ data: Data, recoveryKey: String) throws -> Restore {
        guard data.count <= maxFile else { throw GuestStorageError.tooLarge }
        guard data.starts(with: header) else { throw GuestStorageError.invalidBackup }
        let compactKey = recoveryKey.filter { !$0.isWhitespace }
        guard let bytes = Data(base64Encoded: compactKey), bytes.count == 32 else { throw GuestStorageError.wrongKey }
        let plaintext: Data
        do {
            let box = try AES.GCM.SealedBox(combined: data.dropFirst(header.count))
            plaintext = try AES.GCM.open(box, using: SymmetricKey(data: bytes), authenticating: header)
        } catch { throw GuestStorageError.wrongKey }
        var snapshot: Snapshot
        do { snapshot = try JSONDecoder().decode(Snapshot.self, from: plaintext) }
        catch { throw GuestStorageError.invalidBackup }
        let records = snapshot.collection.pieces + snapshot.collection.drafts
        guard Set(records.map(\.id)).count == records.count,
              records.allSatisfy({ record in
                  (record.type == "coin" || record.type == "banknote") &&
                    (record.reference.map { $0.scheme == "https" && $0.user == nil && $0.password == nil } ?? true)
              }),
              snapshot.collection.activeDraft.map({ active in snapshot.collection.drafts.contains { $0.id == active } }) ?? true,
              Set(snapshot.photos.keys) == Set(snapshot.collection.photoIDs.map(\.uuidString)),
              snapshot.photos.values.allSatisfy(validPhoto) else { throw GuestStorageError.invalidBackup }
        for index in snapshot.collection.drafts.indices { snapshot.collection.drafts[index].onlineJob = nil }
        for index in snapshot.collection.pieces.indices { snapshot.collection.pieces[index].onlineJob = nil }
        let fingerprint = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        return Restore(snapshot: snapshot, fingerprint: fingerprint)
    }

    private static func validPhoto(_ photo: Data) -> Bool {
        guard photo.count > 3, photo.count <= maxPhoto, photo.starts(with: [255, 216]),
              let image = CGImageSourceCreateWithData(photo as CFData, nil),
              let values = CGImageSourceCopyPropertiesAtIndex(image, 0, nil) as? [String: Any],
              values[kCGImagePropertyGPSDictionary as String] == nil,
              let width = values[kCGImagePropertyPixelWidth as String] as? Int, (1...2048).contains(width),
              let height = values[kCGImagePropertyPixelHeight as String] as? Int, (1...2048).contains(height) else { return false }
        return true
    }
}

enum GuestCSV {
    static let standard = ["Type", "Title", "Issuer", "Denomination", "Year", "Identification status"]
    static let optional = ["Notes", "Serial number", "Purchase price", "Purchase currency"]

    static func make(_ pieces: [GuestPiece], privateFields: Set<String>) -> Data {
        let indices = optional.indices.filter { privateFields.contains(optional[$0]) }
        let header = standard + indices.map { optional[$0] }
        let rows = pieces.map { piece in
            let fields = [piece.notes, piece.serial, piece.purchasePrice, piece.purchaseCurrency]
            return [piece.type, piece.displayTitle, piece.issuer, piece.denomination, piece.year, piece.status.title] +
                indices.map { fields[$0] }
        }
        let text = ([header] + rows).map { $0.map(field).joined(separator: ",") }.joined(separator: "\r\n") + "\r\n"
        return Data(("\u{FEFF}" + text).utf8)
    }

    private static func field(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let dangerous = trimmed.first.map { "=+-@".contains($0) } == true ||
            value.first.map { "\t\r\n".contains($0) } == true
        let literal = dangerous ? "'" + value : value
        return "\"" + literal.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }
}

#if DEBUG
@MainActor
func runGuestStorageAcceptance() throws {
    func verify(_ success: Bool, _ message: String) throws {
        if !success { throw RecognitionBenchmark.InputError.invalid(message) }
    }
    let temporary = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: temporary) }
    let source = GuestStore(root: temporary.appendingPathComponent("source"))
    try source.openCollection()
    let id = try source.draft()
    try source.changePiece(id) {
        $0.title = "1892 piece, \"rare\""
        $0.notes = "=HYPERLINK(\nsecret)"
        $0.serial = "ABC-12345"
        $0.purchasePrice = "10.50"
        $0.purchaseCurrency = "USD"
    }
    guard let image = UIImage(named: "DemoNickel") else { throw GuestStorageError.missingPhoto }
    guard let raster = image.cgImage else { throw GuestStorageError.missingPhoto }
    let tagged = NSMutableData()
    guard let encoder = CGImageDestinationCreateWithData(tagged, "public.jpeg" as CFString, 1, nil) else {
        throw GuestStorageError.missingPhoto
    }
    let metadata: [String: Any] = [
        kCGImagePropertyOrientation as String: 6,
        kCGImagePropertyGPSDictionary as String: [
            kCGImagePropertyGPSLatitude as String: 12.34, kCGImagePropertyGPSLongitude as String: 45.67
        ]
    ]
    CGImageDestinationAddImage(encoder, raster, metadata as CFDictionary)
    guard CGImageDestinationFinalize(encoder), let rotated = UIImage(data: tagged as Data) else {
        throw GuestStorageError.missingPhoto
    }
    let jpeg = try CaptureDraftStore.jpeg(rotated)
    if let normalized = UIImage(data: jpeg) {
        try verify(normalized.imageOrientation == .up, "Accepted photo retained EXIF orientation.")
    } else { throw GuestStorageError.missingPhoto }
    try source.putPhoto(jpeg, piece: id, side: .front)
    try source.putPhoto(jpeg, piece: id, side: .back)
    try source.save(id, status: .confirmed)
    let draft = try source.draft()
    try source.putPhoto(jpeg, piece: draft, side: .front)
    try source.changePiece(draft) { piece in
        piece.onlineJob = GuestOnlineJob(photos: Array(piece.photos.values))
    }
    let archive = try GuestArchive.seal(source.snapshot())
    let verified = try GuestArchive.open(archive.archive, recoveryKey: archive.recoveryKey)
    try verify(verified.snapshot.collection.drafts.first?.onlineJob == nil, "Backup contains an online scan credential.")
    let destination = GuestStore(root: temporary.appendingPathComponent("destination"))
    try destination.restore(verified)
    try destination.restore(verified)
    try verify(destination.collections.count == 1, "Repeated restore duplicated a collection.")
    try verify(destination.active?.drafts.first?.id == draft, "Restored draft ID changed.")
    try verify(destination.piece(id)?.serial == "ABC-12345", "Restored private data changed.")
    guard let photos = destination.piece(id)?.photos, photos.count == 2 else { throw GuestStorageError.missingPhoto }
    for photo in photos.values {
        let read = try Data(contentsOf: destination.photoURL(photo))
        try verify(read == jpeg, "Restored photo bytes changed.")
    }
    var damaged = archive.archive
    damaged[damaged.index(before: damaged.endIndex)] ^= 1
    try verify((try? GuestArchive.open(damaged, recoveryKey: archive.recoveryKey)) == nil, "Damaged backup was accepted.")
    try verify((try? GuestArchive.open(archive.archive, recoveryKey: Data(repeating: 0, count: 32).base64EncodedString())) == nil,
               "Wrong recovery key was accepted.")
    try verify(destination.active?.pieces.count == 1, "Failed restoration changed saved records.")
    let rows = destination.active?.pieces ?? []
    let standard = String(decoding: GuestCSV.make(rows, privateFields: []), as: UTF8.self)
    let privateCopy = String(decoding: GuestCSV.make(rows, privateFields: ["Notes", "Serial number"]), as: UTF8.self)
    try verify(!standard.contains("ABC-12345") && !standard.contains("secret") && !standard.contains("10.50"),
               "Default CSV exposed private fields.")
    try verify(standard.contains("\"1892 piece, \"\"rare\"\"\"") &&
               privateCopy.contains("'=HYPERLINK(") && privateCopy.contains("ABC-12345") && !privateCopy.contains("10.50"),
               "CSV escaping or per-field export failed.")
}
#endif
