import Foundation

@main
struct Check {
    enum Failure: Error { case wrongReading(String) }

    static func expect(_ condition: Bool, _ name: String) throws {
        if !condition { throw Failure.wrongReading(name) }
    }

    static func main() throws {
        let coin = PhotoTextReading.read(["UNITED STATES OF AMERICA", "ONE DIME", "1965"])
        try expect(coin.issuer == "UNITED STATES OF AMERICA" && coin.denomination == "ONE DIME" && coin.year == "1965",
                   "coin fields without a catalog")
        let note = PhotoTextReading.read(["BANGLADESH BANK", "ONE THOUSAND TAKA", "1000", "AB20191234"])
        try expect(note.issuer == "BANGLADESH BANK" && note.denomination == "ONE THOUSAND TAKA" && note.year == nil,
                   "banknote fields without interpreting its amount as a date")
        let dated = PhotoTextReading.read(["Banco de México", "50 PESOS", "Año: 2000"])
        try expect(dated.issuer == "Banco de México" && dated.denomination == "50 PESOS" && dated.year == "2000",
                   "explicit labeled year")
        let ambiguous = PhotoTextReading.read(["10 DOLLARS", "100 DOLLARS", "1965", "1966"])
        try expect(!ambiguous.hasDetails, "conflicting text stays unresolved")

        let legacy = Data(#"{"suggestions":[],"likely":false,"observations":["CANADA","FIVE CENTS","2007"]}"#.utf8)
        let result = try JSONDecoder().decode(LocalRecognitionResult.self, from: legacy)
        try expect(result.textReading.issuer == "CANADA" && result.photoReading == nil, "older draft compatibility")

        for path in CommandLine.arguments.dropFirst() {
            let result = try LocalRecognition.bundledResult(for: [URL(fileURLWithPath: path)])
            try expect(result.photoReading != nil && result.suggestions.isEmpty, "catalog-free Vision scan")
            let reading = try JSONEncoder().encode(result.textReading)
            print("\(URL(fileURLWithPath: path).lastPathComponent): \(String(decoding: reading, as: UTF8.self))")
        }
        print("Standalone catalog-free text checks passed")
    }
}
