"""Build the bundled text catalogs from official issue facts and pinned open data."""

import argparse
import gzip
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlsplit


US_MINT = "https://www.usmint.gov/learn/coins-and-medals/circulating-coins"
US_NOTES = "https://www.uscurrency.gov/denominations"
RCM = "https://www.mint.ca/en/discover/canadian-circulation"
BOC = "https://www.bankofcanadamuseum.ca/complete-bank-note-series/"
HK_COINS = "https://www.hkma.gov.hk/eng/key-functions/money/hong-kong-currency/coins/"
HK_NOTES = "https://www.hkma.gov.hk/eng/key-functions/money/hong-kong-currency/notes/"
EU_COINS = "https://www.ecb.europa.eu/euro/coins/html/index.en.html"
EU_NOTES = "https://www.ecb.europa.eu/euro/banknotes/current/html/index.en.html"
NUMBERS = {1: "one", 2: "two", 5: "five", 10: "ten", 20: "twenty", 25: "twenty five", 50: "fifty",
           100: "one hundred", 200: "two hundred", 500: "five hundred", 1000: "one thousand"}
ANCIENT_SHA256 = "c428f96394c538402e03642d63f44323868997e4c6b3039fd149a41a6854fe12"
HISTORIC_SHA256 = {
    "commons-banknotes.json": "28b0829f0167a4cceeba31c6afcdff4785507c32239e88bb10ab41856e4a8eb0",
    "commons-silver-certs.json": "34379ac3238a0c9564fd0cd485c4b2342b19c1c8b14dd9a06fd88244f644b283",
}


def row(key, kind, title, issuer, denom, source, *, year="", issuers=(), amounts=(), hints=(),
        required=(), scope="family", **extra):
    value = {"id": key, "type": kind, "title": title, "issuer": issuer, "denomination": denom,
             "year": str(year), "source": source, "issuerWords": list(issuers), "denominationWords": list(amounts),
             "catalogScope": scope, **extra}
    if hints:
        value["variantWords"] = list(hints)
    if required:
        value["requiredWords"] = list(required)
    return value


def amount(number, unit):
    return f"{number} {unit}", f"{NUMBERS.get(number, number)} {unit}"


