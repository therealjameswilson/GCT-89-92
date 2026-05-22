#!/usr/bin/env node

const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const PROXY_URL = "https://nara-proxy.mzqmpgyvdv.workers.dev";
const API_KEY = process.env.NARA_API_KEY || "C6O0DyEcap6taVb24zymF5AOMQvwTXsa7q0ZH8cN";
const SERIES_NAID = "374000108";
const SERIES_TITLE = "European and Eurasian Directorate Central Chronological Files";
const COLLECTION_TITLE = "Records of the National Security Council (George H. W. Bush Administration)";
const COLLECTION_NAID = "2163580";
const CACHE_DIR = process.env.GCT_CENTRAL_CACHE || path.join(os.tmpdir(), "gct-central-chronology");
const OCR_LIMIT = Number(process.env.GCT_CENTRAL_OCR_LIMIT || 24);
const CANDIDATE_LIMIT = Number(process.env.GCT_CENTRAL_CANDIDATE_LIMIT || 72);

const FRUS_VOLUME = {
  id: "frus1989-92v06",
  title: "Foreign Relations of the United States, 1989-1992, Volume VI, Eastern Mediterranean",
  url: "https://history.state.gov/historicaldocuments/frus1989-92v06",
  status: "Being Researched"
};

const QUERY_DEFINITIONS = [
  { id: "mitsotakis-memcon", q: "Mitsotakis memcon", chapter: "Greece", label: "Mitsotakis + memcon", weight: 14 },
  { id: "mitsotakis-telcon", q: "Mitsotakis telcon", chapter: "Greece", label: "Mitsotakis + telcon", weight: 14 },
  {
    id: "mitsotakis-moc",
    q: "Mitsotakis Memorandum Conversation",
    chapter: "Greece",
    label: "Mitsotakis + memorandum of conversation",
    weight: 13
  },
  { id: "papandreou-memcon", q: "Papandreou memcon", chapter: "Greece", label: "Papandreou + memcon", weight: 12 },
  { id: "zolotas-telcon", q: "Zolotas telcon", chapter: "Greece", label: "Zolotas + telcon", weight: 15 },
  { id: "vassiliou-memcon", q: "Vassiliou memcon", chapter: "Cyprus", label: "Vassiliou + memcon", weight: 14 },
  { id: "vassiliou-telcon", q: "Vassiliou telcon", chapter: "Cyprus", label: "Vassiliou + telcon", weight: 14 },
  {
    id: "cyprus-denktash-vassiliou",
    q: "Cyprus Denktash Vassiliou",
    chapter: "Cyprus",
    label: "Cyprus / Denktash / Vassiliou",
    weight: 13
  },
  {
    id: "denktash-memorandum",
    q: "Denktash memorandum",
    chapter: "Cyprus",
    label: "Denktash + memorandum",
    weight: 12
  },
  { id: "ozal-memcon", q: "Turkey Ozal memcon", chapter: "Turkey", label: "Ozal + memcon", weight: 14 },
  { id: "ozal-telcon", q: "Turkey Ozal telcon", chapter: "Turkey", label: "Ozal + telcon", weight: 14 },
  { id: "demirel-memcon", q: "Demirel memcon", chapter: "Turkey", label: "Demirel + memcon", weight: 14 },
  { id: "demirel-telcon", q: "Demirel telcon", chapter: "Turkey", label: "Demirel + telcon", weight: 14 },
  { id: "yilmaz-memcon", q: "Yilmaz memcon", chapter: "Turkey", label: "Yilmaz + memcon", weight: 12 },
  { id: "aegean-memcon", q: "Aegean memcon", chapter: "Regional", label: "Aegean + memcon", weight: 15 },
  {
    id: "greek-turkish-memorandum",
    q: "Greek Turkish memorandum",
    chapter: "Regional",
    label: "Greek-Turkish + memorandum",
    weight: 12
  },
  {
    id: "triad-memcon",
    q: "Greece Turkey Cyprus memcon",
    chapter: "Regional",
    label: "Greece / Turkey / Cyprus + memcon",
    weight: 14
  },
  {
    id: "triad-telcon",
    q: "Greece Turkey Cyprus telcon",
    chapter: "Regional",
    label: "Greece / Turkey / Cyprus + telcon",
    weight: 14
  },
  {
    id: "cyprus-moc",
    q: "Cyprus memorandum conversation",
    chapter: "Cyprus",
    label: "Cyprus + memorandum of conversation",
    weight: 10
  },
  {
    id: "turkey-moc",
    q: "Turkey memorandum conversation",
    chapter: "Turkey",
    label: "Turkey + memorandum of conversation",
    weight: 9
  }
];

