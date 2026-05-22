#!/usr/bin/env node

const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const PROXY_URL = "https://nara-proxy.mzqmpgyvdv.workers.dev";
const API_KEY = process.env.NARA_API_KEY || "C6O0DyEcap6taVb24zymF5AOMQvwTXsa7q0ZH8cN";
const NARA_SCOUT_URL = "https://therealjameswilson.github.io/nara-scout/";
const BUSH_MEMCONS_URL =
  "https://www.bush41library.gov/digital-research-room/about-textual-collections/memcons-and-telcons";
const BLACKWILL_SERIES_NAID = "2554653";
const FRUS_VOLUME = {
  id: "frus1989-92v06",
  title: "Foreign Relations of the United States, 1989-1992, Volume VI, Eastern Mediterranean",
  url: "https://history.state.gov/historicaldocuments/frus1989-92v06",
  status: "Being Researched"
};

const BUSH41_COLLECTIONS =
  "138924378,595138,2163559,567670,472456042,2163595,2163571,488763126,2163588,720635,2163589,650839,284825749,2163563,2163599,488763107,2163594,2163570,2163558,2103233,488763114,2163600,2579957,2163569,2575518,2163581,2163580,2133275,2163582,2163565,2163587,2163575,2163562,2163576,2163584,2575614,2163593,488763132,2163556,2577734,578954,2163572,2163566,2163561,2163573,2578586,2163596,2163590,580456,2163574,490670241,2163567,573356,2163578,2575552,2579595,2163585,2163568,2163597,2163579,2579969,2163592,572260,922149,891537,650835,2579439,2578935,2579607,2575558"
    .split(",");

const SCOUT_QUERIES = [
  { id: "greece", chapter: "Greece", q: "Greece", terms: /Greece|Greek|Mitsotakis|Papandreou|Samaras|Zolotas|Zacharakis|Athens|Souda/i },
  { id: "cyprus", chapter: "Cyprus", q: "Cyprus", terms: /Cyprus|Cypriot|Vassiliou|Denktash|Clerides|Nicosia/i },
  { id: "turkey", chapter: "Turkey", q: "Turkey", terms: /Turkey|Turkish|Ozal|Özal|Demirel|Yilmaz|Evren|Incirlik|Ankara|Istanbul|PKK/i },
  { id: "aegean", chapter: "Regional", q: "Aegean", terms: /Aegean|Greek.?Turkish|Greece.*Turkey|Turkey.*Greece/i },
  { id: "eastmed", chapter: "Regional", q: "Eastern Mediterranean", terms: /Eastern Mediterranean|Aegean|Cyprus|Greece|Turkey|southern flank/i }
];

const CHAPTERS = [
  ["Greece", 1],
  ["Cyprus", 2],
  ["Turkey", 3],
  ["Regional", 4]
];

const chapterNumber = new Map(CHAPTERS);
const entities = { amp: "&", quot: '"', apos: "'", nbsp: " " };

function decodeHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (_, n) => entities[n] || `&${n};`)
    .replace(/\s+/g, " ")
    .trim();
}

function parseOfficialRows(html) {
  const rows = [];
  for (const tr of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<td[^>]*class="[^"]*views-field-[^"]*"[^>]*>([\s\S]*?)<\/td>/g)].map((match) =>
      decodeHtml(match[1])
    );
    if (cells.length === 6) {
      rows.push({
        source: "Bush Library Memcons and Telcons index",
        dateText: cells[0],
        type: cells[1],
        participantsText: cells[2],
        countryText: cells[3],
        statusText: cells[4] || "Marker / no memorandum listed",
        naid: cells[5]
      });
    }
  }
  return rows;
}

