#if DEBUG || os(macOS)
import CoreML
import CoreVideo
import CryptoKit
import Foundation
import ImageIO
import Darwin

enum RecognitionBenchmark {
    struct SpecimenInput: Codable {
        let specimen_id, category, split, catalog_id, condition, license: String
        let similar_group: String?
        let truth_fields: [String: String]?
        let photos: [String]
    }

    struct Rank: Codable {
        let id: String
        let score: Double
        var textEvidence: Int? = nil
        var imageSimilarity: Double? = nil
    }
    struct Prediction: Codable {
        let specimen_id, category, split, catalog_id: String
        let ranked: [Rank]
        let truth_fields, first_fields: [String: String]
        let confidence: Double
        let duration_ms: Double
    }

    struct Report: Codable {
        let model, device, os: String
        let suite_sha256: String
        let predictions: [Prediction]
        let reference_count: Int
        let model_bytes, reference_bytes, baseline_catalog_bytes: Int
        let peak_resident_bytes: Int64
        let batch_20_ms, piece_p95_ms: [Double]
    }

    private struct ReferenceIndex: Codable {
        let fingerprint: String
        let embeddings: [String: [Float]]
    }

    enum InputError: LocalizedError {
        case invalid(String)
        var errorDescription: String? { switch self { case .invalid(let detail): return detail } }
    }

