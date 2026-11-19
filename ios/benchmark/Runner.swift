import Foundation

@main
struct Runner {
    static func main() throws {
        let arguments = CommandLine.arguments
        guard arguments.count == 4 else {
            throw RecognitionBenchmark.InputError.invalid("Usage: recognition-runner SUITE MODEL REPORT.json")
        }
        let result = try RecognitionBenchmark.run(in: URL(fileURLWithPath: arguments[1]), model: arguments[2])
        let data = try JSONEncoder().encode(result)
        try data.write(to: URL(fileURLWithPath: arguments[3]), options: .atomic)
    }
}
