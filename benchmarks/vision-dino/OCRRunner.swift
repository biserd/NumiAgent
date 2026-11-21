import CryptoKit
import Foundation
import Vision

@main
struct OCRRunner {
    struct Specimen: Decodable {
        let specimen_id: String
        let split: String
        let photos: [String]
    }

    struct Observation: Encodable {
        let specimen_id: String
        let split: String
        let line_count: Int
        let text_evidence: [String: Int]
        let ocr_suggestions: [String]
    }

    struct Report: Encodable {
        let os: String
        let revision: Int
        let catalog_sha256: String
        let manifest_sha256: String
        let photo_sha256: [String: String]
        let observations: [Observation]
    }

    enum InputError: Error { case expectedSuiteAndOutput }

    static func digest(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    static func main() throws {
        let arguments = CommandLine.arguments
        guard arguments.count == 3 else { throw InputError.expectedSuiteAndOutput }
        let suite = URL(fileURLWithPath: arguments[1], isDirectory: true)
        let catalogURL = suite.appendingPathComponent("catalog.json")
        let manifest = try Data(contentsOf: suite.appendingPathComponent("manifest.json"))
        let references = try LocalRecognition.catalog(at: catalogURL)
        let specimens = try JSONDecoder().decode([Specimen].self, from: manifest)
        var photoHashes: [String: String] = [:]
        var observations: [Observation] = []

        for specimen in specimens where specimen.split != "reference" {
            let observation = try autoreleasepool {
                let photos = try specimen.photos.map { path in
                    let data = try Data(contentsOf: suite.appendingPathComponent(path))
                    photoHashes[path] = digest(data)
                    return data
                }
                let lines = try LocalRecognition.read(photos)
                let evidence = Dictionary(uniqueKeysWithValues: references.map {
                    ($0.id, LocalRecognition.evidence($0, lines: lines).count)
                })
                let suggestions = LocalRecognition.result(lines: lines, references: references).suggestions
                return Observation(specimen_id: specimen.specimen_id, split: specimen.split,
                                   line_count: lines.count, text_evidence: evidence,
                                   ocr_suggestions: suggestions.map(\.id))
            }
            observations.append(observation)
            if observations.count.isMultiple(of: 25) {
                print("Read \(observations.count) specimens with Apple Vision")
            }
        }
        let report = Report(os: ProcessInfo.processInfo.operatingSystemVersionString,
                            revision: VNRecognizeTextRequest().revision,
                            catalog_sha256: digest(try Data(contentsOf: catalogURL)),
                            manifest_sha256: digest(manifest), photo_sha256: photoHashes,
                            observations: observations)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(report).write(to: URL(fileURLWithPath: arguments[2]), options: .atomic)
    }
}
