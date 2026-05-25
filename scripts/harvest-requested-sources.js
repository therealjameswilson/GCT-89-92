#!/usr/bin/env node

const fs = require("fs");
const { applyFrusSourceStyle } = require("./source-note-style");

const CATALOG_SEARCH_URL = "https://catalog.archives.gov/proxy/records/search";

const REQUESTED_SOURCES = [
  {
    id: "scowcroft-papers",
    label: "Scowcroft Papers",
    shortLabel: "Scowcroft",
    naid: "4522156",
    requestedUrl: "https://catalog.archives.gov/id/4522156",
    note: "User-requested Scowcroft collection anchor."
  },
  {
    id: "presidential-daily-file",
    label: "Presidential Daily File",
    shortLabel: "Daily File",
    naid: "595141",
    requestedUrl: "https://catalog.archives.gov/search-within/595141?availableOnline=true&limit=100",
    availableOnlineOnly: true,
    childLimit: 100,
    note: "User-requested online Presidential Daily File search-within set."
  },
  {
    id: "nsc",
    label: "NSC",
    shortLabel: "NSC",
    naid: "312293887",
    requestedUrl: "https://catalog.archives.gov/id/312293887",
    note: "User-requested NSC source pool."
  },
  {
    id: "nsc-dc-meetings",
    label: "NSC/DC Meetings",
    shortLabel: "NSC/DC",
    naid: "312294079",
    requestedUrl: "https://catalog.archives.gov/id/312294079",
    note: "User-requested NSC/DC Meetings source pool."
  },
  {
    id: "nsc-dc-meetings-follow-up",
    label: "NSC/DC Meetings Follow-Up",
    shortLabel: "NSC/DC Follow-Up",
    naid: "312294094",
    requestedUrl: "https://catalog.archives.gov/id/312294094",
    note: "User-requested NSC/DC Meetings Follow-Up source pool."
  },
  {
    id: "nsr",
    label: "NSR",
    shortLabel: "NSR",
    naid: "313189297",
    requestedUrl: "https://catalog.archives.gov/id/313189297",
    note: "User-requested NSR source pool."
  },
  {
    id: "nsd",
    label: "NSD",
    shortLabel: "NSD",
    naid: "313189290",
    requestedUrl: "https://catalog.archives.gov/id/313189290",
    note: "User-requested NSD source pool."
  },
  {
    id: "if-transition",
    label: "IF Transition",
    shortLabel: "IF Transition",
    naid: "348937136",
    requestedUrl: "https://catalog.archives.gov/id/348937136",
    note: "User-requested IF Transition source pool."
  }
];

const QUERY_DEFINITIONS = [
  { id: "greece", q: "Greece", label: "Greece", chapter: "Greece", weight: 6 },
  { id: "greek", q: "Greek", label: "Greek", chapter: "Greece", weight: 5 },
  { id: "papandreou", q: "Papandreou", label: "Papandreou", chapter: "Greece", weight: 12 },
  { id: "mitsotakis", q: "Mitsotakis", label: "Mitsotakis", chapter: "Greece", weight: 12 },
  { id: "zolotas", q: "Zolotas", label: "Zolotas", chapter: "Greece", weight: 12 },
  { id: "cyprus", q: "Cyprus", label: "Cyprus", chapter: "Cyprus", weight: 7 },
  { id: "cypriot", q: "Cypriot", label: "Cypriot", chapter: "Cyprus", weight: 7 },
  { id: "vassiliou", q: "Vassiliou", label: "Vassiliou", chapter: "Cyprus", weight: 13 },
  { id: "denktash", q: "Denktash", label: "Denktash", chapter: "Cyprus", weight: 13 },
  { id: "clerides", q: "Clerides", label: "Clerides", chapter: "Cyprus", weight: 13 },
  { id: "turkey", q: "Turkey", label: "Turkey", chapter: "Turkey", weight: 6 },
  { id: "turkish", q: "Turkish", label: "Turkish", chapter: "Turkey", weight: 6 },
  { id: "ozal", q: "Ozal", label: "Ozal", chapter: "Turkey", weight: 13 },
  { id: "demirel", q: "Demirel", label: "Demirel", chapter: "Turkey", weight: 13 },
  { id: "yilmaz", q: "Yilmaz", label: "Yilmaz", chapter: "Turkey", weight: 12 },
  { id: "incirlik", q: "Incirlik", label: "Incirlik", chapter: "Turkey", weight: 11 },
  { id: "pkk", q: "PKK", label: "PKK", chapter: "Turkey", weight: 11 },
  { id: "aegean", q: "Aegean", label: "Aegean", chapter: "Regional", weight: 14 },
  {
    id: "eastern-mediterranean",
    q: "Eastern Mediterranean",
    label: "Eastern Mediterranean",
    chapter: "Regional",
    weight: 14
  },
  {
    id: "greece-turkey-cyprus",
    q: "Greece Turkey Cyprus",
    label: "Greece / Turkey / Cyprus",
    chapter: "Regional",
    weight: 14
  },
  { id: "memcon", q: "memcon", label: "memcon", chapter: "Regional", weight: 8 },
  { id: "telcon", q: "telcon", label: "telcon", chapter: "Regional", weight: 10 },
  {
    id: "moc",
    q: "memorandum of conversation",
    label: "memorandum of conversation",
    chapter: "Regional",
    weight: 7
  },
  {
    id: "telephone-conversation",
    q: "telephone conversation",
    label: "telephone conversation",
    chapter: "Regional",
    weight: 7
  },
  { id: "nsc-dc", q: "NSC/DC", label: "NSC/DC", chapter: "Regional", weight: 5 },
  { id: "nsd", q: "NSD", label: "NSD", chapter: "Regional", weight: 4 },
  { id: "nsr", q: "NSR", label: "NSR", chapter: "Regional", weight: 4 }
];