    static func run(in directory: URL, model modelName: String) throws -> Report {
        let referencesURL = directory.appendingPathComponent("catalog.json")
        let references = try LocalRecognition.catalog(at: referencesURL)
        let manifest = try Data(contentsOf: directory.appendingPathComponent("manifest.json"))
        let specimens = try JSONDecoder().decode([SpecimenInput].self, from: manifest)
        let knownIDs = Set(references.map(\.id))
        guard !references.isEmpty, knownIDs.count == references.count,
              Set(specimens.map(\.specimen_id)).count == specimens.count,
              ["reference", "calibration", "test"].allSatisfy({ split in specimens.contains { $0.split == split } }) else {
            throw InputError.invalid("The manifest needs unique specimens and all three splits.")
        }
        let categories = Dictionary(uniqueKeysWithValues: references.map { ($0.id, $0.type) })
        let entries = Dictionary(uniqueKeysWithValues: references.map { ($0.id, $0) })
        var suiteFingerprint = SHA256()
        suiteFingerprint.update(data: manifest)
        suiteFingerprint.update(data: try Data(contentsOf: referencesURL))
        var seenPhotos: [SHA256.Digest: String] = [:]
        for specimen in specimens {
            guard ["coin","banknote"].contains(specimen.category),
                  ["reference","calibration","test"].contains(specimen.split),
                  specimen.catalog_id.isEmpty ? specimen.split != "reference" : categories[specimen.catalog_id] == specimen.category,
                  !specimen.specimen_id.isEmpty, !specimen.condition.isEmpty, !specimen.license.isEmpty,
                  (1...2).contains(specimen.photos.count) else {
                throw InputError.invalid("Invalid manifest entry for \(specimen.specimen_id).")
            }
            for photo in try files(specimen, in: directory) {
                let fingerprint = SHA256.hash(data: try Data(contentsOf: photo))
                if let existing = seenPhotos[fingerprint], existing != specimen.specimen_id {
                    throw InputError.invalid("The same photo is assigned to more than one physical specimen.")
                }
                seenPhotos[fingerprint] = specimen.specimen_id
                suiteFingerprint.update(data: Data(fingerprint))
            }
        }
        let referenceRows = specimens.filter { $0.split == "reference" }
        guard Set(referenceRows.map(\.catalog_id)) == knownIDs else {
            throw InputError.invalid("Every catalog entry needs a separate reference specimen for every comparison.")
        }
        let modelURL = directory.appendingPathComponent(modelName + ".mlmodelc", isDirectory: true)
        let config = MLModelConfiguration()
        config.computeUnits = .all
        let model = modelName == "ocr" ? nil : try MLModel(contentsOf: modelURL, configuration: config)
        let cacheURL = directory.appendingPathComponent(modelName + "-references.json")
        var embeddings: [String: [Float]] = [:]
        if let model {
            var digest = SHA256()
            digest.update(data: manifest)
            digest.update(data: try Data(contentsOf: referencesURL))
            for specimen in referenceRows {
                for photo in try files(specimen, in: directory) { digest.update(data: try Data(contentsOf: photo)) }
            }
            for file in modelFiles(modelURL) { digest.update(data: try Data(contentsOf: file, options: .mappedIfSafe)) }
            let hash = digest.finalize().map { String(format: "%02x", $0) }.joined()
            if let bytes = try? Data(contentsOf: cacheURL),
               let cached = try? JSONDecoder().decode(ReferenceIndex.self, from: bytes), cached.fingerprint == hash {
                embeddings = cached.embeddings
            } else {
                var byType: [String: [[Float]]] = [:]
                for specimen in referenceRows {
                    let views = try files(specimen, in: directory)
                    byType[specimen.catalog_id, default: []].append(try embed(views, model: model))
                }
                embeddings = byType.mapValues(mean)
                try JSONEncoder().encode(ReferenceIndex(fingerprint: hash, embeddings: embeddings))
                    .write(to: cacheURL, options: .atomic)
            }
        }

        func infer(_ specimen: SpecimenInput) throws -> Prediction {
            let start = CFAbsoluteTimeGetCurrent()
            let views = try files(specimen, in: directory)
            let lines = try LocalRecognition.read(views.map { try Data(contentsOf: $0) })
            let local = LocalRecognition.result(lines: lines, references: references)
            let ranked: [Rank]
            if let model {
                let query = try embed(views, model: model)
                ranked = references.map { entry in
                    let text = LocalRecognition.evidence(entry, lines: lines).count
                    let visual = embeddings[entry.id].map { Double(dot(query, $0)) } ?? 0
                    return Rank(id: entry.id, score: Double(text) + 2 * visual,
                                textEvidence: text, imageSimilarity: visual)
                }.sorted { $0.score == $1.score ? $0.id < $1.id : $0.score > $1.score }
            } else {
                ranked = local.suggestions.map { Rank(id: $0.id, score: Double($0.evidence.count)) }
            }
            let confidence = ranked.first.map { first in
                first.score + max(0, first.score - (ranked.dropFirst().first?.score ?? first.score))
            } ?? -100
            let firstFields = ranked.first.flatMap { entries[$0.id] }.map(fields) ?? [:]
            let truth = specimen.truth_fields ?? entries[specimen.catalog_id].map(fields) ?? [:]
            return Prediction(specimen_id: specimen.specimen_id, category: specimen.category, split: specimen.split,
                              catalog_id: specimen.catalog_id, ranked: Array(ranked.prefix(5)),
                              truth_fields: truth, first_fields: firstFields, confidence: confidence,
                              duration_ms: (CFAbsoluteTimeGetCurrent() - start) * 1000)
        }

        let calibration = try specimens.filter { $0.split == "calibration" }.map(infer)
        let test = specimens.filter { $0.split == "test" }
        var measured: [Prediction] = []
        var batches: [Double] = []
        var p95: [Double] = []
        for offset in stride(from: 0, to: test.count, by: 20) {
            let batch = test[offset..<min(test.count, offset + 20)]
            let start = CFAbsoluteTimeGetCurrent()
            let predictions = try batch.map(infer)
            measured.append(contentsOf: predictions)
            if batch.count == 20 {
                batches.append((CFAbsoluteTimeGetCurrent() - start) * 1000)
                p95.append(predictions.map(\.duration_ms).sorted()[18])
            }
        }
        var resource = rusage()
        _ = getrusage(RUSAGE_SELF, &resource)
        let device = hardware()
        let suiteHash = suiteFingerprint.finalize().map { String(format: "%02x", $0) }.joined()
        return Report(model: modelName, device: device, os: ProcessInfo.processInfo.operatingSystemVersionString, suite_sha256: suiteHash,
                      predictions: calibration + measured, reference_count: references.count,
                      model_bytes: model == nil ? 0 : modelFiles(modelURL).map(size).reduce(0, +),
                      reference_bytes: model == nil ? 0 : size(cacheURL), baseline_catalog_bytes: size(referencesURL),
                      peak_resident_bytes: Int64(resource.ru_maxrss), batch_20_ms: batches, piece_p95_ms: p95)
    }

    private static func fields(_ reference: LocalReference) -> [String: String] {
        ["issuer": reference.issuer, "denomination": reference.denomination, "year": reference.year]
    }

