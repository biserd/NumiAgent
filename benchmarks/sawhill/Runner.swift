import CoreML
import Foundation
import ImageIO
import Vision

private struct Specimen: Decodable {
    let id, split: String
    let query, gallery: [String]
}

private struct Manifest: Decodable {
    let rows: [Specimen]
}

private struct Prediction: Encodable {
    let query, method: String
    let id: String?
    let distance, margin: Double

    enum CodingKeys: String, CodingKey {
        case query, method, id, distance, margin
    }

    func encode(to encoder: Encoder) throws {
        var box = encoder.container(keyedBy: CodingKeys.self)
        try box.encode(query, forKey: .query)
        try box.encode(method, forKey: .method)
        try box.encode(id, forKey: .id)
        try box.encode(distance, forKey: .distance)
        try box.encode(margin, forKey: .margin)
    }
}

private struct Report: Encodable {
    let runtime: [String: String]
    let predictions: [Prediction]
}

private struct Photo {
    let apple: VNFeaturePrintObservation
    let dino: [Float]
    let words: Set<String>
}

private enum BenchmarkError: Error {
    case wrongArguments, invalidImage, missingEmbedding, emptyGallery
}

@main
private enum SawhillRunner {
    static func main() throws {
        let args = CommandLine.arguments
        guard args.count == 4 else { throw BenchmarkError.wrongArguments }
        let fixture = URL(fileURLWithPath: args[1], isDirectory: true)
        let manifest = try JSONDecoder().decode(Manifest.self,
            from: Data(contentsOf: fixture.appendingPathComponent("manifest.json")))
        let config = MLModelConfiguration()
        config.computeUnits = .all
        let model = try VNCoreMLModel(for: MLModel(contentsOf: URL(fileURLWithPath: args[2]), configuration: config))
        var descriptors: [String: [Photo]] = [:]
        for row in manifest.rows where !row.gallery.isEmpty {
            descriptors[row.id] = try row.gallery.map { try describe(fixture.appendingPathComponent($0), model: model) }
        }
        var predictions: [Prediction] = []
        for (index, row) in manifest.rows.enumerated() {
            let query = try row.query.map { try describe(fixture.appendingPathComponent($0), model: model) }
            let members = manifest.rows.filter { $0.split == row.split && !$0.gallery.isEmpty }
            guard members.count >= 2 else { throw BenchmarkError.emptyGallery }
            var apple: [(String, Double)] = []
            var dino: [(String, Double)] = []
            var ocr: [(String, Double)] = []
            for member in members {
                guard let gallery = descriptors[member.id] else { throw BenchmarkError.emptyGallery }
                apple.append((member.id, try pairDistance(query, gallery, using: appleDistance)))
                dino.append((member.id, pairDistance(query, gallery, using: dinoDistance)))
                ocr.append((member.id, pairDistance(query, gallery, using: textDistance)))
            }
            predictions.append(rank(query: row.id, method: "apple", scores: apple))
            predictions.append(rank(query: row.id, method: "dino", scores: dino))
            predictions.append(rank(query: row.id, method: "ocr", scores: ocr))
            if (index + 1) % 25 == 0 { print("Scored \(index + 1) of \(manifest.rows.count) accessions.") }
        }
        let result = Report(runtime: ["os": ProcessInfo.processInfo.operatingSystemVersionString,
                                      "vision_feature_print_revision": "2",
                                      "dino_coreml_compute_units": "all"],
                            predictions: predictions)
        try JSONEncoder().encode(result).write(to: URL(fileURLWithPath: args[3]))
    }

    static func describe(_ url: URL, model: VNCoreMLModel) throws -> Photo {
        try autoreleasepool {
            let bytes = try Data(contentsOf: url)
            guard let source = CGImageSourceCreateWithData(bytes as CFData, nil),
                  let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
                  image.width == 224, image.height == 224 else { throw BenchmarkError.invalidImage }
            let apple = VNGenerateImageFeaturePrintRequest()
            apple.revision = VNGenerateImageFeaturePrintRequestRevision2
            let dino = VNCoreMLRequest(model: model)
            dino.imageCropAndScaleOption = .scaleFill
            try VNImageRequestHandler(cgImage: image, options: [:]).perform([apple, dino])
            guard let print = apple.results?.first,
                  let vector = (dino.results?.first as? VNCoreMLFeatureValueObservation)?.featureValue.multiArrayValue else {
                throw BenchmarkError.missingEmbedding
            }
            let values = (0..<vector.count).map { vector[$0].floatValue }
            let length = sqrt(values.reduce(Float.zero) { $0 + $1 * $1 })
            guard length > 0 else { throw BenchmarkError.missingEmbedding }
            let text = try LocalRecognition.read([bytes]).joined(separator: " ")
            let words = Set(LocalRecognition.normalized(text).split(separator: " ").filter { $0.count > 1 }.map(String.init))
            return Photo(apple: print, dino: values.map { $0 / length }, words: words)
        }
    }

    static func pairDistance(_ first: [Photo], _ second: [Photo], using distance: (Photo, Photo) throws -> Double) rethrows -> Double {
        let aligned = try distance(first[0], second[0]) + distance(first[1], second[1])
        let swapped = try distance(first[0], second[1]) + distance(first[1], second[0])
        return min(aligned, swapped) / 2
    }

    static func appleDistance(_ first: Photo, _ second: Photo) throws -> Double {
        var value: Float = 0
        try first.apple.computeDistance(&value, to: second.apple)
        return Double(value)
    }

    static func dinoDistance(_ first: Photo, _ second: Photo) -> Double {
        1 - Double(zip(first.dino, second.dino).reduce(Float.zero) { $0 + $1.0 * $1.1 })
    }

    static func textDistance(_ first: Photo, _ second: Photo) -> Double {
        let words = first.words.union(second.words).count
        guard words > 0 else { return 1 }
        return 1 - Double(first.words.intersection(second.words).count) / Double(words)
    }

    static func rank(query: String, method: String, scores: [(String, Double)]) -> Prediction {
        let ordered = scores.sorted { $0.1 == $1.1 ? $0.0 < $1.0 : $0.1 < $1.1 }
        let best = ordered[0]
        return Prediction(query: query, method: method, id: method == "ocr" && best.1 == 1 ? nil : best.0,
                          distance: best.1, margin: ordered[1].1 - best.1)
    }
}