const FRUS_VOLUME = {
  id: "frus1989-92v06",
  title: "Foreign Relations of the United States, 1989-1992, Volume VI, Eastern Mediterranean",
  url: "https://history.state.gov/historicaldocuments/frus1989-92v06",
  status: "Being Researched"
};

async function fetchCatalog(params) {
  const response = await fetch(`${CATALOG_SEARCH_URL}?${params.toString()}`, {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Catalog request failed (${response.status}) for ${params.toString()}`);
  const text = await response.text();
  if (/^\s*</.test(text)) throw new Error(`Catalog returned HTML for ${params.toString()}`);
  return JSON.parse(text);
}

async function fetchCatalogWithRetry(params, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchCatalog(params);
    } catch (error) {
      lastError = error;
      if (/Catalog returned HTML/.test(error.message) || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 900));
    }
  }
  throw lastError;
}

async function fetchByNaid(naid) {
  const json = await fetchCatalogWithRetry(new URLSearchParams({ naId: String(naid) }), 4);
  return json.body?.hits?.hits?.[0]?._source?.record || null;
}

async function fetchChildren(source, availableOnlineOnly = false, limit = 200) {
  const params = new URLSearchParams({
    q: "*",
    ancestorNaId: String(source.naid),
    limit: String(limit)
  });
  if (availableOnlineOnly) params.set("availableOnline", "true");
  try {
    const json = await fetchCatalogWithRetry(params, 1);
    return {
      total: totalValue(json),
      relation: json.body?.hits?.total?.relation || "eq",
      records: (json.body?.hits?.hits || []).map(recordFromHit).filter(Boolean),
      error: ""
    };
  } catch (error) {
    return {
      total: 0,
      relation: "unavailable",
      records: [],
      error: error.message
    };
  }
}

async function runQuery(source, query) {
  const params = new URLSearchParams({
    q: query.q,
    ancestorNaId: String(source.naid),
    startDate: "1989",
    endDate: "1993",
    limit: "50"
  });
  if (source.availableOnlineOnly) params.set("availableOnline", "true");
  try {
    const json = await fetchCatalogWithRetry(params, 1);
    return {
      query,
      total: totalValue(json),
      returned: json.body?.hits?.hits?.length || 0,
      error: "",
      hits: (json.body?.hits?.hits || []).map((hit) => ({
        score: hit._score || 0,
        record: recordFromHit(hit)
      })).filter((hit) => hit.record)
    };
  } catch (error) {
    return {
      query,
      total: 0,
      returned: 0,
      error: error.message,
      hits: []
    };
  }
}

function totalValue(json) {
  const total = json.body?.hits?.total;
  if (typeof total === "number") return total;
  return total?.value || 0;
}

function recordFromHit(hit) {
  return hit?._source?.record || hit?._source || null;
}

function catalogUrl(naid) {
  return `https://catalog.archives.gov/id/${naid}`;
}

function searchWithinUrl(naid, availableOnlineOnly = false) {
  const params = new URLSearchParams();
  if (availableOnlineOnly) params.set("availableOnline", "true");
  params.set("limit", "100");
  const query = params.toString();
  return `https://catalog.archives.gov/search-within/${naid}${query ? `?${query}` : ""}`;
}

function dateRange(record) {
  const start = record?.inclusiveStartDate?.logicalDate || record?.coverageStartDate?.logicalDate || "";
  const end = record?.inclusiveEndDate?.logicalDate || record?.coverageEndDate?.logicalDate || "";
  if (start && end) return `${start} to ${end}`;
  return start || end || "";
}

function firstPdf(record) {
  return (record.digitalObjects || []).find((object) => /pdf/i.test(object.objectType || object.objectFilename || object.objectUrl || ""));
}

function sourceParts(record) {
  const ancestors = record.ancestors || [];
  const collection = ancestors.find((ancestor) => /collection/i.test(ancestor.levelOfDescription || ""));
  const series = ancestors.find((ancestor) => /series/i.test(ancestor.levelOfDescription || ""));
  return {
    collectionTitle: collection?.title || "",
    collectionNaid: collection?.naId || "",
    seriesTitle: series?.title || "",
    seriesNaid: series?.naId || ""
  };
}

function compactRecord(record) {
  const source = sourceParts(record);
  const pdf = firstPdf(record);
  return {
    naid: String(record.naId),
    title: record.title || "Untitled Catalog record",
    levelOfDescription: record.levelOfDescription || "",
    dateRange: dateRange(record),
    accessRestriction: record.accessRestriction?.status || "",
    catalogUrl: catalogUrl(record.naId),
    pdfUrl: pdf?.objectUrl || "",
    objectFilename: pdf?.objectFilename || "",
    objectCount: (record.digitalObjects || []).length,
    collection: source.collectionTitle,
    collectionNaid: source.collectionNaid,
    series: source.seriesTitle,
    seriesNaid: source.seriesNaid
  };
}

function buildLeads(searches, sourceNaid) {
  const byNaid = new Map();
  for (const search of searches) {
    for (const hit of search.hits) {
      const record = hit.record;
      if (!record?.naId || String(record.naId) === String(sourceNaid)) continue;
      const key = String(record.naId);
      if (!byNaid.has(key)) {
        byNaid.set(key, {
          record,
          matches: [],
          score: 0
        });
      }
      const entry = byNaid.get(key);
      entry.matches.push(search.query);
      entry.score += search.query.weight + Math.min(Math.round(hit.score / 25), 8);
    }
  }

  return [...byNaid.values()]
    .map((entry) => {
      const compact = compactRecord(entry.record);
      const queryLabels = uniq(entry.matches.map((match) => match.label));
      return applyFrusSourceStyle({
        ...compact,
        score: Math.round(entry.score),
        queryLabels,
        queryHits: uniq(entry.matches.map((match) => match.id)),
        priority: priorityForLead(queryLabels),
        sourceNote: `Catalog source lead. Query hit(s): ${queryLabels.join(", ")}. NAID ${compact.naid}. Catalog: ${compact.catalogUrl}.`
      });
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 30);
}

function priorityForLead(labels) {
  const text = labels.join(" ");
  if (/Papandreou|Mitsotakis|Zolotas|Vassiliou|Denktash|Clerides|Ozal|Demirel|Yilmaz|Incirlik|PKK|Aegean|Eastern Mediterranean/i.test(text)) {
    return "High-value EastMed lead";
  }
  if (/memcon|telcon|conversation/i.test(text)) return "Conversation search lead";
  if (/Greece|Greek|Cyprus|Cypriot|Turkey|Turkish/i.test(text)) return "Country search lead";
  return "Series/source coverage";
}

function priorityForSource(source, leads, childTotal) {
  const text = leads.flatMap((lead) => lead.queryLabels).join(" ");
  if (/Papandreou|Mitsotakis|Zolotas|Vassiliou|Denktash|Clerides|Ozal|Demirel|Yilmaz|Incirlik|PKK|Aegean|Eastern Mediterranean/i.test(text)) {
    return "High-value EastMed source";
  }
  if (/memcon|telcon|conversation/i.test(text)) return "Conversation source";
  if (leads.length) return "Search lead source";
  if (childTotal) return "Source coverage";
  return "Catalog anchor";
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function countBy(items, getter) {
  return items.reduce((counts, item) => {
    const key = getter(item) || "Unspecified";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function mirrorJs(variableName, value) {
  return `window.${variableName} = ${JSON.stringify(value, null, 2)};\n`;
}

async function harvestSource(source) {
  console.error(`Fetching ${source.label} (${source.naid})...`);
  let root;
  let rootHarvestError = "";
  try {
    root = await fetchByNaid(source.naid);
  } catch (error) {
    rootHarvestError = error.message;
  }
  if (!root) {
    root = {
      naId: source.naid,
      title: source.label,
      levelOfDescription: "Catalog record",
      accessRestriction: { status: "Catalog metadata pending" }
    };
    if (!rootHarvestError) rootHarvestError = `No Catalog record found for ${source.naid}`;
  }
  const childLimit = source.childLimit || 200;
  const children = await fetchChildren(source, source.availableOnlineOnly, childLimit);
  const onlineChildren = source.availableOnlineOnly
    ? children
    : await fetchChildren(source, true, Math.min(childLimit, 100));

  const searches = [];
  for (const query of QUERY_DEFINITIONS) {
    searches.push(await runQuery(source, query));
  }
  const leads = buildLeads(searches, source.naid);
  const topChildren = children.records.slice(0, childLimit).map(compactRecord);
  const priority = priorityForSource(source, leads, children.total);
  const queryTotals = searches
    .filter((search) => search.total > 0)
    .map((search) => ({
      id: search.query.id,
      q: search.query.q,
      label: search.query.label,
      total: search.total,
      returned: search.returned
    }));
  return applyFrusSourceStyle({
    id: source.id,
    label: source.label,
    shortLabel: source.shortLabel,
    naid: String(source.naid),
    title: root.title || source.label,
    levelOfDescription: root.levelOfDescription || "",
    localIdentifier: root.localIdentifier || root.collectionIdentifier || "",
    dateRange: dateRange(root),
    catalogUrl: catalogUrl(source.naid),
    searchWithinUrl: searchWithinUrl(source.naid, source.availableOnlineOnly),
    requestedUrl: source.requestedUrl || "",
    accessRestriction: root.accessRestriction?.status || "",
    useRestriction: root.useRestriction?.status || "",
    scopeAndContentNote: root.scopeAndContentNote || "",
    seriesCount: root.seriesCount || null,
    fileUnitCount: root.fileUnitCount || null,
    itemCount: root.itemCount || null,
    childTotal: children.total,
    childRelation: children.relation,
    harvestedChildren: topChildren.length,
    onlineChildTotal: onlineChildren.total,
    onlineChildRelation: onlineChildren.relation,
    queryHitFiles: leads.length,
    queryHitTotal: queryTotals.reduce((sum, query) => sum + query.total, 0),
    childHarvestError: children.error || "",
    onlineChildHarvestError: onlineChildren.error || "",
    rootHarvestError,
    queryHarvestErrors: searches.filter((search) => search.error).length,
    priority,
    note: source.note,
    queryTotals,
    leads,
    children: topChildren,
    frusVolume: FRUS_VOLUME,
    sourceNote: `Requested source: ${root.title || source.label}. NAID ${source.naid}. ${
      root.levelOfDescription || "Catalog record"
    }. ${root.accessRestriction?.status || "Access status not specified"}. Children found: ${children.total}. Online children: ${
      onlineChildren.total
    }. EastMed query-hit records retained: ${leads.length}.${rootHarvestError ? " Root metadata fetch failed during this run; retained as requested source anchor." : ""}${children.error ? " Public child/search harvest unavailable from the Catalog endpoint used in this run." : ""} Catalog: ${catalogUrl(source.naid)}.`
  });
}

async function main() {
  fs.mkdirSync("data", { recursive: true });
  fs.mkdirSync("reports", { recursive: true });
  const sources = [];
  for (const source of REQUESTED_SOURCES) {
    sources.push(await harvestSource(source));
  }
  const report = {
    generatedAt: new Date().toISOString(),
    tool: {
      name: "National Archives Catalog public search endpoint",
      url: CATALOG_SEARCH_URL
    },
    frusVolume: FRUS_VOLUME,
    requestedSources: REQUESTED_SOURCES.map((source) => ({
      label: source.label,
      naid: source.naid,
      requestedUrl: source.requestedUrl
    })),
    summary: {
      sources: sources.length,
      childRecordsHarvested: sources.reduce((sum, source) => sum + source.harvestedChildren, 0),
      queryLeadRecords: sources.reduce((sum, source) => sum + source.queryHitFiles, 0),
      byPriority: countBy(sources, (source) => source.priority)
    },
    sources
  };
  fs.writeFileSync("data/requested-source-series.json", `${JSON.stringify(sources, null, 2)}\n`);
  fs.writeFileSync("data/requested-source-series.js", mirrorJs("REQUESTED_SOURCE_SERIES", sources));
  fs.writeFileSync("reports/requested-source-series-eastmed.json", `${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