function isoDateFromSlash(value) {
  const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function dateFromTitle(value) {
  const title = String(value || "");
  const slash = title.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (slash) {
    const [, month, day, rawYear] = slash;
    const year = rawYear.length === 2 ? Number(`19${rawYear}`) : Number(rawYear);
    if (year >= 1989 && year <= 1993) return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const monthName = title.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(1989|1990|1991|1992|1993)\b/i
  );
  if (monthName) {
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
    ].indexOf(monthName[1].toLowerCase()) + 1;
    return `${monthName[2]}-${String(month).padStart(2, "0")}-01`;
  }

  return "";
}

function logicalDate(record) {
  const titleDate = dateFromTitle(record.title);
  if (titleDate) return titleDate;
  const production = record.productionDates?.find((date) => date.logicalDate);
  if (production?.logicalDate) return production.logicalDate;
  const coverage = record.coverageStartDate?.logicalDate || record.coverageEndDate?.logicalDate;
  if (coverage) return coverage;
  const titleMatch = (record.title || "").match(/\b(19[89]\d|199[0-3])-(\d{2})-(\d{2})\b/);
  if (titleMatch) return `${titleMatch[1]}-${titleMatch[2]}-${titleMatch[3]}`;
  const year = record.productionDates?.[0]?.year || record.coverageStartDate?.year || record.coverageEndDate?.year;
  return year ? `${year}-01-01` : "1989-01-01";
}

function yearFromRecord(record) {
  return (
    record.productionDates?.[0]?.year ||
    record.coverageStartDate?.year ||
    record.coverageEndDate?.year ||
    Number(logicalDate(record).slice(0, 4))
  );
}

function textForRecord(record) {
  return [
    record.title,
    record.scopeAndContentNote,
    record.levelOfDescription,
    ...(record.subjects || []).map((subject) => subject.heading),
    ...(record.ancestors || []).map((ancestor) => ancestor.title || ancestor.collectionTitle)
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeParticipant(name) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.includes(":")) return trimmed;
  const match = trimmed.match(/^([^,]+),\s*(.+)$/);
  return match ? `${match[2]} ${match[1]}` : trimmed;
}

function participantsFromText(value) {
  if (!value) return [];
  if (value.includes("Allied Representatives")) {
    return [
      "George H. W. Bush",
      "Manfred Woerner",
      "George Papoulias",
      "Mesut Yilmaz",
      "NATO allied representatives"
    ];
  }
  return ["George H. W. Bush", ...value.split(";").map(normalizeParticipant)].filter(Boolean);
}

function chapterForText(text, preferred = "") {
  const flags = [];
  if (/Cyprus|Cypriot|Vassiliou|Denktash|Clerides|Nicosia/i.test(text)) flags.push("Cyprus");
  if (/Greece|Greek|Mitsotakis|Papandreou|Samaras|Zolotas|Zacharakis|Athens|Souda/i.test(text)) flags.push("Greece");
  if (/Turkey|Turkish|Ozal|Özal|Demirel|Yilmaz|Evren|Incirlik|Ankara|Istanbul|PKK/i.test(text) && !/Thanksgiving Turkey/i.test(text)) {
    flags.push("Turkey");
  }
  if (flags.length === 1 && !/Aegean|Eastern Mediterranean|Greece.*Turkey|Turkey.*Greece|southern flank/i.test(text)) {
    return flags[0];
  }
  if (!flags.length && preferred && preferred !== "Regional") return preferred;
  return "Regional";
}

function countriesForChapter(chapter, text = "") {
  const countries = new Set(["United States"]);
  if (chapter === "Greece" || /Greece|Greek|Mitsotakis|Papandreou|Zolotas|Zacharakis|Athens|Souda/i.test(text)) countries.add("Greece");
  if (chapter === "Cyprus" || /Cyprus|Cypriot|Vassiliou|Denktash|Clerides|Nicosia/i.test(text)) countries.add("Cyprus");
  if (chapter === "Turkey" || /Turkey|Turkish|Ozal|Özal|Demirel|Yilmaz|Evren|Incirlik|Ankara|Istanbul|PKK/i.test(text)) countries.add("Turkey");
  if (/NATO/i.test(text)) countries.add("NATO");
  return [...countries];
}

