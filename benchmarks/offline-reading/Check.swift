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

        let catalog = OfflineCatalog.shared
        try expect(catalog.packCounts == ["AncientCoins": 21512, "ModernMoney": 125, "HistoricBanknotes": 58],
                   "all three packs loaded from app resources")
        let modern = catalog.identify(["UNITED STATES OF AMERICA", "ONE DIME", "1965"])
        try expect(modern.suggestions.first?.id == "us-coin-dime" && !modern.likely,
                   "a readable American dime returns a family")
        let canadian = catalog.identify(["BANK OF CANADA", "ONE DOLLAR", "1937"])
        try expect(canadian.suggestions.first?.id == "ca-1937-one-dollar" && canadian.likely,
                   "the existing issue match works with the expanded catalog")
        let generic = catalog.identify(["BANK OF CANADA", "ONE DOLLAR"])
        try expect(generic.suggestions.first?.id == "ca-note-1" && !generic.likely,
                   "undated currency returns a banknote family")
        let ancient = catalog.identify(["C PIV ESV TETRICVS CAES", "SPES AVGG"])
        try expect(ancient.suggestions.first?.id == "ocre-ric.5.tet_i.270",
                   "two distinct ancient legends find the indexed type")
        try expect(catalog.identify(["SPES AVGG"]).suggestions.isEmpty,
                   "a common ancient legend alone leaves attribution unresolved")
        try expect(catalog.search("Tetricus 270").contains { $0.id == "ocre-ric.5.tet_i.270" },
                   "manual ancient type lookup")
        try expect(catalog.search("1923 silver certificate").contains { $0.id == "historic-us-sc-237" },
                   "manual historic banknote lookup")
        let historic = catalog.identify(["UNITED STATES OF AMERICA", "SILVER CERTIFICATE", "ONE SILVER DOLLAR", "1923"])
        try expect(historic.suggestions.first?.type == "banknote" && historic.suggestions.first?.denomination == "1 dollar",
                   "a printed silver certificate denomination matches the historic banknote catalog")
        try expect(catalog.identify(["2020", "NO VISIBLE DENOMINATION"]).suggestions.isEmpty,
                   "an isolated year leaves the issue unresolved")
        try expect(catalog.identify(["THE UNITED STATES OFAMERICA", "ONE DOLLAR",
                                     "THIS CERTIFIES THAT THERE HAS BEEN DEPOSITED IN THE TREASURY OF"])
            .suggestions.allSatisfy { $0.type == "banknote" }, "a note inscription excludes a coin suggestion")

        let paths = Array(CommandLine.arguments.dropFirst())
        try expect(paths.count == 2, "supply a nickel photo and a historic note photo")
        let nickel = try LocalRecognition.bundledResult(for: [URL(fileURLWithPath: paths[0])])
        try expect(nickel.suggestions.contains { $0.id == "us-coin-nickel" }, "photo-to-catalog match for the nickel")
        print("Coin photo: \(nickel.suggestions.map(\.title))")
        let scannedBanknote = try LocalRecognition.bundledResult(for: [URL(fileURLWithPath: paths[1])])
        let reading = scannedBanknote.textReading.denomination ?? ""
        try FileHandle.standardError.write(contentsOf: Data("Banknote photo: \(reading); Vision text: \(scannedBanknote.observations)\n".utf8))
        try expect(LocalRecognition.normalized(reading) == "five dollars", "printed denomination from the banknote photo")
        let knownNote = catalog.search("confederate 5 1861 35").first { $0.id == "historic-csa-35" }
        try expect(knownNote?.type == "banknote" && knownNote?.denomination == "5 dollars",
                   "manual lookup can finish an ornate note with a readable denomination")
        print("Banknote lookup: \(knownNote?.title ?? "unresolved")")
        print("All three packs passed offline catalog checks: \(catalog.packCounts)")
    }
}