const OCR_PRIORITY_NAIDS = [
  "470761700",
  "470761737",
  "470761775",
  "470761673",
  "470761667",
  "470761834",
  "470761816",
  "470761820",
  "470761833",
  "470761711",
  "470761713",
  "470761791",
  "470761771",
  "470761664",
  "470761662",
  "470761744",
  "470761674",
  "470761797",
  "470761812",
  "470761832",
  "470761838",
  "470761805",
  "470761798",
  "470761821",
  "470761770",
  "470761806",
  "470761794"
];

const CHAPTERS = [
  ["Greece", 1],
  ["Cyprus", 2],
  ["Turkey", 3],
  ["Regional", 4]
];
const chapterNumber = new Map(CHAPTERS);

function catalogUrl(naid) {
  return `https://catalog.archives.gov/id/${naid}`;
}

function mirrorJs(variableName, value) {
  return `window.${variableName} = ${JSON.stringify(value, null, 2)};\n`;
}

function monthDateFromTitle(value) {
  const match = String(value || "").match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(1989|1990|1991|1992|1993)\b/i
  );
  if (!match) return "";
  const month = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december"
  ].indexOf(match[1].toLowerCase()) + 1;
  return `${match[2]}-${String(month).padStart(2, "0")}-01`;
}

function logicalDate(record) {
  return (
    monthDateFromTitle(record.title) ||
    record.productionDates?.find((date) => date.logicalDate)?.logicalDate ||
    record.coverageStartDate?.logicalDate ||
    record.coverageEndDate?.logicalDate ||
    "1989-01-01"
  );
}

function firstPdf(record) {
  return (record.digitalObjects || []).find((object) => /pdf/i.test(object.objectType || object.objectFilename || object.objectUrl || ""));
}

function cleanLine(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function classifyChapter(matches) {
  const weights = {};
  for (const match of matches) weights[match.chapter] = (weights[match.chapter] || 0) + match.weight;
  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  const regional = weights.Regional || 0;
  const [topChapter, topWeight] = sorted[0] || ["Regional", 0];
  const secondWeight = sorted[1]?.[1] || 0;
  if (regional >= 18 || topWeight - secondWeight < 7) return "Regional";
  return topChapter;
}

function categoryFor(matches, hasOcrSignals) {
  if (hasOcrSignals) return "OCR-confirmed document lead";
  if (matches.some((match) => /memcon|telcon|conversation/i.test(match.q))) return "Memcon/telcon packet";
  if (matches.some((match) => /Aegean|Greek Turkish|Denktash|Incirlik|PKK/i.test(match.q))) return "High-value policy packet";
  return "Catalog search lead";
}

function sourceParts(record) {
  const ancestors = record.ancestors || [];
  const collection = ancestors.find((ancestor) => /collection/i.test(ancestor.levelOfDescription || ""));
  const series = ancestors.find((ancestor) => /series/i.test(ancestor.levelOfDescription || ""));
  return {
    collectionTitle: collection?.title || COLLECTION_TITLE,
    collectionNaid: collection?.naId || COLLECTION_NAID,
    seriesTitle: series?.title || SERIES_TITLE,
    seriesNaid: series?.naId || SERIES_NAID
  };
}

async function fetchJson(url, params) {
  const response = await fetch(`${url}?${params.toString()}`, {
    headers: { "x-api-key": API_KEY, Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`NARA request failed (${response.status}) for ${params.toString()}`);
  const text = await response.text();
  if (/^\s*</.test(text)) throw new Error(`NARA returned HTML for ${params.toString()}`);
  return JSON.parse(text);
}

async function runQuery(query) {
  const params = new URLSearchParams({
    q: query.q,
    ancestorNaId: SERIES_NAID,
    startDate: "1989",
    endDate: "1993",
    limit: "200"
  });
  const json = await fetchJson(`${PROXY_URL}/records/search`, params);
  const hits = json.body?.hits?.hits || [];
  return {
    query,
    total: json.body?.hits?.total?.value || json.body?.hits?.total || 0,
    hits: hits.map((hit) => ({
      score: hit._score || 0,
      record: hit._source?.record || hit._source || hit
    }))
  };
}

async function download(url, target, attempts = 3) {
  if (fs.existsSync(target) && fs.statSync(target).size > 0 && pageCountForLocalPdf(target)) return target;
  fs.rmSync(target, { force: true });
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await new Promise((resolve, reject) => {
        const get = (nextUrl) => {
          https
            .get(nextUrl, (response) => {
              if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                get(response.headers.location);
                return;
              }
              if (response.statusCode !== 200) {
                reject(new Error(`PDF download failed: ${response.statusCode}`));
                return;
              }
              const output = fs.createWriteStream(target);
              response.pipe(output);
              output.on("finish", () => output.close(resolve));
              output.on("error", reject);
            })
            .on("error", reject);
        };
        get(url);
      });
      return target;
    } catch (error) {
      fs.rmSync(target, { force: true });
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
    }
  }
  return target;
}