def modern():
    us = ["united states of america", "united states"]
    for key, label, value, aliases, hints in (
        ("cent", "Lincoln cent", "1 cent", ("one cent", "1 cent"), ("lincoln", "e pluribus unum")),
        ("nickel", "Jefferson nickel", "5 cents", ("five cents", "5 cents"), ("monticello",)),
        ("dime", "Roosevelt dime", "1 dime", ("one dime", "1 dime"), ("roosevelt", "e pluribus unum")),
        ("quarter", "United States quarter", "25 cents", ("quarter dollar", "25 cents"), ()),
        ("half", "United States half dollar", "50 cents", ("half dollar", "50 cents"), ()),
        ("dollar", "United States dollar coin", "1 dollar", ("one dollar", "1 dollar"), ()),
    ):
        yield row("us-coin-" + key, "coin", label, "United States", value, US_MINT,
                  issuers=us, amounts=aliases, hints=hints)
    for value in (1, 2, 5, 10, 20, 50, 100):
        dollars = "dollar" if value == 1 else "dollars"
        yield row(f"us-frn-{value}", "banknote", f"United States ${value} Federal Reserve note", "United States",
                  f"{value} {dollars}", US_NOTES, issuers=us, amounts=amount(value, dollars),
                  hints=("federal reserve note",), required=("federal reserve note",))
    for value, unit in [(1, "cent"), (5, "cents"), (10, "cents"), (25, "cents"), (50, "cents"),
                        (1, "dollar"), (2, "dollars")]:
        yield row(f"ca-coin-{value}-{unit}", "coin", f"Canada {value} {unit} coin", "Canada", f"{value} {unit}", RCM,
                  issuers=("canada",), amounts=amount(value, unit))
    canada_bank = ("bank of canada", "banque du canada")
    series = {
        "1935": ("1935 First Series", (1, 2, 5, 10, 20, 25, 50, 100, 500, 1000)),
        "1937": ("1937 Bilingual Series", (1, 2, 5, 10, 20, 50, 100, 1000)),
        "1954": ("1954 Canadian Landscape", (1, 2, 5, 10, 20, 50, 100, 1000)),
        "centennial": ("1967 Centennial", (1,)),
        "scenes": ("Scenes of Canada", (1, 2, 5, 10, 20, 50, 100)),
        "birds": ("Birds of Canada", (2, 5, 10, 20, 50, 100, 1000)),
        "journey": ("Canadian Journey", (5, 10, 20, 50, 100)),
        "frontier": ("Frontier", (5, 10, 20, 50, 100)),
        "vertical": ("Vertical $10", (10,)),
        "150": ("Canada 150", (10,)),
    }
    for key, (title, values) in series.items():
        for value in values:
            if value == 1 and key in ("1935", "1937"):
                continue  # The original app catalog already supplies these issues.
            unit = "dollar" if value == 1 else "dollars"
            hints = ("viola desmond",) if key == "vertical" else ()
            yield row(f"ca-note-{key}-{value}", "banknote", f"Bank of Canada ${value} · {title}", "Bank of Canada",
                      f"{value} {unit}", BOC, year=key if key.isdigit() and len(key) == 4 else "",
                      issuers=canada_bank, amounts=(*amount(value, unit), *(('un dollar',) if value == 1 else ())),
                      hints=hints, required=canada_bank, scope="series")
    for value in sorted({value for _, values in series.values() for value in values}):
        unit = "dollar" if value == 1 else "dollars"
        yield row(f"ca-note-{value}", "banknote", f"Bank of Canada ${value} note", "Bank of Canada",
                  f"{value} {unit}", BOC, issuers=canada_bank,
                  amounts=(*amount(value, unit), *(('un dollar',) if value == 1 else ())), required=canada_bank)
    for value, unit, legend in [(10, "cents", "壹毫"), (20, "cents", "貳毫"), (50, "cents", "伍毫"),
                                (1, "dollar", "壹圓"), (2, "dollars", "貳圓"), (5, "dollars", "伍圓"),
                                (10, "dollars", "拾圓")]:
        yield row(f"hk-coin-{value}-{unit}", "coin", f"Hong Kong {value} {unit} coin", "Hong Kong",
                  f"{value} {unit}", HK_COINS, issuers=("hong kong", "香港"), amounts=(*amount(value, unit), legend))
    hk_banks = {
        "bochk": ("Bank of China (Hong Kong)", ("bank of china", "中國銀行"), (20, 50, 100, 500, 1000)),
        "hsbc": ("Hongkong and Shanghai Banking Corporation", ("hongkong and shanghai banking corporation", "香港上海滙豐銀行"), (20, 50, 100, 500, 1000)),
        "sc": ("Standard Chartered Bank", ("standard chartered bank", "渣打銀行"), (20, 50, 100, 500, 1000)),
        "gov": ("Hong Kong Government", ("government of the hong kong special administrative region",), (10,)),
    }
    for key, (issuer, aliases, values) in hk_banks.items():
        for value in values:
            yield row(f"hk-note-{key}-{value}", "banknote", f"Hong Kong ${value} · {issuer}", issuer,
                      f"{value} Hong Kong dollars", HK_NOTES, issuers=aliases, amounts=amount(value, "dollars"), required=aliases)
    for value, unit in [(1, "euro cent"), (2, "euro cent"), (5, "euro cent"), (10, "euro cent"), (20, "euro cent"),
                        (50, "euro cent"), (1, "euro"), (2, "euro")]:
        yield row(f"eur-coin-{value}-{unit.replace(' ', '-')}", "coin", f"{value} {unit} coin", "Euro area", f"{value} {unit}",
                  EU_COINS, issuers=("euro",), amounts=amount(value, unit))
    for value in (5, 10, 20, 50, 100, 200, 500):
        yield row(f"eur-note-{value}", "banknote", f"€{value} banknote", "European Central Bank", f"{value} euros", EU_NOTES,
                  issuers=("euro", "ευρω"), amounts=(f"{value} euro", f"{value} ευρω", f"{value} евро"))
        if value != 500:
            yield row(f"eur-note-europa-{value}", "banknote", f"€{value} Europa series banknote", "European Central Bank",
                      f"{value} euros", EU_NOTES, issuers=("euro", "ευρω", "евро"),
                      amounts=(f"{value} euro", f"{value} ευρω", f"{value} евро"),
                      hints=("евро",), required=("евро",), scope="series")


