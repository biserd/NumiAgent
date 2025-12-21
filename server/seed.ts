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

  // Seed sources (museum collections)
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
    },
  ];

  for (const source of museumSources) {
    await db.insert(sources).values(source).onConflictDoNothing();
  }
  console.log("Seeded sources");

  // Seed entities (rulers, mints, denominations)
  const seedEntities = [
    { type: "PERSON", label: "Augustus", wikidataQid: "Q1405" },
    { type: "PERSON", label: "Nero", wikidataQid: "Q1413" },
    { type: "PERSON", label: "Trajan", wikidataQid: "Q1425" },
    { type: "PERSON", label: "Hadrian", wikidataQid: "Q1427" },
    { type: "PERSON", label: "Marcus Aurelius", wikidataQid: "Q1430" },
    { type: "PERSON", label: "Constantine I", wikidataQid: "Q8413" },
    { type: "PERSON", label: "Alexander the Great", wikidataQid: "Q8409" },
    { type: "PERSON", label: "Philip II of Macedon", wikidataQid: "Q41076" },
    { type: "MINT", label: "Rome" },
    { type: "MINT", label: "Alexandria" },
    { type: "MINT", label: "Antioch" },
    { type: "MINT", label: "Constantinople" },
    { type: "MINT", label: "Lugdunum" },
    { type: "MINT", label: "Athens" },
    { type: "MINT", label: "Corinth" },
    { type: "DENOMINATION", label: "Denarius" },
    { type: "DENOMINATION", label: "Aureus" },
    { type: "DENOMINATION", label: "Sestertius" },
    { type: "DENOMINATION", label: "As" },
    { type: "DENOMINATION", label: "Follis" },
    { type: "DENOMINATION", label: "Solidus" },
    { type: "DENOMINATION", label: "Tetradrachm" },
    { type: "DENOMINATION", label: "Drachm" },
    { type: "DENOMINATION", label: "Stater" },
    { type: "METAL", label: "Gold" },
    { type: "METAL", label: "Silver" },
    { type: "METAL", label: "Bronze" },
    { type: "METAL", label: "Copper" },
    { type: "METAL", label: "Electrum" },
  ];

  for (const entity of seedEntities) {
    await db.insert(entities).values(entity).onConflictDoNothing();
  }
  console.log("Seeded entities");

  // Seed coin types (reference coins from museums)
  const seedCoinTypes = [
    {
      sourceId: "british-museum",
      label: "Augustus Denarius - Capricorn reverse",
      dateFrom: -27,
      dateTo: 14,
      obvLegend: "CAESAR AVGVSTVS",
      revLegend: "CAPRICORN",
      referenceText: "RIC I 126",
    },
    {
      sourceId: "british-museum",
      label: "Nero Sestertius - Roma seated",
      dateFrom: 54,
      dateTo: 68,
      obvLegend: "NERO CLAVD CAESAR AVG GER",
      revLegend: "ROMA S C",
      referenceText: "RIC I 273",
    },
    {
      sourceId: "ans",
      label: "Trajan Denarius - Optimus Princeps",
      dateFrom: 98,
      dateTo: 117,
      obvLegend: "IMP TRAIANO AVG GER DAC P M TR P",
      revLegend: "COS V P P S P Q R OPTIMO PRINC",
      referenceText: "RIC II 147",
    },
    {
      sourceId: "ans",
      label: "Hadrian Denarius - Travel series",
      dateFrom: 117,
      dateTo: 138,
      obvLegend: "HADRIANVS AVG COS III P P",
      revLegend: "AEGYPTOS",
      referenceText: "RIC II 297",
    },
    {
      sourceId: "british-museum",
      label: "Marcus Aurelius Aureus",
      dateFrom: 161,
      dateTo: 180,
      obvLegend: "M AVREL ANTONINVS AVG",
      revLegend: "PROVIDENTIA DEORVM",
      referenceText: "RIC III 456",
    },
    {
      sourceId: "ans",
      label: "Constantine I Follis - Sol Invictus",
      dateFrom: 306,
      dateTo: 337,
      obvLegend: "CONSTANTINVS P F AVG",
      revLegend: "SOLI INVICTO COMITI",
      referenceText: "RIC VII 51",
    },
    {
      sourceId: "british-museum",
      label: "Alexander III Tetradrachm - Zeus seated",
      dateFrom: -336,
      dateTo: -323,
      obvLegend: "Head of Herakles",
      revLegend: "ALEXANDROY Zeus seated",
      referenceText: "Price 3998",
    },
    {
      sourceId: "ans",
      label: "Philip II Gold Stater - Apollo",
      dateFrom: -359,
      dateTo: -336,
      obvLegend: "Head of Apollo",
      revLegend: "FILIPPOY Charioteer",
      referenceText: "Le Rider 145",
    },
    {
      sourceId: "wildwinds",
      label: "Athens Silver Tetradrachm - Owl",
      dateFrom: -454,
      dateTo: -404,
      obvLegend: "Head of Athena",
      revLegend: "AOE Owl",
      referenceText: "Svoronos 23.1",
    },
    {
      sourceId: "coinarchives",
      label: "Byzantine Solidus - Justinian I",
      dateFrom: 527,
      dateTo: 565,
      obvLegend: "DN IVSTINIANVS PP AVG",
      revLegend: "VICTORIA AVGGG",
      referenceText: "Sear 140",
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