function pageCountForLocalPdf(pdfPath) {
  try {
    const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const match = info.match(/^Pages:\s+(\d+)/m);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

function extractSignals(ocrText, queryLabels) {
  const lines = ocrText.split(/\r?\n/).map(cleanLine);
  const signals = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const next = cleanLine(lines[index + 1] || "");
    const previous = cleanLine(lines[index - 1] || "");
    const block = `${previous} ${line} ${next}`;
    const entityMatch =
      /Mitsotakis|Papandreou|Zolotas|Samaras|Greece|Greek|Vassiliou|Denktash|Clerides|Cyprus|Cypriot|Ozal|Demirel|Yilmaz|Turkey|Turkish|Incirlik|PKK|Aegean|Greek-Turkish|Nicosia|Ankara/i.test(
        block
      );
    if (!line || line.length < 8 || !entityMatch || /^\[in Greek\]/i.test(line) || /^(Greece|Turkey|Cyprus) \(\d+\s*pp/i.test(line)) continue;
    let signal = line;
    if (/\bof$/i.test(line) && next.length > 4) {
      signal = `${line} ${next}`;
    } else if (/^(Re:|Subject:)/i.test(next) || (/Memorandum|Letter|Talking Points|Telephone|TELCON|MEMCON/i.test(line) && next.length > 12)) {
      signal = `${line} ${next}`;
    } else if (/^(Re:|Subject:)/i.test(line) && previous.length > 12) {
      signal = `${previous} ${line}`;
    }
    signal = signal.slice(0, 260);
    if (!signals.some((item) => item.toLowerCase() === signal.toLowerCase())) signals.push(signal);
    if (signals.length >= 8) break;
  }
  return signals;
}

function chapterFromEvidence(row) {
  const signalText = (row.documentSignals || []).join(" ");
  const labelText = row.queryLabels.join(" ");
  const evidence = `${signalText} ${signalText} ${signalText} ${labelText}`;
  const counts = {
    Greece: (evidence.match(/Mitsotakis|Papandreou|Zolotas|Samaras|Greece|Greek(?!-Turkish)/gi) || []).length,
    Cyprus: (evidence.match(/Vassiliou|Denktash|Clerides|Cyprus|Cypriot|Nicosia/gi) || []).length,
    Turkey: (evidence.match(/Ozal|Demirel|Yilmaz|Turkey|Turkish|Incirlik|PKK|Ankara/gi) || []).length
  };
  const regionalSignal = /Aegean|Greek-Turkish|Greece \/ Turkey \/ Cyprus/i.test(evidence);
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [topChapter, topCount] = ranked[0];
  const secondCount = ranked[1]?.[1] || 0;
  if (!topCount) return row.chapter?.name || "Regional";
  if (signalText && topCount > secondCount) return topChapter;
  if (regionalSignal && topCount - secondCount < 3) return "Regional";
  return topCount - secondCount >= 2 ? topChapter : "Regional";
}

async function ocrFirstPages(record, queryLabels) {
  const pdf = firstPdf(record);
  if (!pdf?.objectUrl) return { status: "No PDF available", pageCount: null, signals: [] };

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const pdfPath = path.join(CACHE_DIR, `${record.naId}.pdf`);
  const sidecarPath = path.join(CACHE_DIR, `${record.naId}.first-pages.txt`);
  const ocrPdfPath = path.join(CACHE_DIR, `${record.naId}.first-pages.pdf`);
  try {
    await download(pdf.objectUrl, pdfPath);
  } catch (error) {
    return { status: `PDF download failed: ${error.message}`, pageCount: null, signals: [] };
  }
  const pageCount = pageCountForLocalPdf(pdfPath);

  if (!fs.existsSync(sidecarPath) || fs.statSync(sidecarPath).size === 0) {
    try {
      execFileSync(
        "ocrmypdf",
        [
          "--skip-text",
          "--pages",
          "1-4",
          "--sidecar",
          sidecarPath,
          "--jobs",
          "4",
          "--output-type",
          "pdf",
          pdfPath,
          ocrPdfPath
        ],
        { stdio: "ignore" }
      );
    } catch (error) {
      return {
        status: `OCR failed: ${error.message}`,
        pageCount,
        signals: []
      };
    } finally {
      fs.rmSync(ocrPdfPath, { force: true });
    }
  }

  const ocrText = fs.existsSync(sidecarPath) ? fs.readFileSync(sidecarPath, "utf8") : "";
  return {
    status: ocrText.trim() ? "First four pages OCR reviewed" : "OCR returned no text",
    pageCount,
    signals: extractSignals(ocrText, queryLabels)
  };
}

async function mapLimit(items, limit, worker) {
  const queue = [...items];
  const results = [];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      results.push(await worker(item));
    }
  });
  await Promise.all(runners);
  return results;
}

