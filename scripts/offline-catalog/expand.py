"""Build the additional read-only SQLite catalog from reviewed public sources."""

import argparse
import csv
import hashlib
import json
import re
import sqlite3
import unicodedata
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit


OCRE_BLOB = "c1bf1c15bb4208405181d3bd8c0d68ef0aed273c"
OCRE_SOURCE = "https://github.com/neelsmith/nomisma/blob/b6a6a5141dc998350b8acbf2983322dbca6680d4/cex/ocre-2019-12-04.cex"
NMAH_SOURCE = "https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/nmah/"
MINT = "https://www.usmint.gov/learn/coins-and-medals/circulating-coins/quarter/"
STATES = MINT + "50-state-quarters"
TERRITORIES = "https://kids.usmint.gov/resources/coloring-pages/50-state-and-territories"
PARKS = MINT + "america-the-beautiful-quarters"
WOMEN = MINT + "american-women-quarters"

# Issue years and design names from the U.S. Mint’s individual program lists.
STATE_ISSUES = (
    "Delaware|Pennsylvania|New Jersey|Georgia|Connecticut",
    "Massachusetts|Maryland|South Carolina|New Hampshire|Virginia",
    "New York|North Carolina|Rhode Island|Vermont|Kentucky",
    "Tennessee|Ohio|Louisiana|Indiana|Mississippi",
    "Illinois|Alabama|Maine|Missouri|Arkansas",
    "Michigan|Florida|Texas|Iowa|Wisconsin",
    "California|Minnesota|Oregon|Kansas|West Virginia",
    "Nevada|Nebraska|Colorado|North Dakota|South Dakota",
    "Montana|Washington|Idaho|Wyoming|Utah",
    "Oklahoma|New Mexico|Arizona|Alaska|Hawaii",
)
TERRITORY_ISSUES = ("District of Columbia|Puerto Rico|Guam|American Samoa|U.S. Virgin Islands|Northern Mariana Islands",)
PARK_ISSUES = (
    "Hot Springs|Yellowstone|Yosemite|Grand Canyon|Mount Hood",
    "Gettysburg|Glacier|Olympic|Vicksburg|Chickasaw",
    "El Yunque|Chaco Culture|Acadia|Hawai‘i Volcanoes|Denali",
    "White Mountain|Perry’s Victory|Great Basin|Fort McHenry|Mount Rushmore",
    "Great Smoky Mountains|Shenandoah|Arches|Great Sand Dunes|Everglades",
    "Homestead|Kisatchie|Blue Ridge Parkway|Bombay Hook|Saratoga",
    "Shawnee|Cumberland Gap|Harpers Ferry|Theodore Roosevelt|Fort Moultrie",
    "Effigy Mounds|Frederick Douglass|Ozark Riverways|Ellis Island|George Rogers Clark",
    "Pictured Rocks|Apostle Islands|Voyageurs|Cumberland Island|Block Island",
    "Lowell|American Memorial Park|War in the Pacific|San Antonio Missions|River of No Return",
    "National Park of American Samoa|Weir Farm|Salt River Bay|Marsh-Billings-Rockefeller|Tallgrass Prairie",
    "Tuskegee Airmen",
)
WOMEN_ISSUES = (
    "Maya Angelou|Sally Ride|Wilma Mankiller|Nina Otero-Warren|Anna May Wong",
    "Bessie Coleman|Edith Kanakaʻole|Eleanor Roosevelt|Jovita Idar|Maria Tallchief",
    "Pauli Murray|Patsy Takemoto Mink|Mary Edwards Walker|Celia Cruz|Zitkala-Ša",
    "Ida B. Wells|Juliette Gordon Low|Vera Rubin|Stacey Park Milbern|Althea Gibson",
)


def normalized(value):
    decomposed = unicodedata.normalize("NFKD", value.lower())
    return " ".join("".join(char if char.isalnum() else " " for char in decomposed
                            if not unicodedata.combining(char)).split())


def legend(value):
    if re.search(r"\bor\b|\[|\?|\ufffd", value, re.IGNORECASE):
        return ""   # A transcription with alternatives cannot be required as a complete inscription.
    return normalized(value).replace(" ", "")


def entry(id, kind, title, issuer, denomination, year, source, collection, *, details="", obverse="", reverse="", marker=""):
    full_text = normalized(" ".join((id, kind, title, issuer, denomination, year, details, obverse, reverse)))
    return (id, kind, title, issuer, denomination, year, source, collection,
            legend(obverse), legend(reverse), normalized(marker), full_text)


