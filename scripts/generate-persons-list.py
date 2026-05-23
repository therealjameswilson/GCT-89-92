#!/usr/bin/env python3

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile


NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

CURATED_PERSONS = [
    {
        "id": "abramowitz-morton",
        "patterns": [r"^Abramowitz,\s+Morton Isaac,"],
    },
    {
        "id": "baker-james",
        "patterns": [r"^Baker,\s+James Addison,\s+III,"],
    },
    {
        "id": "blackwill-robert",
        "patterns": [r"^Blackwill,\s+Robert D\."],
    },
    {
        "id": "burns-nicholas",
        "patterns": [r"^Burns,\s+R\. Nicholas,"],
        "override": "Burns, R. Nicholas, Special Assistant to the Counselor of the Department of State in 1989; Director for European and Soviet Affairs, National Security Council staff, in 1990; Director for European and Eurasian Affairs, National Security Council staff, in 1992",
    },
    {
        "id": "bush-george",
        "patterns": [r"^Bush,\s+George Herbert Walker,"],
    },
    {
        "id": "cheney-richard",
        "patterns": [r"^Cheney,\s+Richard Bruce,"],
    },
    {
        "id": "clerides-glafcos",
        "patterns": [r"^Clerides,\s+Glafcos,"],
        "fallback": "Clerides, Glafcos, Greek Cypriot political leader; President of Cyprus from February 1993",
    },
    {
        "id": "demirel-suleyman",
        "patterns": [r"^Demirel,\s+Sulei?man,"],
        "override": "Demirel, Suleyman, Prime Minister of Turkey",
    },
    {
        "id": "denktash-rauf",
        "patterns": [r"^Denktash,\s+Rauf,"],
    },
    {
        "id": "djerejian-edward",
        "patterns": [r"^Djerejian,\s+Edward Peter,"],
    },
    {
        "id": "dobbins-james",
        "patterns": [r"^Dobbins,\s+James F\.,\s+Jr\."],
    },
    {
        "id": "eagleburger-lawrence",
        "patterns": [r"^Eagleburger,\s+Lawrence Sidney,"],
    },
    {
        "id": "evren-kenan",
        "patterns": [r"^Evren,\s+Kenan,"],
        "fallback": "Evren, Kenan, President of Turkey until November 1989",
    },
    {
        "id": "gates-robert",
        "patterns": [r"^Gates,\s+Robert M\."],
    },
    {
        "id": "gompert-david",
        "patterns": [r"^Gompert,\s+David C\."],
    },
    {
        "id": "grossman-marc",
        "patterns": [r"^Grossman,\s+Marc,"],
    },
    {
        "id": "haass-richard",
        "patterns": [r"^Haass,\s+Richard N\."],
    },
    {
        "id": "holl-jane",
        "patterns": [r"^Holl,\s+Jane E\."],
    },
    {
        "id": "kimmitt-robert",
        "patterns": [r"^Kimmitt,\s+Robert M\."],
    },
    {
        "id": "ledsky-nelson",
        "patterns": [r"^Ledsky,\s+Nelson C\."],
    },
    {
        "id": "mitsotakis-constantine",
        "patterns": [r"^Mitsotakis,\s+Constantine,"],
    },
    {
        "id": "niles-thomas",
        "patterns": [r"^Niles,\s+Thomas Michael"],
    },
    {
        "id": "ozal-turgut",
        "patterns": [r"^Ozal,\s+Turgut,"],
        "override": "Ozal, Turgut, Prime Minister of Turkey until November 1989; President of Turkey from November 1989",
    },
    {
        "id": "papandreou-andreas",
        "patterns": [r"^Papandreou,\s+Andreas,"],
        "fallback": "Papandreou, Andreas, Prime Minister of Greece until July 1989; thereafter leader of the Panhellenic Socialist Movement",
    },
    {
        "id": "papoulias-george",
        "patterns": [r"^Papoulias,\s+George,"],
        "fallback": "Papoulias, George, Greek foreign minister until July 1989",
    },
    {
        "id": "powell-colin",
        "patterns": [r"^Powell,\s+Colin L\."],
    },
    {
        "id": "rice-condoleezza",
        "patterns": [r"^Rice,\s+Condoleezza,"],
        "override": "Rice, Condoleezza, Director for European and Soviet Affairs, National Security Council staff, from February 1989 until May 1990; Senior Director for European and Soviet Affairs from May 1990 until August 1990; Special Assistant to the President for National Security Affairs and Senior Director for Soviet Affairs from August 1990 until March 1991",
    },
    {
        "id": "ross-dennis",
        "patterns": [r"^Ross,\s+Dennis B\."],
    },
    {
        "id": "samaras-antonis",
        "patterns": [r"^Samaras,\s+Antonis,"],
        "override": "Samaras, Antonis, Foreign Minister of Greece",
    },
    {
        "id": "scowcroft-brent",
        "patterns": [r"^Scowcroft,\s+Gen\. Brent,"],
        "override": "Scowcroft, Brent, Gen., USAF (Ret.); President's Assistant for National Security Affairs from January 1989",
    },
    {
        "id": "seitz-raymond",
        "patterns": [r"^Seitz,\s+Raymond G\. H\."],
    },
    {
        "id": "sotirhos-michael",
        "patterns": [r"^Sotirhos,\s+Michael,"],
    },
    {
        "id": "sununu-john",
        "patterns": [r"^Sununu,\s+John H\."],
    },
    {
        "id": "taft-william",
        "patterns": [r"^Taft,\s+William Howard,\s+IV,"],
    },
    {
        "id": "vassiliou-george",
        "patterns": [r"^Vassiliou,\s+George,"],
    },
    {
        "id": "woerner-manfred",
        "patterns": [r"^Woerner,\s+Manfred,"],
    },
    {
        "id": "wolfowitz-paul",
        "patterns": [r"^Wolfowitz,\s+Paul D\."],
    },
    {
        "id": "yilmaz-mesut",
        "patterns": [r"^Yilmaz,\s+(A\.\s+)?Mesut,"],
        "fallback": "Yilmaz, Mesut, Prime Minister of Turkey from June 1991 until November 1991",
    },
    {
        "id": "zacharakis-christos",
        "patterns": [r"^Zacharakis,\s+Christos,"],
        "fallback": "Zacharakis, Christos, Ambassador of Greece to the United States from 1989",
    },
    {
        "id": "zelikow-philip",
        "patterns": [r"^Zelikow,\s+Philip,"],
    },
    {
        "id": "zolotas-xenofon",
        "patterns": [r"^Zolotas,\s+Xenofon,"],
        "fallback": "Zolotas, Xenofon, Prime Minister of Greece from November 1989 until April 1990",
    },
]


