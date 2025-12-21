import { db } from "./db";
import { sources, entities, coinTypes } from "@shared/schema";

async function seedMuseumData() {
  console.log("Seeding museum data...");

  // Check if data already exists
  const existingSources = await db.select().from(sources).limit(1);
  if (existingSources.length > 0) {
    console.log("Museum data already seeded");
    return;
  }

  // Seed sources (museum collections) - marked as sample data
  const museumSources = [
    {
      id: "british-museum",
      name: "British Museum",
      homepageUrl: "https://www.britishmuseum.org",
      accessMethod: "API",
      defaultLicenseMetadata: "CC_BY_NC_SA",
      defaultLicenseImages: "CC_BY_NC_SA",
      defaultActions: { embed: true, cache: true },
      attributionTemplate: "Image courtesy of the British Museum, under CC BY-NC-SA 4.0",
      isSample: true,
    },
    {
      id: "ans",
      name: "American Numismatic Society",
      homepageUrl: "https://numismatics.org",
      accessMethod: "IIIF",
      defaultLicenseMetadata: "CC_BY",
      defaultLicenseImages: "CC_BY",
      defaultActions: { embed: true, cache: true, compute: true },
      attributionTemplate: "Courtesy of the American Numismatic Society",
      isSample: true,
    },
    {
      id: "wildwinds",
      name: "Wildwinds",
      homepageUrl: "https://www.wildwinds.com",
      accessMethod: "SCRAPE",
      defaultLicenseMetadata: "UNKNOWN",
      defaultLicenseImages: "ALL_RIGHTS_RESERVED",
      defaultActions: { embed: false, cache: false },
      attributionTemplate: "Reference from Wildwinds.com",
      isSample: true,
    },
    {
      id: "coinarchives",
      name: "CoinArchives",
      homepageUrl: "https://www.coinarchives.com",
      accessMethod: "MANUAL",
      defaultLicenseMetadata: "ALL_RIGHTS_RESERVED",
      defaultLicenseImages: "ALL_RIGHTS_RESERVED",
      defaultActions: {},
      attributionTemplate: "From CoinArchives auction records",
      isSample: true,
    },
  ];

  for (const source of museumSources) {
    await db.insert(sources).values(source).onConflictDoNothing();
  }
  console.log("Seeded sources");

  // Seed entities (rulers, mints, denominations) - marked as sample data
  const seedEntities = [
    { type: "PERSON", label: "Augustus", wikidataQid: "Q1405", isSample: true },
    { type: "PERSON", label: "Nero", wikidataQid: "Q1413", isSample: true },
    { type: "PERSON", label: "Trajan", wikidataQid: "Q1425", isSample: true },
    { type: "PERSON", label: "Hadrian", wikidataQid: "Q1427", isSample: true },
    { type: "PERSON", label: "Marcus Aurelius", wikidataQid: "Q1430", isSample: true },
    { type: "PERSON", label: "Constantine I", wikidataQid: "Q8413", isSample: true },
    { type: "PERSON", label: "Alexander the Great", wikidataQid: "Q8409", isSample: true },
    { type: "PERSON", label: "Philip II of Macedon", wikidataQid: "Q41076", isSample: true },
    { type: "MINT", label: "Rome", isSample: true },
    { type: "MINT", label: "Alexandria", isSample: true },
    { type: "MINT", label: "Antioch", isSample: true },
    { type: "MINT", label: "Constantinople", isSample: true },
    { type: "MINT", label: "Lugdunum", isSample: true },
    { type: "MINT", label: "Athens", isSample: true },
    { type: "MINT", label: "Corinth", isSample: true },
    { type: "DENOMINATION", label: "Denarius", isSample: true },
    { type: "DENOMINATION", label: "Aureus", isSample: true },
    { type: "DENOMINATION", label: "Sestertius", isSample: true },
    { type: "DENOMINATION", label: "As", isSample: true },
    { type: "DENOMINATION", label: "Follis", isSample: true },
    { type: "DENOMINATION", label: "Solidus", isSample: true },
    { type: "DENOMINATION", label: "Tetradrachm", isSample: true },
    { type: "DENOMINATION", label: "Drachm", isSample: true },
    { type: "DENOMINATION", label: "Stater", isSample: true },
    { type: "METAL", label: "Gold", isSample: true },
    { type: "METAL", label: "Silver", isSample: true },
    { type: "METAL", label: "Bronze", isSample: true },
    { type: "METAL", label: "Copper", isSample: true },
    { type: "METAL", label: "Electrum", isSample: true },
  ];

  for (const entity of seedEntities) {
    await db.insert(entities).values(entity).onConflictDoNothing();
  }
  console.log("Seeded entities");

  // Seed coin types (reference coins from museums) - marked as sample data
  const seedCoinTypes = [
    {
      sourceId: "british-museum",
      label: "Augustus Denarius - Capricorn reverse",
      dateFrom: -27,
      dateTo: 14,
      obvLegend: "CAESAR AVGVSTVS",
      revLegend: "CAPRICORN",
      referenceText: "RIC I 126",
      isSample: true,
    },
    {
      sourceId: "british-museum",
      label: "Nero Sestertius - Roma seated",
      dateFrom: 54,
      dateTo: 68,
      obvLegend: "NERO CLAVD CAESAR AVG GER",
      revLegend: "ROMA S C",
      referenceText: "RIC I 273",
      isSample: true,
    },
    {
      sourceId: "ans",
      label: "Trajan Denarius - Optimus Princeps",
      dateFrom: 98,
      dateTo: 117,
      obvLegend: "IMP TRAIANO AVG GER DAC P M TR P",
      revLegend: "COS V P P S P Q R OPTIMO PRINC",
      referenceText: "RIC II 147",
      isSample: true,
    },
    {
      sourceId: "ans",
      label: "Hadrian Denarius - Travel series",
      dateFrom: 117,
      dateTo: 138,
      obvLegend: "HADRIANVS AVG COS III P P",
      revLegend: "AEGYPTOS",
      referenceText: "RIC II 297",
      isSample: true,
    },
    {
      sourceId: "british-museum",
      label: "Marcus Aurelius Aureus",
      dateFrom: 161,
      dateTo: 180,
      obvLegend: "M AVREL ANTONINVS AVG",
      revLegend: "PROVIDENTIA DEORVM",
      referenceText: "RIC III 456",
      isSample: true,
    },
    {
      sourceId: "ans",
      label: "Constantine I Follis - Sol Invictus",
      dateFrom: 306,
      dateTo: 337,
      obvLegend: "CONSTANTINVS P F AVG",
      revLegend: "SOLI INVICTO COMITI",
      referenceText: "RIC VII 51",
      isSample: true,
    },
    {
      sourceId: "british-museum",
      label: "Alexander III Tetradrachm - Zeus seated",
      dateFrom: -336,
      dateTo: -323,
      obvLegend: "Head of Herakles",
      revLegend: "ALEXANDROY Zeus seated",
      referenceText: "Price 3998",
      isSample: true,
    },
    {
      sourceId: "ans",
      label: "Philip II Gold Stater - Apollo",
      dateFrom: -359,
      dateTo: -336,
      obvLegend: "Head of Apollo",
      revLegend: "FILIPPOY Charioteer",
      referenceText: "Le Rider 145",
      isSample: true,
    },
    {
      sourceId: "wildwinds",
      label: "Athens Silver Tetradrachm - Owl",
      dateFrom: -454,
      dateTo: -404,
      obvLegend: "Head of Athena",
      revLegend: "AOE Owl",
      referenceText: "Svoronos 23.1",
      isSample: true,
    },
    {
      sourceId: "coinarchives",
      label: "Byzantine Solidus - Justinian I",
      dateFrom: 527,
      dateTo: 565,
      obvLegend: "DN IVSTINIANVS PP AVG",
      revLegend: "VICTORIA AVGGG",
      referenceText: "Sear 140",
      isSample: true,
    },
  ];

  for (const coinType of seedCoinTypes) {
    await db.insert(coinTypes).values(coinType).onConflictDoNothing();
  }
  console.log("Seeded coin types");

  console.log("Museum data seeded successfully!");
}

seedMuseumData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