def ancient(path):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != ANCIENT_SHA256:
        raise ValueError("Expected the pinned Syllogeum v1.1 type export")
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        for line in stream:
            info = json.loads(line)
            uri = urlsplit(info["type_uri"])
            if uri.hostname != "numismatics.org" or "/id/" not in uri.path:
                raise ValueError(f"Unreviewed type source: {uri.geturl()}")
            project, ref = uri.path.strip("/").split("/id/", 1)
            authority, value = info.get("authority") or "", info.get("denomination") or ""
            detail = " · ".join(filter(None, (info.get("type_label"), authority, value)))
            yield row(f"{project}-{ref}", "coin", detail, authority, value, uri._replace(scheme="https").geturl(),
                      scope="ancient", obverseLegend=info.get("obv_legend") or "", reverseLegend=info.get("rev_legend") or "",
                      searchDetails=" ".join(filter(None, (info.get("mint"), info.get("material"), ref,
                                                           info.get("date_start"), info.get("date_end")))))


def historic(source):
    cs = ("the confederate states of america", "confederate states of america")
    seen = set()
    for name, expected in HISTORIC_SHA256.items():
        data = (source / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError(f"Unexpected historic catalog source: {name}")
        items = json.loads(data.decode("utf-8-sig"))["query"]["pages"]
        for item in sorted(items.values(), key=lambda item: item["title"]):
            meta, = item.get("imageinfo", [{}])[:1]
            if meta.get("extmetadata", {}).get("LicenseShortName", {}).get("value") != "Public domain":
                continue
            title = item["title"]
            csa = re.fullmatch(r"File:CSA-T(\d+)-\$(\d+)-(\d{4})(?:–\d{2})?\.jpg", title)
            silver = re.match(r"File:US-\$(\d+)-SC-(\d{4})(?:-[A-Z])?-Fr[.\-](\d+)\b", title)
            if csa:
                ref, value, year = csa.groups()
                key = f"historic-csa-{ref}"
                name = f"Confederate States ${value} · T-{ref} ({year})"
                issuer, issuers, required = "Confederate States of America", cs, cs
            elif silver:
                value, year, ref = silver.groups()
                key = f"historic-us-sc-{ref}"
                name = f"United States ${value} Silver Certificate · Fr. {ref} ({year})"
                issuer, issuers, required = "United States", ("united states of america",), ("silver certificate",)
            else:
                continue
            if key in seen:
                continue
            seen.add(key)
            unit = "dollar" if value == "1" else "dollars"
            aliases = amount(int(value), unit)
            if silver and value == "1":
                aliases = (*aliases, "one silver dollar", "1 silver dollar")
            yield row(key, "banknote", name, issuer, f"{value} {unit}", meta["descriptionurl"], year=year,
                      issuers=issuers, amounts=aliases, required=required,
                      hints=required, scope="historical")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--source", type=Path, required=True, help="Directory containing the frozen public source files")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    used = set()
    for name, rows in (("ModernMoney", modern()), ("AncientCoins", ancient(args.source / "types.jsonl.gz")),
                       ("HistoricBanknotes", historic(args.source))):
        records = sorted(rows, key=lambda entry: entry["id"])
        ids = {entry["id"] for entry in records}
        if not records or len(ids) != len(records) or used & ids:
            raise ValueError(f"Missing data or duplicate IDs in {name}")
        used.update(ids)
        path = args.output / (name + ".json")
        lines = [json.dumps(entry, ensure_ascii=False, separators=(",", ":")) for entry in records]
        path.write_text("[\n" + ",\n".join(lines) + "\n]\n", encoding="utf-8", newline="\n")
        print(f"{name}: {len(records):,} records, {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