def extract_docx_paragraphs(docx_path: Path) -> list[str]:
    with ZipFile(docx_path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    paragraphs = []
    for paragraph in root.findall(".//w:p", NS):
        text = "".join(node.text or "" for node in paragraph.findall(".//w:t", NS)).strip()
        if text:
            paragraphs.append(text)
    return paragraphs


def find_entry(paragraphs: list[str], patterns: list[str]) -> str | None:
    for pattern in patterns:
        regex = re.compile(pattern, re.IGNORECASE)
        for paragraph in paragraphs:
            if regex.search(paragraph):
                return paragraph
    return None


def entry_sort_key(entry: str) -> tuple[str, str]:
    parts = entry.split(",", 1)
    return (parts[0].lower(), entry.lower())


def generate_persons(paragraphs: list[str]) -> list[dict[str, str]]:
    persons = []
    for person in CURATED_PERSONS:
        authority_entry = find_entry(paragraphs, person["patterns"])
        source = "Bush Comprehensive Names List"
        entry = authority_entry
        if person.get("override"):
            entry = person["override"]
        if not entry:
            entry = person["fallback"]
            source = "Supplemental from GCT corpus"
        persons.append(
            {
                "id": person["id"],
                "entry": entry,
                "source": source,
            }
        )
    return sorted(persons, key=lambda item: entry_sort_key(item["entry"]))


def write_json(persons: list[dict[str, str]], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "persons.json").write_text(json.dumps(persons, indent=2) + "\n")
    (output_dir / "persons.js").write_text(f"window.GCT_PERSONS = {json.dumps(persons, indent=2)};\n")


def write_markdown(persons: list[dict[str, str]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Persons",
        "",
        "Format modeled on the FRUS published persons list. Entries are drawn from the attached Bush Comprehensive Names List unless marked in `data/persons.json` as supplemental from the GCT corpus.",
        "",
    ]
    lines.extend(f"- {person['entry']}" for person in persons)
    output_path.write_text("\n".join(lines) + "\n")


def write_html(persons: list[dict[str, str]], output_path: Path) -> None:
    items = "\n".join(f"            <li>{html.escape(person['entry'])}</li>" for person in persons)
    output_path.write_text(
        f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Persons | FRUS 1989-1992 Volume VI Research Assistant</title>
    <meta
      name="description"
      content="Persons list for the FRUS 1989-1992 Volume VI Eastern Mediterranean research assistant."
    />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="index.html#top" aria-label="FRUS Volume VI research assistant home">
        <span class="brand-mark">VI</span>
        <span>Eastern Mediterranean Desk</span>
      </a>
      <nav aria-label="Primary navigation">
        <a href="index.html#chapters">Chapters</a>
        <a href="index.html#records">Chronology</a>
        <a href="index.html#scout">NARA Scout</a>
        <a href="index.html#central">Central Chron</a>
        <a href="index.html#blackwill">Blackwill</a>
        <a href="index.html#blackwill-chron">Blackwill Chron</a>
        <a href="index.html#gates-chron">Gates Chron</a>
        <a href="index.html#requested-sources">Source Pools</a>
        <a href="persons.html">Persons</a>
        <a href="index.html#sources">Sources</a>
      </nav>
    </header>

    <main id="top">
      <section class="section persons-page" aria-labelledby="persons-title">
        <div class="section-heading">
          <p class="kicker">Reference Apparatus</p>
          <h1 id="persons-title">Persons</h1>
        </div>
        <p class="records-intro">
          Names are formatted in the style of published FRUS persons lists:
          surname first, followed by office, role, and date information where
          available. Authority entries come from the attached Bush comprehensive
          names list; missing GCT corpus names are supplemented from current
          document titles and source-lane evidence.
        </p>
        <ul class="persons-list">
{items}
        </ul>
      </section>
    </main>

    <footer>
      <p>Published with GitHub Pages.</p>
      <a href="https://github.com/therealjameswilson/GCT-89-92">Repository</a>
    </footer>
  </body>
</html>
""",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a FRUS-style Persons list from the Bush names authority DOCX.")
    parser.add_argument("docx", type=Path, help="Path to Bush Comprehensive Names List.docx")
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument("--report", type=Path, default=Path("reports/persons-list.md"))
    parser.add_argument("--html", type=Path, default=Path("persons.html"))
    args = parser.parse_args()

    paragraphs = extract_docx_paragraphs(args.docx)
    persons = generate_persons(paragraphs)
    write_json(persons, args.data_dir)
    write_markdown(persons, args.report)
    write_html(persons, args.html)
    supplemental = sum(1 for person in persons if person["source"].startswith("Supplemental"))
    print(f"Wrote {len(persons)} persons ({supplemental} supplemental).")


if __name__ == "__main__":
    main()