function buildRows(searches) {
  const byNaid = new Map();
  for (const search of searches) {
    for (const hit of search.hits) {
      const record = hit.record;
      if (!record?.naId) continue;
      const key = String(record.naId);
      if (!byNaid.has(key)) {
        byNaid.set(key, {
          record,
          matches: [],
          score: 0,
          relevanceScore: 0
        });
      }
      const entry = byNaid.get(key);
      entry.matches.push(search.query);
      entry.score += search.query.weight + Math.min(Math.round(hit.score / 20), 8);
      entry.relevanceScore += hit.score || 0;
    }
  }

  return [...byNaid.values()]
    .map((entry) => {
      const queryLabels = uniq(entry.matches.map((match) => match.label));
      const chapterName = classifyChapter(entry.matches);
      const source = sourceParts(entry.record);
      const pdf = firstPdf(entry.record);
      const date = logicalDate(entry.record);
      return {
        id: `central-${entry.record.naId}`,
        recordSet: "Central Chronological Files lead",
        seriesNaid: SERIES_NAID,
        naid: String(entry.record.naId),
        title: entry.record.title || "Untitled chronological file",
        sortTitle: entry.record.title || "",
        date,
        sortDate: date,
        year: Number(date.slice(0, 4)),
        chapter: { number: chapterNumber.get(chapterName), name: chapterName },
        category: categoryFor(entry.matches, false),
        priority: "Catalog search lead",
        score: Math.round(entry.score),
        relevanceScore: Math.round(entry.relevanceScore),
        queryHits: uniq(entry.matches.map((match) => match.id)),
        queryLabels,
        levelOfDescription: entry.record.levelOfDescription || "",
        accessRestriction: entry.record.accessRestriction?.status || "",
        catalogUrl: catalogUrl(entry.record.naId),
        pdfUrl: pdf?.objectUrl || "",
        objectFilename: pdf?.objectFilename || "",
        objectCount: (entry.record.digitalObjects || []).length,
        ocrStatus: "Not OCR sampled",
        pageCount: null,
        documentSignals: [],
        source: {
          name: "National Archives Catalog",
          url: catalogUrl(SERIES_NAID),
          collection: source.collectionTitle,
          collectionNaid: source.collectionNaid,
          series: source.seriesTitle,
          seriesNaid: source.seriesNaid
        },
        frusVolume: FRUS_VOLUME
      };
    })
    .sort((a, b) => b.score - a.score || a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title));
}