def ocre_rows(path, existing, receipt):
    data = path.read_bytes()
    prefix = f"blob {len(data)}\0".encode()
    if hashlib.sha1(prefix + data).hexdigest() != OCRE_BLOB:
        raise ValueError("Expected the immutable OCRE Git blob")
    receipt.update({"source": OCRE_SOURCE, "git_blob": OCRE_BLOB, "sha256": hashlib.sha256(data).hexdigest(),
                    "snapshot": "2019-12-04", "licence": "ODbL-1.0"})
    lines = data.decode("utf-8-sig").splitlines()
    reader = csv.DictReader(lines, delimiter="#")
    seen = set()
    for row in reader:
        code, label = row.get("ID", ""), row.get("Label", "")
        if not code or not label or not re.fullmatch(r"[A-Za-z0-9.()_\-]+", code):
            continue
        reference = code if code.startswith("ric.") else "ric." + code
        source = f"https://numismatics.org/ocre/id/{reference}"
        if source in seen or source in existing:
            continue
        seen.add(source)
        issuer = (row.get("Authority") or "").replace("_", " ").title()
        value = (row.get("Denomination") or "").replace("_", " ")
        title = " · ".join(filter(None, (label, value)))
        search = " ".join(row.get(key) or "" for key in ("Mint", "Region", "Metal", "StartDate", "EndDate"))
        yield entry(f"ocre-{reference}", "coin", title, issuer, value, "", source, "Nomisma OCRE",
                    details=search, obverse=row.get("ObvLegend") or "", reverse=row.get("RevLegend") or "")


def us_mint_rows():
    programs = [(1999, STATE_ISSUES, "state", "State Quarters", STATES),
                (2009, TERRITORY_ISSUES, "territory", "D.C. and U.S. Territories", TERRITORIES),
                (2010, PARK_ISSUES, "atb", "America the Beautiful", PARKS),
                (2022, WOMEN_ISSUES, "awq", "American Women Quarters", WOMEN)]
    for start, issues, code, series, source in programs:
        for year, groups in enumerate(issues, start=start):
            for design in groups.split("|"):
                slug = normalized(design).replace(" ", "-")
                yield entry(f"usmint-{code}-{year}-{slug}", "coin", f"{year} {design} quarter · {series}",
                            "United States", "25 cents", str(year), source, "U.S. Mint", marker=design)


NOTE = re.compile(r"\b(?:bank\s?notes?|paper (?:money|currency)|(?:federal reserve(?: bank)?|treasury|national bank|united states) notes?|(?:silver|gold|military payment) certificates?)\b")
EXCLUDE = re.compile(r"\b(?:plate|impression|remainder|facsimile|reproduction|photocopy|specimen sheet|printing proof)\b")
VALUE = re.compile(r"^([0-9][0-9,]*(?:\.\d{2})?)\s+([A-Za-zÀ-ž][A-Za-zÀ-ž -]{0,31})(?=[,;:(]|\s+[-–]|$)")
UNITS = {"dollar", "dollars", "cent", "cents", "peso", "pesos", "pound", "pounds", "franc", "francs",
         "mark", "marks", "yen", "yuan", "tael", "taels", "rubles", "rupees", "ngultrum", "shillings", "pence",
         "lira", "lire", "lei", "reales", "réis", "gulden", "kroner", "kronor", "korun", "escudos"}