    private static func files(_ specimen: SpecimenInput, in root: URL) throws -> [URL] {
        let resolved = root.resolvingSymlinksInPath().standardizedFileURL.path + "/"
        return try specimen.photos.map { path in
            let file = root.appendingPathComponent(path).resolvingSymlinksInPath().standardizedFileURL
            guard file.path.hasPrefix(resolved), FileManager.default.fileExists(atPath: file.path) else {
                throw InputError.invalid("Photo is missing or outside the suite: \(path)")
            }
            return file
        }
    }

    private static func hardware() -> String {
        var system = utsname()
        uname(&system)
        return withUnsafeBytes(of: &system.machine) { bytes in
            String(decoding: bytes.prefix { $0 != 0 }, as: UTF8.self)
        }
    }

    private static func modelFiles(_ root: URL) -> [URL] {
        let enumerated = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey])
        return (enumerated?.allObjects as? [URL] ?? []).filter {
            (try? $0.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true
        }.sorted { $0.path < $1.path }
    }

    private static func size(_ url: URL) -> Int {
        (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
    }

    private static func embed(_ images: [URL], model: MLModel) throws -> [Float] {
        let vectors = try images.map { image in
            try autoreleasepool {
                let pixel = try pixels(image)
                let input = try MLDictionaryFeatureProvider(dictionary: ["image": MLFeatureValue(pixelBuffer: pixel)])
                guard let features = try model.prediction(from: input).featureValue(for: "embedding")?.multiArrayValue else {
                    throw InputError.invalid("Expected an embedding multi-array from the converted model.")
                }
                return normalize((0..<features.count).map { features[$0].floatValue })
            }
        }
        return mean(vectors)
    }

    private static func pixels(_ url: URL) throws -> CVPixelBuffer {
        let side = 224
        let options = [kCGImageSourceCreateThumbnailFromImageAlways as String: true,
                       kCGImageSourceCreateThumbnailWithTransform as String: true,
                       kCGImageSourceThumbnailMaxPixelSize as String: side] as [String: Any]
        var buffer: CVPixelBuffer?
        CVPixelBufferCreate(kCFAllocatorDefault, side, side, kCVPixelFormatType_32BGRA, nil, &buffer)
        guard let buffer, let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            throw InputError.invalid("Cannot decode photo \(url.lastPathComponent).")
        }
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        let bitmap = CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
        guard let context = CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: side, height: side,
                                      bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
                                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: bitmap) else {
            throw InputError.invalid("Cannot prepare the image tensor.")
        }
        context.setFillColor(red: 0.5, green: 0.5, blue: 0.5, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: side, height: side))
        let inset = CGRect(x: (side - image.width) / 2, y: (side - image.height) / 2,
                           width: image.width, height: image.height)
        context.draw(image, in: inset)
        return buffer
    }

    private static func dot(_ left: [Float], _ right: [Float]) -> Float {
        zip(left, right).reduce(0) { $0 + $1.0 * $1.1 }
    }

    private static func normalize(_ vector: [Float]) -> [Float] {
        let length = max(0.000001, sqrt(dot(vector, vector)))
        return vector.map { $0 / length }
    }

    private static func mean(_ vectors: [[Float]]) -> [Float] {
        guard let first = vectors.first else { return [] }
        return normalize(vectors.dropFirst().reduce(first) { total, next in zip(total, next).map { $0.0 + $0.1 } })
    }
}
#endif

#if DEBUG && os(iOS)
import SwiftUI

struct DeviceRecognitionBenchmark: View {
    let model: String
    @State private var status = "Measuring recognition"

    static var modelArgument: String? {
        let args = ProcessInfo.processInfo.arguments
        guard let index = args.firstIndex(of: "--recognition-benchmark"), args.indices.contains(index + 1),
              ["ocr", "mobilenet-v3-small", "dinov2-small", "dinov2-base"].contains(args[index + 1]) else { return nil }
        return args[index + 1]
    }

    var body: some View {
        Text(status)
            .task {
                do {
                    let reportURL = try await Task.detached(priority: .userInitiated) { [model] in
                        let data = URL.documentsDirectory.appendingPathComponent("NumiBenchmark", isDirectory: true)
                        let report = try RecognitionBenchmark.run(in: data, model: model)
                        let file = data.appendingPathComponent(model + "-report.json")
                        try JSONEncoder().encode(report).write(to: file, options: .atomic)
                        return file
                    }.value
                    status = "Saved " + reportURL.lastPathComponent
                } catch {
                    status = error.localizedDescription
                }
            }
    }
}
#endif
