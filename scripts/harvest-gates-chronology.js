#!/usr/bin/env node

const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { applyFrusSourceStyle } = require("./source-note-style");

const PROXY_URL = "https://nara-proxy.mzqmpgyvdv.workers.dev";
const API_KEY = process.env.NARA_API_KEY || "C6O0DyEcap6taVb24zymF5AOMQvwTXsa7q0ZH8cN";
const SERIES_NAID = "2554841";
const SERIES_TITLE = "Robert M. Gates' Chronological Files";
const COLLECTION_TITLE = "Records of the National Security Council (George H. W. Bush Administration)";
const COLLECTION_NAID = "2163580";
const CACHE_DIR = process.env.GCT_GATES_CHRON_CACHE || path.join(os.tmpdir(), "gct-gates-chronology");
const OCR_LIMIT = Number(process.env.GCT_GATES_CHRON_OCR_LIMIT || 14);
const FULL_OCR_LIMIT = Number(process.env.GCT_GATES_CHRON_FULL_OCR_LIMIT || 7);

const FRUS_VOLUME = {
  id: "frus1989-92v06",
  title: "Foreign Relations of the United States, 1989-1992, Volume VI, Eastern Mediterranean",
  url: "https://history.state.gov/historicaldocuments/frus1989-92v06",
  status: "Being Researched"
};

const QUERY_DEFINITIONS = [
  { id: "greece", q: "Greece", chapter: "Greece", label: "Greece", weight: 6 },
  { id: "greek", q: "Greek", chapter: "Greece", label: "Greek", weight: 5 },
  { id: "papandreou", q: "Papandreou", chapter: "Greece", label: "Papandreou", weight: 13 },
  { id: "mitsotakis", q: "Mitsotakis", chapter: "Greece", label: "Mitsotakis", weight: 13 },
  { id: "cyprus", q: "Cyprus", chapter: "Cyprus", label: "Cyprus", weight: 8 },
  { id: "cypriot", q: "Cypriot", chapter: "Cyprus", label: "Cypriot", weight: 8 },
  { id: "vassiliou", q: "Vassiliou", chapter: "Cyprus", label: "Vassiliou", weight: 14 },
  { id: "vassiliou-cyprus", q: "Vassiliou Cyprus", chapter: "Cyprus", label: "Vassiliou + Cyprus", weight: 16 },
  { id: "denktash", q: "Denktash", chapter: "Cyprus", label: "Denktash", weight: 13 },
  { id: "turkey", q: "Turkey", chapter: "Turkey", label: "Turkey", weight: 6 },
  { id: "turkish", q: "Turkish", chapter: "Turkey", label: "Turkish", weight: 6 },
  { id: "ozal", q: "Ozal", chapter: "Turkey", label: "Ozal", weight: 13 },
  { id: "ozal-turkey", q: "Ozal Turkey", chapter: "Turkey", label: "Ozal + Turkey", weight: 16 },
  { id: "demirel", q: "Demirel", chapter: "Turkey", label: "Demirel", weight: 13 },
  { id: "aegean", q: "Aegean", chapter: "Regional", label: "Aegean", weight: 14 },
  {
    id: "eastern-mediterranean",
    q: "Eastern Mediterranean",
    chapter: "Regional",
    label: "Eastern Mediterranean",
    weight: 14
  },
  {
    id: "greece-turkey-cyprus",
    q: "Greece Turkey Cyprus",
    chapter: "Regional",
    label: "Greece / Turkey / Cyprus",
    weight: 14
  },
  { id: "memcon", q: "memcon", chapter: "Regional", label: "memcon", weight: 8 },
  { id: "telcon", q: "telcon", chapter: "Regional", label: "telcon", weight: 10 },
  {
    id: "moc",
    q: "memorandum of conversation",
    chapter: "Regional",
    label: "memorandum of conversation",
    weight: 6
  },
  {
    id: "telephone-conversation",
    q: "telephone conversation",
    chapter: "Regional",
    label: "telephone conversation",
    weight: 6
  }
];

const FULL_OCR_PRIORITY_NAIDS = [
  "470436940",
  "470436937",
  "470436938",
  "470436942",
  "470436933",
  "470436934",
  "470436948"
];