function finishSourceNote(row) {
  const chapterName = chapterFromEvidence(row);
  row.chapter = { number: chapterNumber.get(chapterName), name: chapterName };
  const pageText = row.pageCount ? ` PDF extent: ${row.pageCount} pages.` : "";
  const ocrText = row.documentSignals.length
    ? ` First-pages OCR signals: ${row.documentSignals.slice(0, 3).join(" | ")}.`
    : ` OCR status: ${row.ocrStatus}.`;
  row.sourceNote = `Central Chronological Files lead. Catalog source: ${row.source.collection}, ${row.source.series}. File unit: ${row.title}. NAID ${row.naid}. Query hit(s): ${row.queryLabels.join(
    ", "
  )}. ${row.accessRestriction || "Access status not specified"}.${pageText}${ocrText} Catalog: ${row.catalogUrl}.`;
  row.rationale = row.documentSignals.length
    ? "First-pages OCR found document-index language that matches Eastern Mediterranean people, places, or conversation forms."
    : "Catalog full-text search links this monthly packet to Eastern Mediterranean search terms; open the PDF and inspect the packet index before selection.";
  row.category = categoryFor(row.queryHits.map((id) => QUERY_DEFINITIONS.find((query) => query.id === id)).filter(Boolean), row.documentSignals.length > 0);
  row.priority = row.documentSignals.length ? "Open packet first" : /memcon|telcon|conversation/i.test(row.queryLabels.join(" ")) ? "Memcon/telcon search lead" : "Policy search lead";
  return row;
}

async function main() {
  fs.mkdirSync("data", { recursive: true });
  fs.mkdirSync("reports", { recursive: true });

  console.error(`Searching Central Chronological Files (${SERIES_NAID})...`);
  const searches = [];
  for (const query of QUERY_DEFINITIONS) {
    console.error(`  ${query.id}: ${query.q}`);
    searches.push(await runQuery(query));
  }

  const rows = buildRows(searches);
  const selected = rows.slice(0, CANDIDATE_LIMIT);
  const selectedByNaid = new Map(selected.map((row) => [row.naid, row]));
  for (const naid of OCR_PRIORITY_NAIDS) {
    const row = rows.find((candidate) => candidate.naid === naid);
    if (row) selectedByNaid.set(naid, row);
  }

  const candidates = [...selectedByNaid.values()].sort(
    (a, b) => b.score - a.score || a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title)
  );

  const ocrTargets = [
    ...new Map(
      [
        ...OCR_PRIORITY_NAIDS.map((naid) => candidates.find((row) => row.naid === naid)).filter(Boolean),
        ...candidates.slice(0, OCR_LIMIT)
      ].map((row) => [row.naid, row])
    ).values()
  ].slice(0, OCR_LIMIT);

  console.error(`Central Chronology candidates: ${candidates.length}`);
  console.error(`OCR sampling first pages for ${ocrTargets.length} file units...`);
  await mapLimit(ocrTargets, 2, async (row) => {
    console.error(`  OCR ${row.naid} ${row.title}`);
    const ocr = await ocrFirstPages({ naId: row.naid, digitalObjects: [{ objectUrl: row.pdfUrl }] }, row.queryLabels);
    row.ocrStatus = ocr.status;
    row.pageCount = ocr.pageCount;
    row.documentSignals = ocr.signals;
  });

  const finished = candidates
    .map(finishSourceNote)
    .sort((a, b) => a.chapter.number - b.chapter.number || b.score - a.score || a.sortDate.localeCompare(b.sortDate));

  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      name: SERIES_TITLE,
      naid: SERIES_NAID,
      catalogUrl: catalogUrl(SERIES_NAID),
      collection: COLLECTION_TITLE,
      collectionNaid: COLLECTION_NAID
    },
    frusVolume: FRUS_VOLUME,
    queryDefinitions: QUERY_DEFINITIONS,
    queryTotals: searches.map((search) => ({
      id: search.query.id,
      q: search.query.q,
      total: search.total,
      returned: search.hits.length
    })),
    summary: {
      uniqueHits: rows.length,
      candidates: finished.length,
      ocrSampled: finished.filter((row) => row.ocrStatus !== "Not OCR sampled").length,
      ocrConfirmed: finished.filter((row) => row.documentSignals.length).length,
      byChapter: countBy(finished, (row) => row.chapter.name),
      byPriority: countBy(finished, (row) => row.priority)
    },
    files: finished
  };

  fs.writeFileSync("data/central-chronology-files.json", `${JSON.stringify(finished, null, 2)}\n`);
  fs.writeFileSync("data/central-chronology-files.js", mirrorJs("CENTRAL_CHRONOLOGY_FILES", finished));
  fs.writeFileSync("reports/central-chronology-374000108-eastmed.json", `${JSON.stringify(report, null, 2)}\n`);
}

function countBy(items, getter) {
  return items.reduce((counts, item) => {
    const key = getter(item) || "Unspecified";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