function releaseStatus(row, record) {
  if (/partial/i.test(row.statusText || record.accessRestriction?.status || "")) return "Partial";
  if (/denied|fully/i.test(row.statusText || record.accessRestriction?.status || "")) return "Denied";
  if (/no memcon|no telcon|marker/i.test(row.type || row.statusText || "")) return "Marker / no memorandum listed";
  if (/full|unrestricted/i.test(row.statusText || record.accessRestriction?.status || "")) return "Full";
  return row.statusText || record.accessRestriction?.status || "Unknown";
}

function seriesParts(record) {
  const ancestors = record.ancestors || [];
  const collection = ancestors.find((ancestor) => /collection/i.test(ancestor.levelOfDescription || ""));
  const series = ancestors.find((ancestor) => /series/i.test(ancestor.levelOfDescription || ""));
  const file = ancestors.find((ancestor) => /file/i.test(ancestor.levelOfDescription || ""));
  return {
    collectionTitle: collection?.title || collection?.collectionTitle || "",
    collectionNaid: collection?.naId || "",
    seriesTitle: series?.title || "",
    seriesNaid: series?.naId || "",
    fileTitle: file?.title || "",
    fileNaid: file?.naId || ""
  };
}

function firstPdf(record) {
  return (record.digitalObjects || []).find((object) => /pdf/i.test(object.objectType || object.objectFilename || object.objectUrl || ""));
}

function catalogUrl(naid) {
  return `https://catalog.archives.gov/id/${naid}`;
}

function scoutPermalink(query) {
  const params = new URLSearchParams({
    q: query.q,
    from: "1989",
    to: "1993",
    sort: "relevance",
    perColl: "50",
    perPage: "50",
    scope: "bush41"
  });
  return `${NARA_SCOUT_URL}#${params.toString()}`;
}

function classifyScout(record) {
  const title = record.title || "";
  const status = record.accessRestriction?.status || "";
  const restrictions = record.accessRestriction?.specificAccessRestrictions || [];
  const restrictionText = restrictions.map((item) => item.restriction).join(" ");
  const online = (record.digitalObjects || []).length > 0;
  if (/withdraw(al)?\s*(sheet|notice|card)|NA\s*Form\s*1402[13]/i.test(`${title} ${record.scopeAndContentNote || ""}`)) return "Withdrawal sheet";
  if (/restricted|denied|possibly|partial|FOIA|PRA|Presidential Records/i.test(`${status} ${restrictionText}`)) return "MDR / restriction candidate";
  if (online) return "Declassified online";
  if (!(record.scopeAndContentNote || "").trim()) return "Unprocessed / sparse description";
  return "Other lead";
}

function classifyBlackwillFile(record) {
  const title = record.title || "";
  if (/Publication|Resume|Appointment Calendar|Miscellaneous/i.test(title)) {
    return {
      priority: "Low priority / administrative",
      rationale: "Administrative or personal-office material; retain as series coverage but do not lead the volume search from it."
    };
  }
  if (/German|Kohl|Thatcher|Gorbachev|Malta|Brussels|CSCE|CFE|European Strategy/i.test(title)) {
    return {
      priority: "Regional context review",
      rationale:
        "Potential background for the regional chapter, especially summit diplomacy, alliance strategy, CSCE/CFE, and European security context around Greece, Cyprus, and Turkey."
    };
  }
  if (/Handwritten Meeting Notes|Cables/i.test(title)) {
    return {
      priority: "Screen manually",
      rationale:
        "Sparse Catalog title and image-heavy PDF; manual page review may reveal Eastern Mediterranean mentions not exposed in Catalog text."
    };
  }
  return {
    priority: "Series coverage",
    rationale: "Included to document the complete Robert D. Blackwill subject-file series review requested by the compiler."
  };
}