const OCR_PRIORITY_NAIDS = [
  ...FULL_OCR_PRIORITY_NAIDS,
  "470436950",
  "470436949",
  "470436945",
  "470436946",
  "470436941",
  "470436944",
  "470436931"
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

function titleDate(record) {
  const title = record.title || "";
  const year = title.match(/\b(1989|1990|1991)\b/);
  return year ? `${year[1]}-01-01` : "1989-01-01";
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

function classifyChapter(matches) {
  const weights = {};
  for (const match of matches) weights[match.chapter] = (weights[match.chapter] || 0) + match.weight;
  const ranked = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  const [topChapter, topWeight] = ranked[0] || ["Regional", 0];
  const secondWeight = ranked[1]?.[1] || 0;
  if ((weights.Regional || 0) >= 20 || topWeight - secondWeight < 7) return "Regional";
  return topChapter;
}

function priorityFor(row) {
  const text = `${row.documentSignals.join(" ")} ${row.queryLabels.join(" ")}`;
  if (/ambassador|ambassadorship|appointment|candidacy|candidate|personnel/i.test(text) && /Cyprus|Greece|Turkey|Greek|Turkish/i.test(text)) {
    return "Personnel / appointment context";
  }
  if (
    (row.documentSignals || []).length &&
    /SUBJECT:.*Ozal|Telephone Call.*Ozal|Memorandum.*Papandreou|Papandreou.*Memorandum|Vassiliou.*Denktash|Denktash.*Vassiliou|Cyprus issue|Aegean/i.test(text)
  ) {
    return "Open packet first";
  }
  if ((row.documentSignals || []).length) return "Peripheral OCR hit";
  if (!row.queryLabels.length) return "Series coverage";
  if (/Vassiliou|Ozal|Greece \/ Turkey \/ Cyprus|Eastern Mediterranean|Cyprus/i.test(row.queryLabels.join(" "))) {
    return "High-value EastMed search lead";
  }
  if (/memcon|telcon|conversation/i.test(row.queryLabels.join(" "))) return "Memcon/telcon search lead";
  return "Series coverage";
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
    endDate: "1992",
    limit: "100"
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

async function fetchChildren() {
  const params = new URLSearchParams({ q: "*", ancestorNaId: SERIES_NAID, limit: "100" });
  const json = await fetchJson(`${PROXY_URL}/records/search`, params);
  return (json.body?.hits?.hits || [])
    .map((hit) => hit._source?.record || hit._source || hit)
    .filter(Boolean)
    .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
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

function extractSignals(ocrText) {
  const lines = ocrText.split(/\r?\n/).map(cleanLine);
  const candidates = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const next = cleanLine(lines[index + 1] || "");
    const previous = cleanLine(lines[index - 1] || "");
    const block = `${previous} ${line} ${next}`;
    const entityMatch =
      /Papandreou|Mitsotakis|Vassiliou|Denktash|Ozal|Greece|Greek|Cyprus|Cypriot|Turkey|Turkish|Aegean|Eastern Mediterranean|Ankara|Athens|Nicosia/i.test(
        block
      );
    if (!line || line.length < 8 || !entityMatch) continue;
    let signal = line;
    if (/\bof$/i.test(line) && next.length > 4) {
      signal = `${line} ${next}`;
    } else if (/^(Re:|Subject:)/i.test(next) || (/Memorandum|Letter|Talking Points|Telephone|TELCON|MEMCON|Appointment|Ambassador/i.test(line) && next.length > 12)) {
      signal = `${line} ${next}`;
    } else if (/^(Re:|Subject:)/i.test(line) && previous.length > 12) {
      signal = `${previous} ${line}`;
    }
    signal = signal.slice(0, 260);
    if (candidates.some((item) => item.signal.toLowerCase() === signal.toLowerCase())) continue;
    const scoreText = `${previous} ${signal} ${next}`;
    let score = 0;
    if (/Vassiliou|Denktash|Ozal|Papandreou|Mitsotakis/i.test(scoreText)) score += 30;
    if (/Memorandum of Conversation|MEMCON|Memcon|Telephone Call|Telephone Conversation|TELCON|Telcon/i.test(scoreText)) score += 22;
    if (/Cyprus|Cypriot|Greece|Greek|Turkey|Turkish|Aegean|Eastern Mediterranean/i.test(scoreText)) score += 10;
    if (/ambassador|ambassadorship|appointment|candidacy|candidate|personnel/i.test(scoreText)) score += 8;
    if (/^(SUBJECT|Re:)|\bSUBJECT:/i.test(scoreText)) score += 5;
    candidates.push({ signal, score, index });
  }
  return candidates
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 8)
    .map((item) => item.signal);
}

async function ocrPages(row, full = false) {
  if (!row.pdfUrl) return { status: "No PDF available", pageCount: null, signals: [] };
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const pdfPath = path.join(CACHE_DIR, `${row.naid}.pdf`);
  const mode = full ? "full" : "first-pages";
  const sidecarPath = path.join(CACHE_DIR, `${row.naid}.${mode}.txt`);
  const ocrPdfPath = path.join(CACHE_DIR, `${row.naid}.${mode}.pdf`);

  try {
    await download(row.pdfUrl, pdfPath);
  } catch (error) {
    return { status: `PDF download failed: ${error.message}`, pageCount: null, signals: [] };
  }

  const pageCount = pageCountForLocalPdf(pdfPath);
  if (!fs.existsSync(sidecarPath) || fs.statSync(sidecarPath).size === 0) {
    try {
      const args = ["--skip-text"];
      if (!full) args.push("--pages", "1-5");
      args.push("--sidecar", sidecarPath, "--jobs", "4", "--output-type", "pdf", pdfPath, ocrPdfPath);
      execFileSync("ocrmypdf", args, { stdio: "ignore" });
    } catch (error) {
      return { status: `OCR failed: ${error.message}`, pageCount, signals: [] };
    } finally {
      fs.rmSync(ocrPdfPath, { force: true });
    }
  }

  const ocrText = fs.existsSync(sidecarPath) ? fs.readFileSync(sidecarPath, "utf8") : "";
  return {
    status: ocrText.trim() ? (full ? "Full PDF OCR reviewed" : "First five pages OCR reviewed") : "OCR returned no text",
    pageCount,
    signals: extractSignals(ocrText)
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

function chapterFromEvidence(row) {
  const signalText = (row.documentSignals || []).join(" ");
  const labelText = row.queryLabels.join(" ");
  const evidence = `${signalText} ${signalText} ${signalText} ${labelText}`;
  const counts = {
    Greece: (evidence.match(/Mitsotakis|Papandreou|Greece|Greek(?!-Turkish)|Athens/gi) || []).length,
    Cyprus: (evidence.match(/Vassiliou|Denktash|Cyprus|Cypriot|Nicosia/gi) || []).length,
    Turkey: (evidence.match(/Ozal|Turkey|Turkish|Ankara/gi) || []).length
  };
  const regionalSignal = /Aegean|Eastern Mediterranean|Greece \/ Turkey \/ Cyprus/i.test(evidence);
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [topChapter, topCount] = ranked[0];
  const secondCount = ranked[1]?.[1] || 0;
  if (!topCount) return row.chapter?.name || "Regional";
  if (signalText && topCount > secondCount) return topChapter;
  if (regionalSignal && topCount - secondCount < 3) return "Regional";
  return topCount - secondCount >= 2 ? topChapter : "Regional";
}

function buildRows(records, searches) {
  const matchesByNaid = new Map();
  for (const search of searches) {
    for (const hit of search.hits) {
      const record = hit.record;
      if (!record?.naId) continue;
      const key = String(record.naId);
      if (!matchesByNaid.has(key)) matchesByNaid.set(key, { matches: [], score: 0, relevanceScore: 0 });
      const entry = matchesByNaid.get(key);
      entry.matches.push(search.query);
      entry.score += search.query.weight + Math.min(Math.round(hit.score / 25), 7);
      entry.relevanceScore += hit.score || 0;
    }
  }

  return records.map((record) => {
    const matchEntry = matchesByNaid.get(String(record.naId)) || { matches: [], score: 0, relevanceScore: 0 };
    const queryLabels = uniq(matchEntry.matches.map((match) => match.label));
    const chapterName = matchEntry.matches.length ? classifyChapter(matchEntry.matches) : "Regional";
    const pdf = firstPdf(record);
    const source = sourceParts(record);
    const date = titleDate(record);
    const row = {
      id: `gates-chron-${record.naId}`,
      recordSet: "Gates chronological file",
      seriesNaid: SERIES_NAID,
      naid: String(record.naId),
      title: record.title || "Untitled chronological file",
      sortTitle: record.title || "",
      date,
      sortDate: date,
      year: Number(date.slice(0, 4)),
      chapter: { number: chapterNumber.get(chapterName), name: chapterName },
      category: matchEntry.matches.length ? "Catalog search lead" : "Complete series coverage",
      priority: "Series coverage",
      score: Math.round(matchEntry.score),
      relevanceScore: Math.round(matchEntry.relevanceScore),
      queryHits: uniq(matchEntry.matches.map((match) => match.id)),
      queryLabels,
      levelOfDescription: record.levelOfDescription || "",
      accessRestriction: record.accessRestriction?.status || "",
      catalogUrl: catalogUrl(record.naId),
      pdfUrl: pdf?.objectUrl || "",
      objectFilename: pdf?.objectFilename || "",
      objectCount: (record.digitalObjects || []).length,
      ocrStatus: "Not OCR sampled",
      pageCount: null,
      documentSignals: [],
      source: {
        name: "National Archives Catalog",
        url: catalogUrl(SERIES_NAID),
        collection: source.collectionTitle,
        collectionNaId: source.collectionNaid,
        series: source.seriesTitle,
        seriesNaid: source.seriesNaid
      },
      frusVolume: FRUS_VOLUME
    };
    row.priority = priorityFor(row);
    return row;
  });
}

function finishSourceNote(row) {
  const chapterName = chapterFromEvidence(row);
  row.chapter = { number: chapterNumber.get(chapterName), name: chapterName };
  row.priority = priorityFor(row);
  row.category = row.documentSignals.length
    ? "OCR-confirmed document lead"
    : row.queryLabels.length
      ? "Catalog search lead"
      : "Complete series coverage";
  const pageText = row.pageCount ? ` PDF extent: ${row.pageCount} pages.` : "";
  const ocrText = row.documentSignals.length
    ? ` OCR signals: ${row.documentSignals.slice(0, 3).join(" | ")}.`
    : ` OCR status: ${row.ocrStatus}.`;
  row.rationale = row.documentSignals.length
    ? "OCR found Gates chronological-file text matching Eastern Mediterranean people, places, or conversation forms."
    : row.queryLabels.length
      ? "Catalog full-text search links this Gates chronological packet to Eastern Mediterranean terms; inspect the packet before selection."
      : "Included to document complete review of the Gates chronological series.";
  row.sourceNote = `Series review: Robert M. Gates' Chronological Files, National Security Council, George H. W. Bush Presidential Records. File unit: ${
    row.title
  }. NAID ${row.naid}. Query hit(s): ${row.queryLabels.join(", ") || "none"}. ${row.accessRestriction || "Access status not specified"}.${
    pageText
  }${ocrText} Catalog: ${row.catalogUrl}.`;
  return applyFrusSourceStyle(row);
}

async function main() {
  fs.mkdirSync("data", { recursive: true });
  fs.mkdirSync("reports", { recursive: true });

  console.error(`Fetching ${SERIES_TITLE} (${SERIES_NAID}) children...`);
  const records = await fetchChildren();
  console.error(`File units: ${records.length}`);

  console.error("Running EastMed full-text searches within the series...");
  const searches = [];
  for (const query of QUERY_DEFINITIONS) {
    console.error(`  ${query.id}: ${query.q}`);
    searches.push(await runQuery(query));
  }

  const rows = buildRows(records, searches);
  const ranked = [...rows].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  const fullOcrTargets = FULL_OCR_PRIORITY_NAIDS.map((naid) => rows.find((row) => row.naid === naid))
    .filter(Boolean)
    .slice(0, FULL_OCR_LIMIT);
  const fullOcrNaids = new Set(fullOcrTargets.map((row) => row.naid));
  const ocrTargets = [
    ...new Map(
      [
        ...fullOcrTargets,
        ...OCR_PRIORITY_NAIDS.map((naid) => rows.find((row) => row.naid === naid)).filter(Boolean),
        ...ranked.filter((row) => row.score > 0).slice(0, OCR_LIMIT)
      ].map((row) => [row.naid, row])
    ).values()
  ].slice(0, OCR_LIMIT);

  console.error(`OCR sampling ${ocrTargets.length} file units (${fullOcrTargets.length} full-PDF OCR passes)...`);
  await mapLimit(ocrTargets, 2, async (row) => {
    const full = fullOcrNaids.has(row.naid);
    console.error(`  OCR ${row.naid} ${row.title}${full ? " (full)" : ""}`);
    const ocr = await ocrPages(row, full);
    row.ocrStatus = ocr.status;
    row.pageCount = ocr.pageCount;
    row.documentSignals = ocr.signals;
  });

  const finished = rows
    .map(finishSourceNote)
    .sort((a, b) => a.sortTitle.localeCompare(b.sortTitle));

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
      fileUnits: finished.length,
      withDigitalObjects: finished.filter((row) => row.objectCount).length,
      queryHitFiles: finished.filter((row) => row.queryLabels.length).length,
      ocrSampled: finished.filter((row) => row.ocrStatus !== "Not OCR sampled").length,
      ocrConfirmed: finished.filter((row) => row.documentSignals.length).length,
      byChapter: countBy(finished, (row) => row.chapter.name),
      byPriority: countBy(finished, (row) => row.priority)
    },
    files: finished
  };

  fs.writeFileSync("data/gates-chron-files.json", `${JSON.stringify(finished, null, 2)}\n`);
  fs.writeFileSync("data/gates-chron-files.js", mirrorJs("GATES_CHRON_FILES", finished));
  fs.writeFileSync("reports/gates-chronology-2554841-eastmed.json", `${JSON.stringify(report, null, 2)}\n`);
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