def smithsonian_rows(directory, receipt):
    names = [f"{key:02x}.txt" for key in range(256)]
    if {path.name for path in directory.glob("*.txt")} != set(names):
        raise ValueError("Smithsonian import requires every NMAH metadata shard")
    receipt.update({"source": NMAH_SOURCE, "licence": "CC0-1.0", "shards": {}, "rows_read": 0})
    seen = set()
    for name in names:
        checksum = hashlib.sha256()
        with (directory / name).open("rb") as stream:
            for raw in stream:
                checksum.update(raw)
                receipt["rows_read"] += 1
                if b"National Numismatic Collection" not in raw or b'"CC0"' not in raw:
                    continue
                record = json.loads(raw.decode("utf-8-sig"))
                content = record["content"]
                desc = content.get("descriptiveNonRepeating", {})
                fields = content.get("freetext", {})
                if (desc.get("metadata_usage", {}).get("access") != "CC0"
                        or not any("National Numismatic Collection" in item["content"] for item in fields.get("setName", []))):
                    continue
                subject = [item["content"] for item in fields.get("objectType", [])]
                subject.extend(content.get("indexedStructured", {}).get("object_type", []))
                categories = " ".join(subject).casefold()
                label = record.get("title", "").strip()
                if not label or not NOTE.search(categories) or EXCLUDE.search(f"{categories} {label.casefold()}"):
                    continue
                record_id = desc.get("record_ID", "")
                source = desc.get("guid", "")
                if not re.fullmatch(r"nmah_\d+", record_id) or record_id in seen:
                    continue
                uri = urlsplit(source)
                if uri.scheme != "https" or uri.hostname not in ("n2t.net", "americanhistory.si.edu", "www.si.edu"):
                    continue
                date_text = [item["content"] for item in fields.get("date", [])]
                years = {int(match) for value in date_text for match in re.findall(r"(?<!\d)(?:1[5-9]|20)\d{2}(?!\d)", value)}
                year = str(next(iter(years))) if len(years) == 1 else ""
                names = {item["content"] for item in fields.get("name", []) if item.get("label", "").casefold() == "issuing authority"}
                issuer = next(iter(names)) if len(names) == 1 else ""
                match = VALUE.match(label)
                amount = ""
                if match and match[2].strip().casefold() in UNITS:
                    amount = match[1].removesuffix(".00") + " " + match[2].strip().casefold()
                descriptor = " · ".join(filter(None, (label, issuer if issuer.casefold() not in label.casefold() else "", year if year not in label else "")))
                if label.isdigit() and not issuer and not amount:
                    continue  # These generic collection records cannot identify a reference banknote.
                places = [item["content"] for item in fields.get("place", [])]
                yield entry("smithsonian-" + record_id, "banknote", descriptor, issuer, amount, year, source,
                            "Smithsonian", details=" ".join(subject + date_text + places))
                seen.add(record_id)
        receipt["shards"][name] = checksum.hexdigest()


SCHEMA = """
CREATE TABLE entries(
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('coin','banknote')), title TEXT NOT NULL,
 issuer TEXT NOT NULL, denomination TEXT NOT NULL, year TEXT NOT NULL, source TEXT NOT NULL,
 collection TEXT NOT NULL, obverse_key TEXT NOT NULL, reverse_key TEXT NOT NULL,
 design_marker TEXT NOT NULL, search_text TEXT NOT NULL
);
CREATE INDEX entries_obverse ON entries(obverse_key) WHERE obverse_key <> '';
CREATE INDEX entries_reverse ON entries(reverse_key) WHERE reverse_key <> '';
CREATE INDEX entries_collection_year ON entries(collection, year);
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("ocre", "smithsonian", "packs", "receipt"):
        parser.add_argument(key, type=Path)
    args = parser.parse_args()
    existing = {row["source"] for row in json.loads((args.packs / "AncientCoins.json").read_text(encoding="utf-8"))}
    target = args.packs / "ExpandedCatalog.sqlite"
    temporary = target.with_suffix(".sqlite.tmp")
    temporary.unlink(missing_ok=True)
    receipt = {"Nomisma OCRE": {}, "Smithsonian": {}, "U.S. Mint": {"sources": [STATES, TERRITORIES, PARKS, WOMEN]}}
    counts = Counter()
    connection = sqlite3.connect(temporary)
    try:
        connection.executescript(SCHEMA)
        rows = (ocre_rows(args.ocre, existing, receipt["Nomisma OCRE"]), us_mint_rows(),
                smithsonian_rows(args.smithsonian, receipt["Smithsonian"]))
        with connection:
            for collection in rows:
                for row in collection:
                    connection.execute("INSERT INTO entries VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", row)
                    counts[row[7]] += 1
        if not all(counts[key] for key in receipt) or connection.execute("PRAGMA integrity_check").fetchone() != ("ok",):
            raise ValueError("Expanded catalog integrity or source coverage check failed")
        connection.execute("VACUUM")
    finally:
        connection.close()
    temporary.replace(target)
    for key, value in counts.items():
        receipt[key]["entries"] = value
    receipt["database"] = {"bytes": target.stat().st_size, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}
    args.receipt.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(counts, indent=2))


if __name__ == "__main__":
    main()