function scoreScoutLead(record, queryHits, officialNaids) {
  const text = textForRecord(record);
  const title = record.title || "";
  let score = 0;
  if ((record.digitalObjects || []).length) score += 12;
  if (/restricted|possibly|partial|denied/i.test(record.accessRestriction?.status || "")) score += 18;
  if (/National Security Council|NSC/i.test(text)) score += 18;
  if (/Briefing Book|Trip|Visit|Meeting|Telcon|Memcon/i.test(title)) score += 18;
  if (/Aegean|Cyprus|Mitsotakis|Papandreou|Ozal|Demirel|Vassiliou|Denktash|Yilmaz/i.test(text)) score += 16;
  if (/Speech|Proclamation|Toast|Arrival|Departure/i.test(text)) score += 7;
  if (/Chron File|^\w+ \d{4} \[\d+\]$|^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/i.test(title)) score += 6;
  if (record.levelOfDescription === "item") score += 9;
  if (record.levelOfDescription === "fileUnit") score += 6;
  score += Math.min(queryHits.length * 3, 12);
  if (officialNaids.has(String(record.naId))) score -= 100;
  if (/Thanksgiving Turkey/i.test(text)) score -= 200;
  return score;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch ${url}: ${response.status}`);
  return response.text();
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

async function fetchNaraByNaid(naid) {
  const params = new URLSearchParams({ naId: String(naid) });
  const json = await fetchJson(`${PROXY_URL}/records/search`, params);
  const hit = json.body?.hits?.hits?.[0];
  return hit?._source?.record || hit?._source || null;
}

async function fetchOfficialRows(term) {
  const allRows = [];
  for (let page = 0; page < 10; page += 1) {
    const url = `${BUSH_MEMCONS_URL}?combine=${encodeURIComponent(term)}${page ? `&page=${page}` : ""}`;
    const rows = parseOfficialRows(await fetchText(url));
    if (!rows.length) break;
    allRows.push(...rows);
    if (rows.length < 20) break;
  }
  return allRows;
}

async function pageCountForPdf(url, naid) {
  if (!url || !/\.pdf($|\?)/i.test(url)) return null;
  const target = path.join(os.tmpdir(), `gct-${naid}-${Date.now()}.pdf`);
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
  try {
    const info = execFileSync("pdfinfo", [target], { encoding: "utf8" });
    const match = info.match(/^Pages:\s+(\d+)/m);
    return match ? Number(match[1]) : null;
  } finally {
    fs.rmSync(target, { force: true });
  }
}

async function pageCountForPdfWithRetry(url, naid, attempts = 2) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await pageCountForPdf(url, naid);
    } catch (error) {
      if (attempt === attempts) return null;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  return null;
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

async function buildConversationRecords() {
  const rows = (await Promise.all(["Greece", "Cyprus", "Turkey"].map(fetchOfficialRows))).flat();
  const dedupedRows = [...new Map(rows.map((row) => [row.naid, row])).values()];
  const records = await mapLimit(dedupedRows, 8, async (row) => {
    const nara = await fetchNaraByNaid(row.naid);
    if (!nara) throw new Error(`No NARA metadata for ${row.naid}`);
    const pdf = firstPdf(nara);
    const text = `${row.countryText} ${row.participantsText} ${nara.title} ${textForRecord(nara)}`;
    const chapter = chapterForText(text);
    const source = seriesParts(nara);
    const date = isoDateFromSlash(row.dateText) || logicalDate(nara);
    const pageCount = pdf?.objectUrl ? await pageCountForPdfWithRetry(pdf.objectUrl, row.naid) : null;
    return {
      id: `conversation-${row.naid}`,
      recordSet: "Presidential conversation",
      date,
      sortDate: date,
      type: row.type,
      title: nara.title || row.participantsText,
      documentTitle: nara.title || row.participantsText,
      participants: participantsFromText(row.participantsText),
      countries: countriesForChapter(chapter, text),
      chapter: { number: chapterNumber.get(chapter), name: chapter },
      releaseStatus: releaseStatus(row, nara),
      naid: String(row.naid),
      catalogUrl: catalogUrl(row.naid),
      pdfUrl: pdf?.objectUrl || "",
      objectFilename: pdf?.objectFilename || "",
      pageCount,
      accessRestriction: nara.accessRestriction?.status || "",
      levelOfDescription: nara.levelOfDescription || "",
      source: {
        name: "National Archives Catalog",
        url: catalogUrl(row.naid),
        collection: source.collectionTitle,
        collectionNaid: source.collectionNaid,
        series: source.seriesTitle,
        seriesNaid: source.seriesNaid
      },
      frusVolume: FRUS_VOLUME,
      topics: [
        "Presidential conversations",
        chapter,
        ...countriesForChapter(chapter, text).filter((country) => country !== "United States")
      ],
      sourceNote: `Source: National Archives Catalog, ${source.collectionTitle || "George Bush Library records"}${
        source.seriesTitle ? `, ${source.seriesTitle}` : ""
      }, ${nara.title || row.participantsText}. NAID ${row.naid}. ${releaseStatus(row, nara)}.${
        pdf?.objectFilename ? ` Digital object: ${pdf.objectFilename}.` : ""
      } Catalog: ${catalogUrl(row.naid)}.`
    };
  });
  return records.sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title));
}

async function runScoutSearch(query) {
  const results = [];
  await mapLimit(BUSH41_COLLECTIONS, 8, async (ancestorNaId) => {
    const params = new URLSearchParams({
      q: query.q,
      ancestorNaId,
      startDate: "1989",
      endDate: "1993",
      limit: "50"
    });
    const json = await fetchJson(`${PROXY_URL}/records/search`, params).catch((error) => ({
      error: error.message,
      body: { hits: { total: 0, hits: [] } }
    }));
    const hits = json.body?.hits?.hits || [];
    results.push({
      query: query.id,
      queryText: query.q,
      ancestorNaId,
      total: json.body?.hits?.total?.value || json.body?.hits?.total || 0,
      error: json.error || "",
      hits: hits.map((hit) => hit._source?.record || hit._source || hit).filter(Boolean)
    });
  });
  return results;
}

async function buildBlackwillFiles() {
  const params = new URLSearchParams({
    q: "*",
    ancestorNaId: BLACKWILL_SERIES_NAID,
    limit: "100"
  });
  const json = await fetchJson(`${PROXY_URL}/records/search`, params);
  const records = (json.body?.hits?.hits || [])
    .map((hit) => hit._source?.record || hit._source || hit)
    .filter(Boolean)
    .sort((a, b) => (a.title || "").localeCompare(b.title || ""));

  return mapLimit(records, 5, async (record) => {
    const pdf = firstPdf(record);
    const source = seriesParts(record);
    const review = classifyBlackwillFile(record);
    const pageCount = pdf?.objectUrl ? await pageCountForPdfWithRetry(pdf.objectUrl, record.naId, 3) : null;
    return {
      id: `blackwill-${record.naId}`,
      seriesNaid: BLACKWILL_SERIES_NAID,
      naid: String(record.naId),
      title: record.title || "Untitled Blackwill file",
      sortTitle: (record.title || "").replace(/^\[/, ""),
      date: logicalDate(record),
      year: yearFromRecord(record),
      levelOfDescription: record.levelOfDescription || "",
      accessRestriction: record.accessRestriction?.status || "",
      pageCount,
      catalogUrl: catalogUrl(record.naId),
      pdfUrl: pdf?.objectUrl || "",
      objectFilename: pdf?.objectFilename || "",
      priority: review.priority,
      rationale: review.rationale,
      source: {
        name: "Robert D. Blackwill's Subject Files",
        url: catalogUrl(BLACKWILL_SERIES_NAID),
        collection: source.collectionTitle,
        collectionNaid: source.collectionNaid,
        series: source.seriesTitle || "Robert D. Blackwill's Subject Files",
        seriesNaid: BLACKWILL_SERIES_NAID
      },
      sourceNote: `Series review: Robert D. Blackwill's Subject Files, National Security Council, George H. W. Bush Presidential Records. File unit: ${
        record.title || "Untitled"
      }. NAID ${record.naId}. ${record.accessRestriction?.status || "Access status not specified"}.${
        pageCount ? ` PDF extent: ${pageCount} pages.` : ""
      } Catalog: ${catalogUrl(record.naId)}.`
    };
  });
}

function buildScoutLeads(searches, officialRecords) {
  const officialNaids = new Set(officialRecords.map((record) => record.naid));
  const byNaid = new Map();

  for (const search of searches) {
    const query = SCOUT_QUERIES.find((item) => item.id === search.query);
    for (const record of search.hits) {
      if (!record.naId) continue;
      const text = textForRecord(record);
      if (/Thanksgiving Turkey/i.test(text)) continue;
      if (!query.terms.test(text) && !/Aegean|Eastern Mediterranean|Greek.?Turkish|Greece.*Turkey|Turkey.*Greece/i.test(text)) continue;
      const existing = byNaid.get(String(record.naId));
      if (existing) {
        existing.queryHits.add(query.id);
        existing.queryLabels.add(query.q);
      } else {
        byNaid.set(String(record.naId), {
          record,
          queryHits: new Set([query.id]),
          queryLabels: new Set([query.q])
        });
      }
    }
  }

  return [...byNaid.values()]
    .map((entry) => {
      const record = entry.record;
      const queryHits = [...entry.queryHits];
      const queryLabels = [...entry.queryLabels];
      const text = textForRecord(record);
      const chapter = chapterForText(text, SCOUT_QUERIES.find((query) => entry.queryHits.has(query.id))?.chapter);
      const source = seriesParts(record);
      const pdf = firstPdf(record);
      const category = classifyScout(record);
      const score = scoreScoutLead(record, queryHits, officialNaids);
      return {
        id: `scout-${record.naId}`,
        recordSet: "NARA Scout lead",
        date: logicalDate(record),
        sortDate: logicalDate(record),
        year: yearFromRecord(record),
        title: record.title || "Untitled Catalog record",
        documentTitle: record.title || "Untitled Catalog record",
        chapter: { number: chapterNumber.get(chapter), name: chapter },
        category,
        score,
        naid: String(record.naId),
        catalogUrl: catalogUrl(record.naId),
        pdfUrl: pdf?.objectUrl || "",
        objectFilename: pdf?.objectFilename || "",
        objectCount: (record.digitalObjects || []).length,
        levelOfDescription: record.levelOfDescription || "",
        accessRestriction: record.accessRestriction?.status || "",
        countries: countriesForChapter(chapter, text),
        topics: [
          chapter,
          category,
          ...queryLabels,
          ...(source.seriesTitle ? [source.seriesTitle] : [])
        ],
        source: {
          name: "NARA Scout / National Archives Catalog",
          url: NARA_SCOUT_URL,
          collection: source.collectionTitle,
          collectionNaid: source.collectionNaid,
          series: source.seriesTitle,
          seriesNaid: source.seriesNaid,
          fileTitle: source.fileTitle,
          fileNaid: source.fileNaid
        },
        scopeAndContentNote: record.scopeAndContentNote || "",
        queryHits,
        queryLabels,
        scoutUrls: queryLabels.map((label) => scoutPermalink({ q: label })),
        sourceNote: `NARA Scout lead. Query hit(s): ${queryLabels.join(", ")}. Catalog source: ${
          source.collectionTitle || "George Bush Library records"
        }${source.seriesTitle ? `, ${source.seriesTitle}` : ""}. NAID ${record.naId}. ${
          record.accessRestriction?.status || "Access status not specified"
        }.${pdf?.objectFilename ? ` Digital object: ${pdf.objectFilename}.` : ""} Catalog: ${catalogUrl(record.naId)}.`
      };
    })
    .filter((lead) => lead.score > 0 && !officialNaids.has(lead.naid))
    .sort((a, b) => b.score - a.score || a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title))
    .slice(0, 180)
    .sort((a, b) => a.chapter.number - b.chapter.number || a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title));
}

function mirrorJs(variableName, value) {
  return `window.${variableName} = ${JSON.stringify(value, null, 2)};\n`;
}

async function main() {
  fs.mkdirSync("data", { recursive: true });
  fs.mkdirSync("reports", { recursive: true });

  console.error("Harvesting official Bush Library conversation rows...");
  const conversations = await buildConversationRecords();
  console.error(`Conversation records: ${conversations.length}`);

  console.error("Running NARA Scout query fan-out...");
  const searches = [];
  for (const query of SCOUT_QUERIES) {
    console.error(`  ${query.id}: ${query.q}`);
    searches.push(...(await runScoutSearch(query)));
  }
  const scoutLeads = buildScoutLeads(searches, conversations);
  console.error(`NARA Scout leads: ${scoutLeads.length}`);

  console.error(`Reviewing Robert D. Blackwill's Subject Files (${BLACKWILL_SERIES_NAID})...`);
  const blackwillFiles = await buildBlackwillFiles();
  console.error(`Blackwill files: ${blackwillFiles.length}`);

  const report = {
    generatedAt: new Date().toISOString(),
    tool: {
      name: "NARA Scout",
      url: NARA_SCOUT_URL,
      proxyUrl: PROXY_URL,
      sourcePack: "Bush 41 Vol VI · Eastern Mediterranean"
    },
    frusVolume: FRUS_VOLUME,
    queries: SCOUT_QUERIES.map((query) => ({
      id: query.id,
      q: query.q,
      chapter: query.chapter,
      from: 1989,
      to: 1993,
      scope: "All Bush 41 collection NAIDs from NARA Scout",
      scoutUrl: scoutPermalink(query)
    })),
    collectionCount: BUSH41_COLLECTIONS.length,
    searchedCollections: BUSH41_COLLECTIONS,
    queryTotals: searches.map((search) => ({
      query: search.query,
      ancestorNaId: search.ancestorNaId,
      total: search.total,
      returned: search.hits.length,
      error: search.error
    })),
    summary: {
      officialConversationRecords: conversations.length,
      scoutLeads: scoutLeads.length,
      blackwillFiles: blackwillFiles.length,
      conversationsByChapter: countBy(conversations, (record) => record.chapter.name),
      scoutLeadsByChapter: countBy(scoutLeads, (lead) => lead.chapter.name),
      scoutLeadsByCategory: countBy(scoutLeads, (lead) => lead.category),
      blackwillFilesByPriority: countBy(blackwillFiles, (file) => file.priority)
    },
    scoutLeads,
    blackwillSeries: {
      naid: BLACKWILL_SERIES_NAID,
      catalogUrl: catalogUrl(BLACKWILL_SERIES_NAID),
      title: "Robert D. Blackwill's Subject Files",
      files: blackwillFiles
    }
  };

  fs.writeFileSync("data/records.json", `${JSON.stringify(conversations, null, 2)}\n`);
  fs.writeFileSync("data/records.js", mirrorJs("GCT_RECORDS", conversations));
  fs.writeFileSync("data/nara-scout-leads.json", `${JSON.stringify(scoutLeads, null, 2)}\n`);
  fs.writeFileSync("data/nara-scout-leads.js", mirrorJs("NARA_SCOUT_LEADS", scoutLeads));
  fs.writeFileSync("data/blackwill-files.json", `${JSON.stringify(blackwillFiles, null, 2)}\n`);
  fs.writeFileSync("data/blackwill-files.js", mirrorJs("BLACKWILL_FILES", blackwillFiles));
  fs.writeFileSync("reports/nara-scout-eastmed-search.json", `${JSON.stringify(report, null, 2)}\n`);
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
