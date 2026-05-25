# FRUS 1989-1992 Volume VI Research Assistant

GitHub Pages research assistant for *Foreign Relations of the United States,
1989-1992, Volume VI, Eastern Mediterranean*.

The page is organized into four chronological chapters:

1. Greece
2. Cyprus
3. Turkey
4. Regional

The core chronology is harvested from the Bush Library memcons and telcons index
and enriched with National Archives Catalog metadata, direct PDFs, page counts,
and source notes.

## Source Notes

Public source notes use a FRUS-style archival citation: repository, collection,
series/file path, document or file-unit title, then release/access and NAID
metadata. Search terms, OCR samples, child-counts, and endpoint caveats are
kept separately as `researchNote` compiler breadcrumbs.

After re-running any harvest, normalize the source-note fields:

```bash
node scripts/normalize-source-notes.js
```

## NARA Scout

The candidate-lead lane is built from NARA Scout searches using the Bush 41
Volume VI topic pack and focused queries for Greece, Cyprus, Turkey, Aegean, and
Eastern Mediterranean records.

Run:

```bash
node scripts/harvest-nara-scout.js
```

The script writes:

- `data/records.json` and `data/records.js`
- `data/nara-scout-leads.json` and `data/nara-scout-leads.js`
- `data/blackwill-files.json` and `data/blackwill-files.js`
- `reports/nara-scout-eastmed-search.json`

## Central Chronological Files Search

Catalog NAID 374000108, the European and Eurasian Directorate Central
Chronological Files, is searched within the series for Eastern Mediterranean
names, places, memcons, telcons, and related policy packets. The harvest keeps
the strongest monthly file-unit leads and OCR-samples the first pages of
priority PDFs to capture packet-index evidence.

Run:

```bash
node scripts/harvest-central-chronology.js
```

The script writes:

- `data/central-chronology-files.json` and `data/central-chronology-files.js`
- `reports/central-chronology-374000108-eastmed.json`

## Blackwill Series Review

Catalog NAID 2554653, Robert D. Blackwill's Subject Files, is reviewed as a
complete series. The current harvest captures all 29 file units, page counts,
restriction status, direct Catalog links, and direct PDF links.

Catalog NAID 2554659, Robert D. Blackwill Chronological Files, is also reviewed
as a complete series. The current harvest captures all 56 file units, searches
the series for Eastern Mediterranean terms, and OCR-samples priority PDFs.

Run:

```bash
node scripts/harvest-blackwill-chronology.js
```

The script writes:

- `data/blackwill-chron-files.json` and `data/blackwill-chron-files.js`
- `reports/blackwill-chronology-2554659-eastmed.json`

Catalog NAID 2554841, Robert M. Gates' Chronological Files, is reviewed as a
smaller chronological series. The current harvest captures all 21 file units,
searches the series for Eastern Mediterranean terms, and OCR-samples priority
PDFs. Current hits are sparse and mostly peripheral or personnel-context leads.

Run:

```bash
node scripts/harvest-gates-chronology.js
```

The script writes:

- `data/gates-chron-files.json` and `data/gates-chron-files.js`
- `reports/gates-chronology-2554841-eastmed.json`

## Requested Source Pools

The page also preserves the additional source pools requested for the compiler:
Scowcroft Papers, Presidential Daily File, NSC meeting files, NSC/DC meetings,
NSC/DC follow-up, NSR, NSD, and IF Transition. The harvest records each source
anchor, root Catalog metadata where available, public Search Within links,
online child totals where the Catalog endpoint returns them, and EastMed query
evidence for Greece, Cyprus, Turkey, Aegean, memcons, telcons, NSR, and NSD.

Run:

```bash
node scripts/harvest-requested-sources.js
```

The script writes:

- `data/requested-source-series.json` and `data/requested-source-series.js`
- `reports/requested-source-series-eastmed.json`

## Persons List

The `persons.html` page is generated in the style of published FRUS persons
lists from the attached Bush Comprehensive Names List, with supplemental entries
for GCT corpus names not present in that authority file.

Run:

```bash
python3 scripts/generate-persons-list.py /path/to/Bush-Comprehensive-Names-List.docx
```

The script writes:

- `persons.html`
- `data/persons.json` and `data/persons.js`
- `reports/persons-list.md`

## Local Preview

Open with a local static server:

```bash
python3 -m http.server 4192
```

Then visit <http://127.0.0.1:4192/>.

## Source Anchors

- FRUS Volume VI: <https://history.state.gov/historicaldocuments/frus1989-92v06>
- NARA Scout: <https://therealjameswilson.github.io/nara-scout/>
- Robert D. Blackwill's Subject Files: <https://catalog.archives.gov/id/2554653>
- Robert D. Blackwill Chronological Files: <https://catalog.archives.gov/id/2554659>
- Robert M. Gates' Chronological Files: <https://catalog.archives.gov/id/2554841>
- European and Eurasian Directorate Central Chronological Files: <https://catalog.archives.gov/search-within/374000108>
- Brent Scowcroft Papers: <https://catalog.archives.gov/id/4522156>
- Presidential Daily File: <https://catalog.archives.gov/search-within/595141?availableOnline=true&limit=100>
- H-Files NSC Meeting Files: <https://catalog.archives.gov/id/312293887>
- H-Files NSC/DC Meetings Files: <https://catalog.archives.gov/id/312294079>
- NSC/DC Meetings Follow-Up: <https://catalog.archives.gov/id/312294094>
- NSR source pool: <https://catalog.archives.gov/id/313189297>
- National Security Directives Files: <https://catalog.archives.gov/id/313189290>
- NSC Institutional Files Transition Files: <https://catalog.archives.gov/id/348937136>
- Bush Library Memcons and Telcons: <https://www.bush41library.gov/digital-research-room/about-textual-collections/memcons-and-telcons>
