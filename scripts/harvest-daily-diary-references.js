#!/usr/bin/env node

const fs = require("fs");
const { applyFrusSourceStyle } = require("./source-note-style");

const CATALOG_SEARCH_URL = "https://catalog.archives.gov/proxy/records/search";
const SERIES_NAID = "186322";
const SERIES_TITLE = "Presidential Daily Diary and Presidential Daily Backup Materials";
const COLLECTION_TITLE = "White House Office of Appointments and Scheduling Files";
const FRUS_VOLUME = {
  id: "frus1989-92v06",
  title: "Foreign Relations of the United States, 1989-1992, Volume VI, Eastern Mediterranean",
  url: "https://history.state.gov/historicaldocuments/frus1989-92v06",
  status: "Being Researched"
};

const DAILY_TERMS = [
  { id: "ozal", label: "Ozal", q: "Ozal", chapter: "Turkey", weight: 16 },
  { id: "evren", label: "Evren", q: "Evren", chapter: "Turkey", weight: 12 },
  { id: "demirel", label: "Demirel", q: "Demirel", chapter: "Turkey", weight: 14 },
  { id: "yilmaz", label: "Yilmaz", q: "Yilmaz", chapter: "Turkey", weight: 12 },
  { id: "mitsotakis", label: "Mitsotakis", q: "Mitsotakis", chapter: "Greece", weight: 14 },
  { id: "papandreou", label: "Papandreou", q: "Papandreou", chapter: "Greece", weight: 12 },
  { id: "zolotas", label: "Zolotas", q: "Zolotas", chapter: "Greece", weight: 12 },
  { id: "samaras", label: "Samaras", q: "Samaras", chapter: "Greece", weight: 14 },
  { id: "vassiliou", label: "Vassiliou", q: "Vassiliou", chapter: "Cyprus", weight: 14 },
  { id: "denktash", label: "Denktash", q: "Denktash", chapter: "Cyprus", weight: 12 },
  { id: "greece", label: "Greece", q: "Greece", chapter: "Greece", weight: 6 },
  { id: "cyprus", label: "Cyprus", q: "Cyprus", chapter: "Cyprus", weight: 7 },
  { id: "turkey", label: "Turkey", q: "Turkey", chapter: "Turkey", weight: 6 },
  { id: "aegean", label: "Aegean", q: "Aegean", chapter: "Regional", weight: 12 },
  { id: "eastmed", label: "Eastern Mediterranean", q: "Eastern Mediterranean", chapter: "Regional", weight: 12 },
  { id: "incirlik", label: "Incirlik", q: "Incirlik", chapter: "Turkey", weight: 12 }
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

function searchWithinUrl(naid, q = "") {
  const params = new URLSearchParams({ limit: "100" });
  if (q) params.set("q", q);
  return `https://catalog.archives.gov/search-within/${naid}?${params.toString()}`;
}

function mirrorJs(variableName, value) {
  return `window.${variableName} = ${JSON.stringify(value, null, 2)};\n`;
}

async function fetchCatalog(params) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${CATALOG_SEARCH_URL}?${params.toString()}`, {
        headers: { Accept: "application/json", "User-Agent": "GCT-89-92-source-harvest" }
      });
      if (!response.ok) throw new Error(`Catalog request failed (${response.status}) for ${params.toString()}`);
      const text = await response.text();
      if (/^\s*</.test(text)) throw new Error(`Catalog returned HTML for ${params.toString()}`);
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 700));
    }
  }
  throw lastError;
}

function totalValue(json) {
  const total = json.body?.hits?.total;
  if (typeof total === "number") return total;
  return total?.value || 0;
}

async function searchAncestor(params) {
  const json = await fetchCatalog(new URLSearchParams({ ancestorNaId: SERIES_NAID, ...params }));
  return {
    total: totalValue(json),
    records: (json.body?.hits?.hits || []).map((hit) => ({
      score: hit._score || 0,
      record: hit._source?.record || hit._source || hit
    })).filter((hit) => hit.record?.naId)
  };
}

async function fetchByNaid(naid) {
  const json = await fetchCatalog(new URLSearchParams({ naId: String(naid) }));
  return json.body?.hits?.hits?.[0]?._source?.record || null;
}

function dateFromTitle(value) {
  const match = String(value || "").match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (match) return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  const item = String(value || "").match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(1989|1990|1991|1992|1993)\b/i
  );
  if (!item) return "";
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
  ].indexOf(item[1].toLowerCase()) + 1;
  return `${item[3]}-${String(month).padStart(2, "0")}-${item[2].padStart(2, "0")}`;
}

function slashDate(date) {
  const [year, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
}

function firstDigitalObject(record) {
  return (record.digitalObjects || []).find((object) => /pdf|gif|jpeg|image/i.test(object.objectType || object.objectFilename || object.objectUrl || ""));
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function recordTerms(record) {
  const terms = new Set();
  for (const participant of record.participants || []) {
    if (/George H\. W\. Bush|NATO|allied representatives/i.test(participant)) continue;
    const words = participant.replace(/[(),.]/g, " ").split(/\s+/).filter(Boolean);
    const last = words.at(-1);
    if (last && last.length > 2) terms.add(last);
  }
  for (const country of record.countries || []) {
    if (country !== "United States") terms.add(country);
  }
  const title = record.documentTitle || record.title || "";
  for (const term of DAILY_TERMS) {
    if (new RegExp(term.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(title)) terms.add(term.label);
  }
  return [...terms];
}

function chapterForText(text, fallback = "Regional") {
  const counts = {
    Greece: (text.match(/Mitsotakis|Papandreou|Zolotas|Samaras|Greece|Greek|Athens/i) || []).length,
    Cyprus: (text.match(/Vassiliou|Denktash|Clerides|Cyprus|Cypriot|Nicosia/i) || []).length,
    Turkey: (text.match(/Ozal|Turgat|Turgut|Evren|Demirel|Yilmaz|Turkey|Turkish|Incirlik|Ankara/i) || []).length
  };
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!ranked[0]?.[1]) return fallback;
  if (ranked[0][1] === ranked[1]?.[1]) return "Regional";
  return ranked[0][0];
}

function countriesForText(text, chapter) {
  const countries = new Set(["United States"]);
  if (chapter === "Greece" || /Mitsotakis|Papandreou|Zolotas|Samaras|Greece|Greek|Athens/i.test(text)) countries.add("Greece");
  if (chapter === "Cyprus" || /Vassiliou|Denktash|Clerides|Cyprus|Cypriot|Nicosia/i.test(text)) countries.add("Cyprus");
  if (chapter === "Turkey" || /Ozal|Turgat|Turgut|Evren|Demirel|Yilmaz|Turkey|Turkish|Incirlik|Ankara/i.test(text)) countries.add("Turkey");
  return [...countries];
}

function compactDailyReference(record, queryLabels, matchBasis) {
  const object = firstDigitalObject(record);
  return applyFrusSourceStyle({
    id: `daily-diary-ref-${record.naId}`,
    naid: String(record.naId),
    title: record.title || "Presidential Daily Diary reference",
    date: dateFromTitle(record.title) || record.inclusiveStartDate?.logicalDate || record.coverageStartDate?.logicalDate || "",
    levelOfDescription: record.levelOfDescription || "",
    accessRestriction: record.accessRestriction?.status || "",
    catalogUrl: catalogUrl(record.naId),
    pdfUrl: object?.objectUrl || "",
    objectFilename: object?.objectFilename || "",
    objectCount: (record.digitalObjects || []).length,
    scopeAndContentNote: clean(record.scopeAndContentNote),
    matchBasis,
    queryLabels,
    source: {
      name: SERIES_TITLE,
      url: catalogUrl(SERIES_NAID),
      collection: COLLECTION_TITLE,
      series: SERIES_TITLE,
      seriesNaid: SERIES_NAID
    },
    sourceNote: ""
  });
}

function itemLead(record, queryLabels) {
  const date = dateFromTitle(record.title) || record.inclusiveStartDate?.logicalDate || "1989-01-01";
  const text = `${record.title || ""} ${record.scopeAndContentNote || ""}`;
  const chapter = chapterForText(text);
  const reference = compactDailyReference(record, queryLabels, "Daily Diary item-level description");
  return {
    ...reference,
    id: `daily-diary-item-${record.naId}`,
    recordSet: "Presidential Daily Diary item",
    sortDate: date,
    year: Number(date.slice(0, 4)),
    documentTitle: record.title || "Presidential Daily Diary item",
    chapter: { number: chapterNumber.get(chapter), name: chapter },
    category: "Schedule corroboration",
    score: 120 + queryLabels.length * 6,
    countries: countriesForText(text, chapter),
    topics: ["Presidential Daily Diary", "Meetings and calls", ...queryLabels],
    scoutUrls: [searchWithinUrl(SERIES_NAID, queryLabels[0] || "")]
  };
}

function itemQueryLabels(record) {
  const text = `${record.title || ""} ${record.scopeAndContentNote || ""}`;
  return DAILY_TERMS.filter((term) => new RegExp(term.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text) || (term.id === "ozal" && /Turgat Ozal/i.test(text))).map((term) => term.label);
}

async function buildItemLeads() {
  const search = await searchAncestor({ q: "*", levelOfDescription: "item", limit: "100" });
  return search.records
    .map((hit) => hit.record)
    .map((record) => ({ record, queryLabels: itemQueryLabels(record) }))
    .filter((entry) => entry.queryLabels.length)
    .map((entry) => itemLead(entry.record, entry.queryLabels))
    .sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title));
}

async function buildFileReferenceIndex(recordDates) {
  const byDate = new Map();
  for (const date of [...new Set(recordDates)].sort()) {
    let search;
    try {
      search = await searchAncestor({ title: slashDate(date), limit: "10" });
    } catch {
      continue;
    }
    for (const hit of search.records) {
      const hitDate = dateFromTitle(hit.record.title);
      if (hitDate !== date) continue;
      if (!/Presidential Daily (Diary|Backup)|President's Daily Diary Entry/i.test(hit.record.title || "")) continue;
      if (/Block Calendar/i.test(hit.record.title || "")) continue;
      if (!byDate.has(hitDate)) byDate.set(hitDate, new Map());
      const records = byDate.get(hitDate);
      const key = String(hit.record.naId);
      const label = /Backup/i.test(hit.record.title || "") ? "Daily Backup" : "Daily Diary";
      records.set(key, { record: hit.record, queryLabels: [label], score: hit.score || 0 });
    }
  }
  return byDate;
}

function matchingFileReferences(record, referenceIndex) {
  return [...(referenceIndex.get(record.date)?.values() || [])]
    .sort((a, b) => {
      const aRank = /Daily Diary Entry/i.test(a.record.title || "") ? 0 : /Daily Diary/i.test(a.record.title || "") ? 1 : 2;
      const bRank = /Daily Diary Entry/i.test(b.record.title || "") ? 0 : /Daily Diary/i.test(b.record.title || "") ? 1 : 2;
      return aRank - bRank || b.score - a.score || (a.record.title || "").localeCompare(b.record.title || "");
    })
    .slice(0, 4)
    .map((match) =>
      compactDailyReference(
        match.record,
        match.queryLabels,
        "same-date Daily Diary/Backup folder"
      )
    );
}

function updateNaraScoutLeads(itemLeads) {
  const path = "data/nara-scout-leads.json";
  const existing = JSON.parse(fs.readFileSync(path, "utf8")).filter((lead) => !String(lead.id || "").startsWith("daily-diary-item-"));
  const output = [...existing, ...itemLeads].sort(
    (a, b) => a.chapter.number - b.chapter.number || (b.score || 0) - (a.score || 0) || (a.sortDate || a.date).localeCompare(b.sortDate || b.date)
  );
  fs.writeFileSync(path, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync("data/nara-scout-leads.js", mirrorJs("NARA_SCOUT_LEADS", output));
  return output;
}

async function updateRecords(itemLeads, referenceIndex) {
  const records = JSON.parse(fs.readFileSync("data/records.json", "utf8"));
  const itemRefsByDate = new Map(itemLeads.map((lead) => [lead.date, lead]));
  for (const record of records) {
    const refs = matchingFileReferences(record, referenceIndex);
    const item = itemRefsByDate.get(record.date);
    const recordText = `${record.documentTitle || ""} ${(record.participants || []).join(" ")} ${(record.countries || []).join(" ")}`;
    if (item && recordTerms(record).some((term) => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(`${item.scopeAndContentNote} ${recordText}`))) {
      refs.unshift({
        ...item,
        id: `daily-diary-ref-${item.naid}`,
        matchBasis: "same-date item-level Daily Diary description"
      });
    }
    const deduped = [...new Map(refs.map((ref) => [ref.naid, applyFrusSourceStyle(ref)])).values()];
    if (deduped.length) record.scheduleReferences = deduped;
    else delete record.scheduleReferences;
  }
  fs.writeFileSync("data/records.json", `${JSON.stringify(records, null, 2)}\n`);
  fs.writeFileSync("data/records.js", mirrorJs("GCT_RECORDS", records));
  return records;
}

async function buildSourcePool(root, itemLeads) {
  const childSearch = await searchAncestor({ q: "*", limit: "1" });
  const onlineSearch = await searchAncestor({ q: "*", availableOnline: "true", limit: "1" });
  const itemLabelCounts = itemLeads.flatMap((lead) => lead.queryLabels).reduce((counts, label) => {
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {});
  const queryTotals = Object.entries(itemLabelCounts).map(([label, total]) => ({
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    q: label,
    label,
    total,
    returned: total
  }));
  return applyFrusSourceStyle({
    id: "presidential-daily-diary",
    label: "Presidential Daily Diary and Backup",
    shortLabel: "Daily Diary",
    naid: SERIES_NAID,
    title: root.title || SERIES_TITLE,
    levelOfDescription: root.levelOfDescription || "series",
    localIdentifier: root.localIdentifier || "",
    dateRange: "1989-01-20 to 1993-01-20",
    catalogUrl: catalogUrl(SERIES_NAID),
    searchWithinUrl: searchWithinUrl(SERIES_NAID),
    requestedUrl: catalogUrl(SERIES_NAID),
    accessRestriction: root.accessRestriction?.status || "",
    useRestriction: root.useRestriction?.status || "",
    scopeAndContentNote: root.scopeAndContentNote || "",
    childTotal: childSearch.total,
    onlineChildTotal: onlineSearch.total,
    harvestedChildren: 0,
    queryHitFiles: itemLeads.length,
    queryHitTotal: queryTotals.reduce((sum, query) => sum + query.total, 0),
    priority: "Schedule corroboration source",
    note: "User-requested Presidential Daily Diary and Daily Backup source for meetings, calls, schedules, attendees, and call-status corroboration.",
    queryTotals,
    leads: itemLeads.map((lead) => ({
      naid: lead.naid,
      title: lead.title,
      date: lead.date,
      catalogUrl: lead.catalogUrl,
      queryLabels: lead.queryLabels,
      sourceNote: lead.sourceNote,
      researchNote: lead.researchNote
    })),
    children: [],
    frusVolume: FRUS_VOLUME,
    source: {
      name: SERIES_TITLE,
      url: catalogUrl(SERIES_NAID),
      collection: COLLECTION_TITLE,
      series: SERIES_TITLE,
      seriesNaid: SERIES_NAID
    },
    sourceNote: ""
  });
}

function updateRequestedSources(sourcePool) {
  const path = "data/requested-source-series.json";
  const existing = JSON.parse(fs.readFileSync(path, "utf8")).filter((source) => source.id !== sourcePool.id);
  const dailyFileIndex = existing.findIndex((source) => source.id === "presidential-daily-file");
  const insertAt = dailyFileIndex >= 0 ? dailyFileIndex + 1 : existing.length;
  existing.splice(insertAt, 0, sourcePool);
  fs.writeFileSync(path, `${JSON.stringify(existing, null, 2)}\n`);
  fs.writeFileSync("data/requested-source-series.js", mirrorJs("REQUESTED_SOURCE_SERIES", existing));
  return existing;
}

async function main() {
  fs.mkdirSync("reports", { recursive: true });
  console.error(`Fetching ${SERIES_TITLE} (${SERIES_NAID})...`);
  const root = await fetchByNaid(SERIES_NAID);
  const itemLeads = await buildItemLeads();
  console.error(`Daily Diary item leads: ${itemLeads.length}`);
  const existingRecords = JSON.parse(fs.readFileSync("data/records.json", "utf8"));
  const referenceIndex = await buildFileReferenceIndex(existingRecords.map((record) => record.date));
  const indexedReferences = [...referenceIndex.values()].reduce((sum, records) => sum + records.size, 0);
  console.error(`Indexed Daily Diary/Backup references: ${indexedReferences}`);
  const records = await updateRecords(itemLeads, referenceIndex);
  const scoutLeads = updateNaraScoutLeads(itemLeads);
  const sourcePool = await buildSourcePool(root, itemLeads);
  const sourcePools = updateRequestedSources(sourcePool);
  const recordsWithReferences = records.filter((record) => record.scheduleReferences?.length).length;
  const references = records.reduce((sum, record) => sum + (record.scheduleReferences?.length || 0), 0);
  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      name: SERIES_TITLE,
      naid: SERIES_NAID,
      catalogUrl: catalogUrl(SERIES_NAID),
      collection: COLLECTION_TITLE
    },
    frusVolume: FRUS_VOLUME,
    summary: {
      itemLeads: itemLeads.length,
      recordsWithReferences,
      scheduleReferences: references,
      requestedSourcePools: sourcePools.length,
      scoutLeads: scoutLeads.length
    },
    itemLeads,
    recordsWithReferences: records
      .filter((record) => record.scheduleReferences?.length)
      .map((record) => ({
        naid: record.naid,
        date: record.date,
        title: record.documentTitle || record.title,
        references: record.scheduleReferences
      })),
    sourcePool
  };
  fs.writeFileSync("reports/daily-diary-references-186322-eastmed.json", `${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
