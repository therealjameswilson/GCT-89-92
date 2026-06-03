const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CHAPTER_ORDER = ["Greece", "Cyprus", "Turkey", "Regional"];
const CHAPTER_PATTERNS = {
  Greece: /greece|greek|papandreou|mitsotakis|zacharakis|zolotas/i,
  Cyprus: /cyprus|cypriot|vassiliou|denktash|clerides/i,
  Turkey: /turkey|turkish|ozal|demirel|yilmaz|evren|pkk/i,
  Regional: /aegean|eastern mediterranean|greece \/ turkey \/ cyprus|nato|regional/i
};
const QUALITY_TEXT_FIELDS = ["title", "documentTitle", "sourceNote", "researchNote", "scopeAndContentNote", "objectFilename"];
const QUALITY_VARIANTS = [
  {
    pattern: /Papandreaou/i,
    preferred: "Papandreou",
    issue: "Name/title spelling variant",
    suggestedAction: "Verify whether to preserve the Catalog title spelling or normalize in compiler notes."
  },
  {
    pattern: /Turgat Ozal/i,
    preferred: "Turgut Ozal",
    issue: "Name/title spelling variant",
    suggestedAction: "Verify diary text against the PDF before using this wording in notes or names."
  },
  {
    pattern: /Mitterand/i,
    preferred: "Mitterrand",
    issue: "Name/title spelling variant",
    suggestedAction: "Verify diary text against the PDF before using this wording in notes or names."
  },
  {
    pattern: /Stationn/i,
    preferred: "Station",
    issue: "Title spelling variant",
    suggestedAction: "Verify whether the Catalog title contains a typo before citation or selection."
  }
];
const SEVERITY_ORDER = {
  "fix before citation": 0,
  review: 1,
  caveat: 2
};

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function byChapterThenDate(a, b) {
  return (
    a.chapter.number - b.chapter.number ||
    a.sortDate.localeCompare(b.sortDate) ||
    a.title.localeCompare(b.title)
  );
}

function assignCompilerNumbers(records) {
  const chapterCounts = new Map();
  return [...records].sort(byChapterThenDate).map((record) => {
    const chapterCount = (chapterCounts.get(record.chapter.name) || 0) + 1;
    chapterCounts.set(record.chapter.name, chapterCount);
    return {
      ...record,
      compilerNumber: `${record.chapter.number}.${String(chapterCount).padStart(3, "0")}`
    };
  });
}

function releaseNeedsAttention(record) {
  const releaseAndType = `${record.releaseStatus || ""} ${record.type || ""}`;
  const accessRestriction = `${record.accessRestriction || ""}`;
  return (
    /partial|denied|marker|no memorandum|unknown/i.test(releaseAndType) ||
    (/restricted/i.test(accessRestriction) && !/unrestricted/i.test(accessRestriction))
  );
}

function clean(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function csvEscape(value) {
  const text = clean(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRow(values) {
  return values.map(csvEscape).join(",");
}

function mdLink(label, url) {
  return url ? `[${label}](${url})` : "";
}

function recordLinks(record) {
  return [mdLink("Catalog", record.catalogUrl), mdLink("PDF", record.pdfUrl)].filter(Boolean).join(" | ");
}

function scheduleSummary(record) {
  return (record.scheduleReferences || [])
    .filter((reference) => reference.sourceNote)
    .map((reference) =>
      [
        reference.title,
        reference.sourceNote,
        reference.researchNote,
        reference.catalogUrl ? `Catalog: ${reference.catalogUrl}` : "",
        reference.pdfUrl ? `PDF: ${reference.pdfUrl}` : ""
      ]
        .filter(Boolean)
        .join(" - ")
    )
    .join(" || ");
}

function chapterMatches(item, chapterName) {
  if (item.chapter?.name) return item.chapter.name === chapterName;
  const text = [
    item.title,
    item.label,
    item.shortLabel,
    item.priority,
    item.category,
    ...(item.queryLabels || []),
    ...(item.queryHits || [])
  ].join(" ");
  return CHAPTER_PATTERNS[chapterName].test(text);
}

function countChapter(items, chapterName) {
  return items.filter((item) => chapterMatches(item, chapterName)).length;
}

function countPriority(items, chapterName, pattern) {
  return items.filter((item) => chapterMatches(item, chapterName) && pattern.test(item.priority || item.category || "")).length;
}

function countOcr(items, chapterName) {
  return items.filter((item) => chapterMatches(item, chapterName) && (item.documentSignals || []).length).length;
}

function sourceLaneTotals(data) {
  return [
    ["NARA Scout leads", data.scout.length],
    ["Central Chronological Files", data.central.length],
    ["Blackwill Subject Files", data.blackwill.length],
    ["Blackwill Chronological Files", data.blackwillChron.length],
    ["Gates Chronological Files", data.gates.length],
    ["Requested source-pool leads", data.requested.reduce((sum, source) => sum + (source.queryHitFiles || 0), 0)]
  ];
}

function countBy(items, getter) {
  const counts = new Map();
  for (const item of items) {
    const key = getter(item) || "Unspecified";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function chapterCoverage(records, data) {
  return CHAPTER_ORDER.map((chapterName) => {
    const selected = records.filter((record) => record.chapter.name === chapterName);
    return {
      chapterName,
      records: selected.length,
      pages: selected.reduce((sum, record) => sum + (record.pageCount || 0), 0),
      releaseMarkers: selected.filter(releaseNeedsAttention).length,
      missingSchedule: selected.filter((record) => !(record.scheduleReferences || []).length).length,
      scout: countChapter(data.scout, chapterName),
      central: countChapter(data.central, chapterName),
      centralOpenFirst: countPriority(data.central, chapterName, /Open packet first/i),
      centralOcr: countOcr(data.central, chapterName),
      blackwillChron: countChapter(data.blackwillChron, chapterName),
      blackwillOpenFirst: countPriority(data.blackwillChron, chapterName, /Open packet first/i),
      blackwillOcr: countOcr(data.blackwillChron, chapterName),
      gates: countChapter(data.gates, chapterName),
      gatesPriority: countPriority(data.gates, chapterName, /High-value|Personnel|Memcon|telcon/i),
      requestedLeads: data.requested.reduce((sum, source) => sum + countChapter(source.leads || [], chapterName), 0)
    };
  });
}

function topQueue(data) {
  const central = data.central
    .filter((file) => file.priority === "Open packet first")
    .map((file) => ({
      lane: "Central Chronology",
      title: file.title,
      chapter: file.chapter?.name,
      naid: file.naid,
      score: 100 + (file.documentSignals?.length || 0) * 8 + (file.score || 0),
      url: file.pdfUrl || file.catalogUrl,
      detail: `${file.documentSignals?.length || 0} OCR signals`
    }));
  const blackwillChron = data.blackwillChron
    .filter((file) => file.priority === "Open packet first")
    .map((file) => ({
      lane: "Blackwill Chronology",
      title: file.title,
      chapter: file.chapter?.name,
      naid: file.naid,
      score: 92 + (file.documentSignals?.length || 0) * 8 + (file.score || 0),
      url: file.pdfUrl || file.catalogUrl,
      detail: `${file.documentSignals?.length || 0} OCR signals`
    }));
  const requested = data.requested
    .flatMap((source) =>
      (source.leads || []).slice(0, 3).map((lead) => ({
        lane: source.label,
        title: lead.title,
        chapter: CHAPTER_ORDER.filter((chapterName) => chapterMatches(lead, chapterName)).join(", ") || "Cross-chapter",
        naid: lead.naid,
        score: 60 + (lead.score || 0),
        url: lead.pdfUrl || lead.catalogUrl,
        detail: lead.priority || "Requested source-pool lead"
      }))
    );
  return [...central, ...blackwillChron, ...requested]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 20);
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((cell) => clean(cell).replaceAll("|", "/")).join(" | ")} |`)
  ].join("\n");
}

function issueSort(a, b) {
  return (
    (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
    clean(a.lane).localeCompare(clean(b.lane)) ||
    clean(a.date).localeCompare(clean(b.date)) ||
    clean(a.candidateId).localeCompare(clean(b.candidateId))
  );
}

function itemTitle(item) {
  return item.documentTitle || item.title || item.label || item.shortLabel || "";
}

function itemCatalogUrl(item) {
  return item.catalogUrl || item.searchWithinUrl || item.requestedUrl || "";
}

function itemPdfUrl(item) {
  return item.pdfUrl || "";
}

function issueChapter(context, item) {
  return context.chapter || item.chapter?.name || itemChapterNames(item);
}

function issueDate(context, item) {
  return context.date || itemDate(item);
}

function qualityTextHits(item, pattern) {
  return QUALITY_TEXT_FIELDS.filter((field) => pattern.test(clean(item[field])));
}

function addQualityIssue(rows, context, item, issue) {
  rows.push({
    severity: issue.severity,
    lane: context.lane,
    candidateId: context.candidateId,
    chapter: issueChapter(context, item),
    date: issueDate(context, item),
    title: itemTitle(item),
    issue: issue.issue,
    detail: issue.detail,
    suggestedAction: issue.suggestedAction,
    catalogUrl: itemCatalogUrl(item),
    pdfUrl: itemPdfUrl(item)
  });
}

function issueLinks(row) {
  return [mdLink("Catalog", row.catalogUrl), mdLink("PDF", row.pdfUrl)].filter(Boolean).join(" | ");
}

function collectVariantIssues(rows, context, item) {
  for (const variant of QUALITY_VARIANTS) {
    const fields = qualityTextHits(item, variant.pattern);
    if (!fields.length) continue;
    const matched = fields
      .map((field) => {
        const match = clean(item[field]).match(variant.pattern);
        return match?.[0];
      })
      .filter(Boolean);
    addQualityIssue(rows, context, item, {
      severity: "fix before citation",
      issue: variant.issue,
      detail: `Found ${[...new Set(matched)].join(", ")} in ${fields.join(", ")}; review against preferred form ${variant.preferred}.`,
      suggestedAction: variant.suggestedAction
    });
  }
}

function parseFilenameDate(filename) {
  const text = clean(filename);
  let match = text.match(/(?:^|[^\d])((?:19|20)\d{2})[-_](\d{2})[-_](\d{2})(?:[^\d]|$)/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = text.match(/(?:^|[^\d])(\d{2})_(\d{2})_(\d{2,4})(?:[^\d]|$)/);
  if (!match) return "";
  let year = Number(match[3]);
  if (match[3].length === 2) year += year >= 70 ? 1900 : 2000;
  return `${year}-${match[1]}-${match[2]}`;
}

function collectFilenameDateIssue(rows, context, item) {
  const expected = issueDate(context, item);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expected)) return;
  const filename = item.objectFilename || "";
  const filenameDate = parseFilenameDate(filename);
  if (!filenameDate || filenameDate === expected) return;
  addQualityIssue(rows, context, item, {
    severity: "fix before citation",
    issue: "Filename/date mismatch",
    detail: `Item date is ${expected}, but digital object filename suggests ${filenameDate}: ${filename}.`,
    suggestedAction: "Open the Catalog/PDF and verify the correct date before citation or selection."
  });
}

function collectTitleDateIssue(rows, context, item) {
  const title = itemTitle(item);
  const match = title.match(/\b\d{1,2}\/\d{1,2}\/20\b/);
  if (!match) return;
  addQualityIssue(rows, context, item, {
    severity: "review",
    issue: "Suspect date token in title",
    detail: `Title contains ${match[0]}, which may be a truncated or miscoded Bush-era date.`,
    suggestedAction: "Verify the title/date against the PDF and Catalog record before relying on this lead."
  });
}

function collectScheduleIssues(rows, record) {
  const refs = record.scheduleReferences || [];
  if (!refs.length) {
    addQualityIssue(rows, {
      lane: "Selected chronology",
      candidateId: `Doc ${record.compilerNumber}`,
      chapter: record.chapter.name,
      date: record.date
    }, record, {
      severity: "review",
      issue: "Missing schedule corroboration",
      detail: "Selected chronology row has no attached Presidential Daily Diary/Backup reference.",
      suggestedAction: "Check Presidential Daily Diary/Backup folders for same-date corroboration."
    });
    return;
  }
  for (const reference of refs) {
    const context = {
      lane: "Schedule corroboration",
      candidateId: `Doc ${record.compilerNumber} / Schedule NAID ${reference.naid || "pending"}`,
      chapter: record.chapter.name,
      date: reference.date || record.date
    };
    collectVariantIssues(rows, context, reference);
    collectFilenameDateIssue(rows, context, reference);
    if (/\[EMPTY\]/i.test(clean(reference.title))) {
      addQualityIssue(rows, context, reference, {
        severity: "caveat",
        issue: "Schedule title caveat",
        detail: `Schedule title includes [EMPTY]: ${reference.title}.`,
        suggestedAction: "Use as schedule corroboration only after reviewing the PDF content."
      });
    }
  }
}

function collectItemQualityIssues(rows, context, item) {
  collectVariantIssues(rows, context, item);
  collectFilenameDateIssue(rows, context, item);
  collectTitleDateIssue(rows, context, item);
}

function collectRequestedSourceIssues(rows, source, sourceIndex) {
  const context = {
    lane: "Requested source pool",
    candidateId: `RS ${padNumber(sourceIndex + 1)}`,
    chapter: "Cross-chapter",
    date: source.dateRange || ""
  };
  collectItemQualityIssues(rows, context, source);
  if (source.childHarvestError) {
    addQualityIssue(rows, context, source, {
      severity: "review",
      issue: "Catalog child-harvest caveat",
      detail: source.childHarvestError,
      suggestedAction: "Use the Search Within URL or direct Catalog page to continue source-pool review."
    });
  }
  if (Number(source.queryHarvestErrors || 0) > 0) {
    addQualityIssue(rows, context, source, {
      severity: "review",
      issue: "Catalog query-harvest caveat",
      detail: `${source.queryHarvestErrors} query harvest error(s) recorded for this source pool.`,
      suggestedAction: "Re-run or manually spot-check failed query lanes before treating coverage as complete."
    });
  }
  (source.leads || []).forEach((lead, leadIndex) => {
    collectItemQualityIssues(rows, {
      lane: `Requested source pool: ${source.label}`,
      candidateId: `RS ${padNumber(sourceIndex + 1)}-${padNumber(leadIndex + 1)}`,
      chapter: itemChapterNames(lead),
      date: itemDate(lead)
    }, lead);
  });
}

function dataQualityRows(records, data) {
  const rows = [];
  records.forEach((record) => {
    collectItemQualityIssues(rows, {
      lane: "Selected chronology",
      candidateId: `Doc ${record.compilerNumber}`,
      chapter: record.chapter.name,
      date: record.date
    }, record);
    collectScheduleIssues(rows, record);
  });
  [
    ["NARA Scout", "Scout", data.scout],
    ["Central Chronological Files", "CC", data.central],
    ["Blackwill Subject Files", "BW", data.blackwill],
    ["Blackwill Chronological Files", "BC", data.blackwillChron],
    ["Gates Chronological Files", "GC", data.gates]
  ].forEach(([lane, prefix, items]) => {
    items.forEach((item, index) => {
      collectItemQualityIssues(rows, {
        lane,
        candidateId: `${prefix} ${padNumber(index + 1)}`,
        chapter: itemChapterNames(item),
        date: itemDate(item)
      }, item);
    });
  });
  data.requested.forEach((source, sourceIndex) => collectRequestedSourceIssues(rows, source, sourceIndex));
  return rows.sort(issueSort);
}

function buildDataQualityMarkdown(records, data) {
  const rows = dataQualityRows(records, data);
  const severityCounts = ["fix before citation", "review", "caveat"].map((severity) => [
    severity,
    rows.filter((row) => row.severity === severity).length
  ]);
  const citationRows = rows.filter((row) => row.severity !== "caveat");
  const scheduleRows = rows.filter((row) => row.lane === "Schedule corroboration");
  const lines = [
    "# FRUS 1989-1992 Volume VI Data-Quality Audit",
    "",
    "This audit flags metadata and citation risks without silently changing archival titles. It is a review queue for source-note cleanup, date verification, and schedule-evidence caveats.",
    "",
    "## Snapshot",
    "",
    `- Total data-quality rows: ${rows.length}`,
    `- Citation/metadata review rows: ${citationRows.length}`,
    `- Schedule evidence review rows: ${scheduleRows.length}`,
    "",
    markdownTable(["Severity", "Rows"], severityCounts),
    "",
    "## Citation and Metadata Review Queue",
    "",
    markdownTable(
      ["Severity", "Lane", "Candidate", "Chapter", "Date", "Title", "Issue", "Detail", "Action", "Links"],
      citationRows.map((row) => [
        row.severity,
        row.lane,
        row.candidateId,
        row.chapter,
        row.date,
        row.title,
        row.issue,
        row.detail,
        row.suggestedAction,
        issueLinks(row)
      ])
    ),
    "",
    "## Schedule Evidence Review Queue",
    "",
    markdownTable(
      ["Candidate", "Chapter", "Date", "Title", "Issue", "Detail", "Action", "Links"],
      scheduleRows.map((row) => [
        row.candidateId,
        row.chapter,
        row.date,
        row.title,
        row.issue,
        row.detail,
        row.suggestedAction,
        issueLinks(row)
      ])
    ),
    ""
  ];
  return `${lines.join("\n")}\n`;
}

function buildDataQualityCsv(records, data) {
  const rows = dataQualityRows(records, data);
  const header = [
    "reviewStatus",
    "followUpOwner",
    "outcome",
    "severity",
    "lane",
    "candidateId",
    "chapter",
    "date",
    "title",
    "issue",
    "detail",
    "suggestedAction",
    "catalogUrl",
    "pdfUrl"
  ];
  return `${csvRow(header)}\n${rows.map((row) => csvRow(header.map((field) => row[field]))).join("\n")}\n`;
}

function buildGapAudit(records, data) {
  const coverage = chapterCoverage(records, data);
  const restrictions = records.filter(releaseNeedsAttention);
  const missingScheduleRefs = records.filter((record) => !(record.scheduleReferences || []).length);
  const requestedTotal = data.requested.reduce((sum, source) => sum + (source.queryHitFiles || 0), 0);
  const lines = [
    "# FRUS 1989-1992 Volume VI Compiler Gap Audit",
    "",
    "This audit is a risk register for compiler selection. It compares the selected declassified conversation chronology against NARA Scout, Central Chronological Files, Blackwill and Gates chronological files, requested source pools, schedule corroboration, and release-status markers.",
    "",
    "## Source-Lane Snapshot",
    "",
    markdownTable(["Lane", "Count"], sourceLaneTotals(data)),
    "",
    "## Chapter Coverage Matrix",
    "",
    markdownTable(
      [
        "Chapter",
        "Selected",
        "Pages",
        "Release/marker rows",
        "Missing schedule refs",
        "Scout leads",
        "Central leads",
        "Central open first",
        "Central OCR",
        "Blackwill Chron",
        "Blackwill open first",
        "Gates leads",
        "Requested-pool leads"
      ],
      coverage.map((row) => [
        row.chapterName,
        row.records,
        row.pages,
        row.releaseMarkers,
        row.missingSchedule,
        row.scout,
        row.central,
        row.centralOpenFirst,
        row.centralOcr,
        row.blackwillChron,
        row.blackwillOpenFirst,
        row.gates,
        row.requestedLeads
      ])
    ),
    "",
    "## Risk Calls",
    "",
    `- Cyprus is thin in the selected chronology (${coverage.find((row) => row.chapterName === "Cyprus").records} records) relative to ${coverage.find((row) => row.chapterName === "Cyprus").central} Central Chronology leads, ${coverage.find((row) => row.chapterName === "Cyprus").centralOpenFirst} Central open-first packets, and ${coverage.find((row) => row.chapterName === "Cyprus").requestedLeads} requested-pool leads.`,
    `- Regional is the largest apparent selection gap: ${coverage.find((row) => row.chapterName === "Regional").records} selected record versus ${coverage.find((row) => row.chapterName === "Regional").scout} Scout leads, ${coverage.find((row) => row.chapterName === "Regional").central} Central leads, ${coverage.find((row) => row.chapterName === "Regional").blackwillChron} Blackwill Chron leads, ${coverage.find((row) => row.chapterName === "Regional").gates} Gates leads, and ${coverage.find((row) => row.chapterName === "Regional").requestedLeads} requested-pool leads.`,
    `- Declassification review should start with ${restrictions.length} selected chronology rows: ${restrictions.map((record) => `Doc ${record.compilerNumber}`).join(", ")}.`,
    missingScheduleRefs.length
      ? `- Schedule corroboration is almost complete; ${missingScheduleRefs.length} selected ${missingScheduleRefs.length === 1 ? "row lacks" : "rows lack"} a Daily Diary/Backup reference: ${missingScheduleRefs.map((record) => `Doc ${record.compilerNumber}`).join(", ")}.`
      : "- Schedule corroboration is complete for selected chronology rows; each selected record has a Daily Diary/Backup reference.",
    `- Requested source pools remain a major review lane: ${data.requested.length} pools retain ${requestedTotal} EastMed leads, including Scowcroft, Presidential Daily File, NSC, NSC/DC, NSR, NSD, and IF Transition sources.`,
    "",
    "## Next Packet Queue",
    "",
    markdownTable(
      ["Lane", "Chapter", "Title", "NAID", "Detail", "Link"],
      topQueue(data).map((item) => [item.lane, item.chapter, item.title, item.naid, item.detail, item.url])
    ),
    ""
  ];
  return `${lines.join("\n")}\n`;
}

function buildGapCsv(records, data) {
  const header = [
    "chapter",
    "selectedRecords",
    "pages",
    "releaseMarkerRows",
    "missingScheduleRefs",
    "scoutLeads",
    "centralLeads",
    "centralOpenFirst",
    "centralOcr",
    "blackwillChronLeads",
    "blackwillOpenFirst",
    "blackwillOcr",
    "gatesLeads",
    "gatesPriority",
    "requestedPoolLeads"
  ];
  const rows = chapterCoverage(records, data).map((row) =>
    csvRow([
      row.chapterName,
      row.records,
      row.pages,
      row.releaseMarkers,
      row.missingSchedule,
      row.scout,
      row.central,
      row.centralOpenFirst,
      row.centralOcr,
      row.blackwillChron,
      row.blackwillOpenFirst,
      row.blackwillOcr,
      row.gates,
      row.gatesPriority,
      row.requestedLeads
    ])
  );
  return `${csvRow(header)}\n${rows.join("\n")}\n`;
}

function padNumber(value) {
  return String(value).padStart(3, "0");
}

function itemChapterNames(item) {
  if (item.chapter?.name) return item.chapter.name;
  const matches = CHAPTER_ORDER.filter((chapterName) => chapterMatches(item, chapterName));
  return matches.join("; ") || "Cross-chapter";
}

function itemDate(item) {
  return item.date || item.sortDate || item.dateRange || "";
}

function itemSourceSeries(item) {
  return item.source?.series || item.series || item.collection || "";
}

function worksheetRank(row) {
  if (row.lane === "Selected chronology") return 1000 - Number(row.sortKey || 0) / 10000;
  let rank = Number(row.score || 0);
  if (/Open packet first/i.test(row.priority)) rank += 500;
  if (/High-value/i.test(row.priority)) rank += 350;
  if (/MDR|restriction|Partial|Denied|Marker/i.test(`${row.priority} ${row.releaseStatus} ${row.accessRestriction}`)) rank += 90;
  if (/Regional|Cyprus/.test(row.chapter)) rank += 40;
  return rank;
}

function selectedWorksheetRows(records) {
  return records.map((record, index) => ({
    reviewStatus: "",
    compilerDecision: "",
    compilerNotes: "",
    candidateId: `Doc ${record.compilerNumber}`,
    lane: "Selected chronology",
    suggestedAction: releaseNeedsAttention(record) ? "Review release/marker before final selection" : "Review for inclusion",
    priority: releaseNeedsAttention(record) ? "Release/marker review" : "Selected chronology",
    chapter: record.chapter.name,
    date: record.date,
    type: record.type,
    title: record.documentTitle || record.title,
    peopleOrSignals: (record.participants || []).join("; "),
    releaseStatus: record.releaseStatus,
    accessRestriction: record.accessRestriction,
    pageCount: record.pageCount,
    score: "",
    naid: record.naid,
    sourceSeries: itemSourceSeries(record),
    sourceNote: record.sourceNote,
    researchNote: record.researchNote,
    scheduleReferences: scheduleSummary(record),
    catalogUrl: record.catalogUrl,
    pdfUrl: record.pdfUrl,
    sortKey: index + 1
  }));
}

function flatLeadRows(items, lane, prefix, suggestedAction) {
  return [...items]
    .sort((a, b) => (b.score || 0) - (a.score || 0) || clean(a.sortDate || a.date).localeCompare(clean(b.sortDate || b.date)) || clean(a.title).localeCompare(clean(b.title)))
    .map((item, index) => ({
      reviewStatus: "",
      compilerDecision: "",
      compilerNotes: "",
      candidateId: `${prefix} ${padNumber(index + 1)}`,
      lane,
      suggestedAction,
      priority: item.priority || item.category || "",
      chapter: itemChapterNames(item),
      date: itemDate(item),
      type: item.type || item.category || item.levelOfDescription || "",
      title: item.documentTitle || item.title || item.label,
      peopleOrSignals: [...(item.documentSignals || []).slice(0, 3), ...(item.queryLabels || []).slice(0, 8)].join(" | "),
      releaseStatus: item.releaseStatus || "",
      accessRestriction: item.accessRestriction || "",
      pageCount: item.pageCount || "",
      score: item.score || "",
      naid: item.naid,
      sourceSeries: itemSourceSeries(item),
      sourceNote: item.sourceNote,
      researchNote: item.researchNote,
      scheduleReferences: "",
      catalogUrl: item.catalogUrl,
      pdfUrl: item.pdfUrl,
      sortKey: 2000 + index + 1
    }));
}

function requestedLeadRows(sources) {
  const rows = [];
  sources.forEach((source, sourceIndex) => {
    [...(source.leads || [])]
      .sort((a, b) => (b.score || 0) - (a.score || 0) || clean(a.title).localeCompare(clean(b.title)))
      .forEach((lead, leadIndex) => {
        rows.push({
          reviewStatus: "",
          compilerDecision: "",
          compilerNotes: "",
          candidateId: `RS ${padNumber(sourceIndex + 1)}-${padNumber(leadIndex + 1)}`,
          lane: `Requested source pool: ${source.label}`,
          suggestedAction: "Review requested source-pool lead",
          priority: lead.priority || source.priority || "",
          chapter: itemChapterNames(lead),
          date: itemDate(lead),
          type: lead.levelOfDescription || "",
          title: lead.title,
          peopleOrSignals: (lead.queryLabels || []).slice(0, 10).join(" | "),
          releaseStatus: lead.releaseStatus || "",
          accessRestriction: lead.accessRestriction || "",
          pageCount: lead.pageCount || "",
          score: lead.score || "",
          naid: lead.naid,
          sourceSeries: lead.series || source.title || source.label,
          sourceNote: lead.sourceNote || source.sourceNote,
          researchNote: lead.researchNote || source.researchNote,
          scheduleReferences: "",
          catalogUrl: lead.catalogUrl,
          pdfUrl: lead.pdfUrl,
          sortKey: 7000 + sourceIndex * 1000 + leadIndex + 1
        });
      });
  });
  return rows;
}

function buildSelectionWorksheet(records, data) {
  const rows = [
    ...selectedWorksheetRows(records),
    ...flatLeadRows(data.central, "Central Chronological Files", "CC", "Open or screen packet index"),
    ...flatLeadRows(data.blackwill, "Blackwill Subject Files", "BW", "Complete-series review"),
    ...flatLeadRows(data.blackwillChron, "Blackwill Chronological Files", "BC", "Open or screen chronological packet"),
    ...flatLeadRows(data.gates, "Gates Chronological Files", "GC", "Screen for copied or staff-context records"),
    ...flatLeadRows(data.scout, "NARA Scout", "Scout", "Screen Scout lead"),
    ...requestedLeadRows(data.requested)
  ].sort((a, b) => worksheetRank(b) - worksheetRank(a) || clean(a.candidateId).localeCompare(clean(b.candidateId)));
  const header = [
    "reviewStatus",
    "compilerDecision",
    "compilerNotes",
    "candidateId",
    "lane",
    "suggestedAction",
    "priority",
    "chapter",
    "date",
    "type",
    "title",
    "peopleOrSignals",
    "releaseStatus",
    "accessRestriction",
    "pageCount",
    "score",
    "naid",
    "sourceSeries",
    "sourceNote",
    "researchNote",
    "scheduleReferences",
    "catalogUrl",
    "pdfUrl"
  ];
  return `${csvRow(header)}\n${rows.map((row) => csvRow(header.map((field) => row[field]))).join("\n")}\n`;
}

function sourceLeadWorksheetRows(data) {
  return [
    ...flatLeadRows(data.central, "Central Chronological Files", "CC", "Open or screen packet index"),
    ...flatLeadRows(data.blackwill, "Blackwill Subject Files", "BW", "Complete-series review"),
    ...flatLeadRows(data.blackwillChron, "Blackwill Chronological Files", "BC", "Open or screen chronological packet"),
    ...flatLeadRows(data.gates, "Gates Chronological Files", "GC", "Screen for copied or staff-context records"),
    ...flatLeadRows(data.scout, "NARA Scout", "Scout", "Screen Scout lead"),
    ...requestedLeadRows(data.requested)
  ];
}

function reviewQueueBucket(row) {
  const text = `${row.lane} ${row.priority} ${row.peopleOrSignals} ${row.suggestedAction}`;
  if (/Open packet first/i.test(text)) return "Open first";
  if (/High-value/i.test(text)) return "High-value source pool";
  if (/memcon|telcon|memorandum of conversation|telephone conversation/i.test(text)) return "Conversation signal";
  if (/MDR|restriction|restricted/i.test(text)) return "Restriction/MDR check";
  if (/OCR/i.test(text) || row.peopleOrSignals) return "Signal review";
  return "Screen";
}

function reviewQueueReason(row) {
  const signals = clean(row.peopleOrSignals);
  if (signals) return signals;
  return clean([row.priority, row.suggestedAction, row.sourceSeries].filter(Boolean).join("; "));
}

function reviewQueueRows(data) {
  return sourceLeadWorksheetRows(data)
    .map((row) => ({
      ...row,
      queueRank: Math.round(worksheetRank(row)),
      queueBucket: reviewQueueBucket(row),
      reviewReason: reviewQueueReason(row)
    }))
    .sort((a, b) => b.queueRank - a.queueRank || clean(a.chapter).localeCompare(clean(b.chapter)) || clean(a.candidateId).localeCompare(clean(b.candidateId)));
}

function chapterQueueRows(rows, chapterName, limit) {
  return rows
    .filter((row) => {
      if (row.chapter === "Cross-chapter") return chapterName === "Regional";
      return row.chapter.split(";").map((chapter) => chapter.trim()).includes(chapterName);
    })
    .slice(0, limit);
}

function reviewQueueLink(row) {
  return [mdLink("Catalog", row.catalogUrl), mdLink("PDF", row.pdfUrl)].filter(Boolean).join(" | ");
}

function reviewQueueMarkdownReason(row) {
  const reason = clean(row.reviewReason);
  return reason.length > 260 ? `${reason.slice(0, 257)}...` : reason;
}

function buildReviewQueueMarkdown(data) {
  const rows = reviewQueueRows(data);
  const topRows = CHAPTER_ORDER.flatMap((chapterName) => chapterQueueRows(rows, chapterName, 15));
  const bucketCounts = [...new Set(rows.map((row) => row.queueBucket))]
    .sort()
    .map((bucket) => [bucket, rows.filter((row) => row.queueBucket === bucket).length]);
  const lines = [
    "# FRUS 1989-1992 Volume VI Next Review Queue",
    "",
    "This packet distills the source-lane worksheet into a chapter-by-chapter opening queue. It keeps the same candidate IDs as the selection worksheet, so a compiler can move from this list to the spreadsheet without remapping rows.",
    "",
    "## Snapshot",
    "",
    `- Source-lane candidates in queue: ${rows.length}`,
    `- Markdown chapter slots shown: ${topRows.length} (15 per chapter where available; some cross-chapter candidates repeat where useful)`,
    "- Ranking favors open-first packets, high-value source pools, memcon/telcon signals, OCR/document signals, and Cyprus/Regional gaps.",
    "",
    markdownTable(["Bucket", "Rows"], bucketCounts),
    ""
  ];
  for (const chapterName of CHAPTER_ORDER) {
    const chapterRows = chapterQueueRows(rows, chapterName, 15);
    lines.push(`## Chapter ${CHAPTER_ORDER.indexOf(chapterName) + 1}: ${chapterName}`, "");
    lines.push(
      markdownTable(
        ["Rank", "Bucket", "Candidate", "Lane", "Date", "Title", "Why Open", "Links"],
        chapterRows.map((row) => [
          row.queueRank,
          row.queueBucket,
          row.candidateId,
          row.lane,
          row.date,
          row.title,
          reviewQueueMarkdownReason(row),
          reviewQueueLink(row)
        ])
      ),
      ""
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildReviewQueueCsv(data) {
  const rows = reviewQueueRows(data);
  const header = [
    "reviewStatus",
    "compilerDecision",
    "compilerNotes",
    "queueRank",
    "queueBucket",
    "candidateId",
    "lane",
    "suggestedAction",
    "priority",
    "chapter",
    "date",
    "title",
    "whyOpen",
    "score",
    "naid",
    "sourceSeries",
    "sourceNote",
    "researchNote",
    "catalogUrl",
    "pdfUrl"
  ];
  return `${csvRow(header)}\n${rows
    .map((row) =>
      csvRow([
        "",
        "",
        "",
        row.queueRank,
        row.queueBucket,
        row.candidateId,
        row.lane,
        row.suggestedAction,
        row.priority,
        row.chapter,
        row.date,
        row.title,
        row.reviewReason,
        row.score,
        row.naid,
        row.sourceSeries,
        row.sourceNote,
        row.researchNote,
        row.catalogUrl,
        row.pdfUrl
      ])
    )
    .join("\n")}\n`;
}

function selectedContextByCandidate(records, data) {
  const matches = new Map();
  for (const row of sourceCrosswalkRows(records, data).filter((row) => row.candidateId)) {
    const items = matches.get(row.candidateId) || [];
    items.push(`Doc ${row.compilerNumber}`);
    matches.set(row.candidateId, [...new Set(items)]);
  }
  return matches;
}

function gapNeed(chapterName, coverageRow) {
  if (chapterName === "Cyprus") {
    return `Thin selected chronology: ${coverageRow.records} selected records versus ${coverageRow.central} Central leads and ${coverageRow.requestedLeads} requested-pool leads.`;
  }
  if (chapterName === "Regional") {
    return `Largest apparent gap: ${coverageRow.records} selected record versus ${coverageRow.scout} Scout, ${coverageRow.central} Central, ${coverageRow.blackwillChron} Blackwill Chron, ${coverageRow.gates} Gates, and ${coverageRow.requestedLeads} requested-pool leads.`;
  }
  return `Supplemental check: ${coverageRow.records} selected records; screen high-signal source packets for missed context or appendices.`;
}

function gapFillRank(row, chapterName, selectedContextMatches) {
  let rank = Number(row.queueRank || worksheetRank(row) || 0);
  if (chapterName === "Regional") rank += 230;
  if (chapterName === "Cyprus") rank += 190;
  if (/Open packet first/i.test(row.priority)) rank += 80;
  if (/High-value/i.test(row.priority)) rank += 60;
  if (/memcon|telcon|memorandum of conversation|telephone conversation/i.test(`${row.title} ${row.peopleOrSignals} ${row.sourceSeries}`)) rank += 70;
  if (/Central Chronological|Blackwill Chronological/i.test(row.lane)) rank += 40;
  if (/Scowcroft|NSC|NSR|NSD|Presidential Daily File|IF Transition/i.test(row.lane)) rank += 35;
  if (row.pdfUrl) rank += 15;
  if (selectedContextMatches.length) rank -= 35;
  return Math.round(rank);
}

function gapFillDisposition(selectedContextMatches) {
  return selectedContextMatches.length
    ? "Context for selected record; screen for additional documents"
    : "Potential gap-fill addition";
}

function compactReviewReason(row) {
  const reason = reviewQueueReason(row);
  return reason.length > 220 ? `${reason.slice(0, 217)}...` : reason;
}

function gapFillReason(row, chapterName, selectedContextMatches, coverageRow) {
  const parts = [
    gapNeed(chapterName, coverageRow),
    reviewQueueBucket(row),
    compactReviewReason(row),
    selectedContextMatches.length ? `Already crosswalks to ${selectedContextMatches.join(", ")}; open for surrounding or enclosed material.` : "No selected-document crosswalk match above threshold."
  ];
  return parts.map(clean).filter(Boolean).join(" ");
}

function gapFillRows(records, data) {
  const coverage = chapterCoverage(records, data);
  const selectedContext = selectedContextByCandidate(records, data);
  const reviewRows = reviewQueueRows(data);
  const chapterLimits = {
    Greece: 12,
    Cyprus: 25,
    Turkey: 12,
    Regional: 25
  };
  const rows = [];
  for (const chapterName of CHAPTER_ORDER) {
    const coverageRow = coverage.find((row) => row.chapterName === chapterName);
    const candidates = reviewRows
      .filter((row) => rowAppliesToChapter(row, chapterName))
      .map((row) => {
        const selectedContextMatches = selectedContext.get(row.candidateId) || [];
        return {
          reviewStatus: "",
          compilerDecision: "",
          compilerNotes: "",
          chapter: chapterName,
          gapRank: gapFillRank(row, chapterName, selectedContextMatches),
          gapNeed: gapNeed(chapterName, coverageRow),
          candidateDisposition: gapFillDisposition(selectedContextMatches),
          candidateId: row.candidateId,
          lane: row.lane,
          queueBucket: row.queueBucket,
          priority: row.priority,
          date: row.date,
          title: row.title,
          whyConsider: gapFillReason(row, chapterName, selectedContextMatches, coverageRow),
          selectedContextMatches: selectedContextMatches.join("; "),
          peopleOrSignals: row.peopleOrSignals,
          score: row.score,
          naid: row.naid,
          sourceSeries: row.sourceSeries,
          sourceNote: row.sourceNote,
          researchNote: row.researchNote,
          catalogUrl: row.catalogUrl,
          pdfUrl: row.pdfUrl
        };
      })
      .sort((a, b) => b.gapRank - a.gapRank || clean(a.candidateId).localeCompare(clean(b.candidateId)))
      .slice(0, chapterLimits[chapterName]);
    rows.push(...candidates);
  }
  return rows;
}

function buildGapFillMarkdown(records, data) {
  const rows = gapFillRows(records, data);
  const additionRows = rows.filter((row) => row.candidateDisposition === "Potential gap-fill addition");
  const contextRows = rows.filter((row) => row.candidateDisposition !== "Potential gap-fill addition");
  const lines = [
    "# FRUS 1989-1992 Volume VI Gap-Fill Candidate Worksheet",
    "",
    "This worksheet re-ranks source-lane leads around the compiler's selection-gap problem. It narrows the broad source queue into chapter candidate shortlists, especially for Cyprus and Regional coverage, and flags whether a packet already crosswalks to a selected chronology document.",
    "",
    "## Snapshot",
    "",
    `- Candidate shortlist rows: ${rows.length}`,
    `- Potential gap-fill additions: ${additionRows.length}`,
    `- Context packets tied to selected records: ${contextRows.length}`,
    "- Cyprus and Regional receive larger shortlists because the gap audit shows thin selected-document coverage relative to source-lane evidence.",
    "",
    markdownTable(
      ["Chapter", "Rows", "Potential additions", "Context-linked rows"],
      CHAPTER_ORDER.map((chapterName) => {
        const chapterRows = rows.filter((row) => row.chapter === chapterName);
        return [
          chapterName,
          chapterRows.length,
          chapterRows.filter((row) => row.candidateDisposition === "Potential gap-fill addition").length,
          chapterRows.filter((row) => row.candidateDisposition !== "Potential gap-fill addition").length
        ];
      })
    ),
    "",
    "## Use",
    "",
    "Open candidates with the highest gap rank first. Record any inclusion, exclusion, or follow-up decision in the selection worksheet using the same candidate ID.",
    ""
  ];
  for (const chapterName of CHAPTER_ORDER) {
    const chapterRows = rows.filter((row) => row.chapter === chapterName);
    lines.push(`## Chapter ${CHAPTER_ORDER.indexOf(chapterName) + 1}: ${chapterName}`, "");
    lines.push(
      markdownTable(
        ["Rank", "Disposition", "Candidate", "Lane", "Date", "Title", "Why Consider", "Selected Context", "Links"],
        chapterRows.map((row) => [
          row.gapRank,
          row.candidateDisposition,
          row.candidateId,
          row.lane,
          row.date,
          row.title,
          row.whyConsider,
          row.selectedContextMatches || "none",
          reviewQueueLink(row)
        ])
      ),
      ""
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildGapFillCsv(records, data) {
  const rows = gapFillRows(records, data);
  const header = [
    "reviewStatus",
    "compilerDecision",
    "compilerNotes",
    "chapter",
    "gapRank",
    "gapNeed",
    "candidateDisposition",
    "candidateId",
    "lane",
    "queueBucket",
    "priority",
    "date",
    "title",
    "whyConsider",
    "selectedContextMatches",
    "peopleOrSignals",
    "score",
    "naid",
    "sourceSeries",
    "sourceNote",
    "researchNote",
    "catalogUrl",
    "pdfUrl"
  ];
  return `${csvRow(header)}\n${rows.map((row) => csvRow(header.map((field) => row[field]))).join("\n")}\n`;
}

function normalizeMatchText(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function regexEscape(value) {
  return clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termAppears(text, term) {
  const normalizedTerm = normalizeMatchText(term);
  if (!normalizedTerm) return false;
  return new RegExp(`(^|[^a-z0-9])${regexEscape(normalizedTerm)}([^a-z0-9]|$)`, "i").test(text);
}

function monthName(month) {
  return [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ][Number(month) - 1];
}

function shortYear(year) {
  return String(year).slice(-2);
}

function dateVariants(date) {
  const match = clean(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return [];
  const [, year, month, day] = match;
  const numericMonth = String(Number(month));
  const numericDay = String(Number(day));
  const name = monthName(month);
  return [
    `${year}-${month}-${day}`,
    `${numericMonth}/${numericDay}/${year}`,
    `${numericMonth}/${numericDay}/${shortYear(year)}`,
    `${numericMonth}/${day}/${year}`,
    `${numericMonth}/${day}/${shortYear(year)}`,
    `${month}/${numericDay}/${year}`,
    `${month}/${numericDay}/${shortYear(year)}`,
    `${month}/${day}/${year}`,
    `${month}/${day}/${shortYear(year)}`,
    `${name} ${numericDay}, ${year}`,
    `${name} ${numericDay} ${year}`,
    `${name} ${numericDay}`
  ].filter((value, index, values) => values.indexOf(value) === index);
}

function normalizedIsoDate(year, month, day) {
  let numericYear = Number(year);
  if (String(year).length === 2) numericYear += numericYear >= 70 ? 1900 : 2000;
  return `${numericYear}-${String(Number(month)).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
}

function dateRangeSignals(record, row) {
  const text = clean([row.title, row.date].join(" "));
  const ranges = [];
  const pattern = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/g;
  let match;
  while ((match = pattern.exec(text))) {
    const start = normalizedIsoDate(match[3], match[1], match[2]);
    const end = normalizedIsoDate(match[6], match[4], match[5]);
    if (record.date >= start && record.date <= end) ranges.push(`${match[1]}/${match[2]}/${match[3]}-${match[4]}/${match[5]}/${match[6]}`);
  }
  return ranges;
}

function selectedPersonTerms(record) {
  const terms = new Set();
  for (const participant of record.participants || []) {
    if (/George H\.?\s*W\.?\s*Bush|NATO|allied representatives/i.test(participant)) continue;
    const tokens = normalizeMatchText(participant).split(/[^a-z0-9]+/).filter(Boolean);
    const last = tokens.at(-1);
    if (last && last.length > 2) terms.add(last);
  }
  return [...terms].sort();
}

function recordTypeTerms(record) {
  if (/telcon|telephone/i.test(record.type || record.title || "")) return ["telcon", "telephone conversation", "telephone call", "call"];
  if (/memcon|meeting|memorandum/i.test(record.type || record.title || "")) return ["memcon", "memorandum of conversation", "meeting"];
  return [];
}

function selectedCountryTerms(record) {
  return (record.countries || [])
    .filter((country) => country !== "United States")
    .map((country) => normalizeMatchText(country))
    .filter(Boolean);
}

function sourceLeadText(row) {
  return normalizeMatchText([
    row.title,
    row.peopleOrSignals,
    row.priority,
    row.lane,
    row.sourceSeries,
    row.sourceNote,
    row.researchNote
  ].join(" "));
}

function sourceLeadAppliesToChapter(row, chapterName) {
  if (row.chapter === "Cross-chapter") return chapterName === "Regional";
  return row.chapter.split(/[;,]/).map((chapter) => chapter.trim()).includes(chapterName);
}

function sameMonth(record, row) {
  const recordMonth = clean(record.date).slice(0, 7);
  const rowDate = clean(row.date);
  return /^\d{4}-\d{2}/.test(recordMonth) && rowDate.startsWith(recordMonth);
}

function sourceLeadMatch(record, row) {
  const text = sourceLeadText(row);
  const reasons = [];
  let score = 0;

  const chapterMatch = sourceLeadAppliesToChapter(row, record.chapter.name);
  if (chapterMatch) {
    score += 12;
    reasons.push(`chapter match: ${record.chapter.name}`);
  }

  if (sameMonth(record, row)) {
    score += 24;
    reasons.push(`same month: ${clean(record.date).slice(0, 7)}`);
  }

  const dateHits = dateVariants(record.date).filter((variant) => termAppears(text, variant));
  if (dateHits.length) {
    score += 30;
    reasons.push(`date signal: ${dateHits[0]}`);
  }

  const rangeHits = dateRangeSignals(record, row);
  if (rangeHits.length) {
    score += 28;
    reasons.push(`date-range signal: ${rangeHits[0]}`);
  }

  const personTerms = selectedPersonTerms(record);
  const personHits = personTerms.filter((term) => termAppears(text, term));
  if (personHits.length) {
    score += Math.min(54, personHits.length * 18);
    reasons.push(`person signal: ${personHits.join(", ")}`);
  }

  const typeHits = recordTypeTerms(record).filter((term) => termAppears(text, term));
  if (typeHits.length) {
    score += 18;
    reasons.push(`document-type signal: ${typeHits[0]}`);
  }

  const countryHits = selectedCountryTerms(record).filter((term) => termAppears(text, term));
  if (countryHits.length) {
    score += Math.min(10, countryHits.length * 5);
    reasons.push(`country signal: ${countryHits.join(", ")}`);
  }

  if (/Open packet first/i.test(row.priority)) {
    score += 8;
    reasons.push("open-first packet");
  } else if (/High-value/i.test(row.priority)) {
    score += 6;
    reasons.push("high-value packet");
  }

  if (/OCR|signal/i.test(row.priority) || row.peopleOrSignals) {
    score += 4;
  }

  if (score < 46) return null;
  const hasDateSignal = dateHits.length || rangeHits.length || sameMonth(record, row);
  if (!hasDateSignal) return null;
  const dailyContextLane = /Presidential Daily File|Presidential Daily Diary/i.test(row.lane);
  if (!typeHits.length && !dailyContextLane) return null;
  if (personTerms.length && !personHits.length) {
    const regionalFallback = record.chapter.name === "Regional" && typeHits.length && countryHits.length && hasDateSignal;
    if (!regionalFallback) return null;
  }

  return {
    score,
    reasons,
    personHits,
    typeHits,
    dateHits,
    countryHits
  };
}

function sourceCrosswalkRows(records, data) {
  const leadRows = sourceLeadWorksheetRows(data).filter((row) => row.catalogUrl || row.pdfUrl);
  const rows = [];
  for (const record of records) {
    const matches = leadRows
      .map((row) => ({ row, match: sourceLeadMatch(record, row) }))
      .filter((entry) => entry.match)
      .sort(
        (a, b) =>
          b.match.score - a.match.score ||
          clean(a.row.lane).localeCompare(clean(b.row.lane)) ||
          clean(a.row.candidateId).localeCompare(clean(b.row.candidateId))
      )
      .slice(0, 6);

    if (!matches.length) {
      rows.push({
        reviewStatus: "",
        compilerDecision: "",
        compilerNotes: "",
        compilerNumber: record.compilerNumber,
        recordId: record.id,
        chapter: record.chapter.name,
        date: record.date,
        type: record.type,
        title: record.documentTitle || record.title,
        selectedNaid: record.naid,
        selectedCatalogUrl: record.catalogUrl,
        selectedPdfUrl: record.pdfUrl,
        scheduleNaids: (record.scheduleReferences || []).map((reference) => reference.naid).join("; "),
        matchRank: "",
        matchScore: "",
        matchStatus: "No source-lane match above threshold",
        matchReasons: "",
        candidateId: "",
        lane: "",
        candidateDate: "",
        candidateTitle: "",
        candidateNaid: "",
        candidatePriority: "",
        sourceSeries: "",
        candidateCatalogUrl: "",
        candidatePdfUrl: ""
      });
      continue;
    }

    matches.forEach((entry, index) => {
      rows.push({
        reviewStatus: "",
        compilerDecision: "",
        compilerNotes: "",
        compilerNumber: record.compilerNumber,
        recordId: record.id,
        chapter: record.chapter.name,
        date: record.date,
        type: record.type,
        title: record.documentTitle || record.title,
        selectedNaid: record.naid,
        selectedCatalogUrl: record.catalogUrl,
        selectedPdfUrl: record.pdfUrl,
        scheduleNaids: (record.scheduleReferences || []).map((reference) => reference.naid).join("; "),
        matchRank: index + 1,
        matchScore: entry.match.score,
        matchStatus: "Review likely source/context packet",
        matchReasons: entry.match.reasons.join("; "),
        candidateId: entry.row.candidateId,
        lane: entry.row.lane,
        candidateDate: entry.row.date,
        candidateTitle: entry.row.title,
        candidateNaid: entry.row.naid,
        candidatePriority: entry.row.priority,
        sourceSeries: entry.row.sourceSeries,
        candidateCatalogUrl: entry.row.catalogUrl,
        candidatePdfUrl: entry.row.pdfUrl
      });
    });
  }
  return rows;
}

function buildSourceCrosswalkMarkdown(records, data) {
  const rows = sourceCrosswalkRows(records, data);
  const matchedDocs = new Set(rows.filter((row) => row.candidateId).map((row) => row.compilerNumber));
  const unmatched = rows.filter((row) => !row.candidateId);
  const topRows = rows.filter((row) => row.matchRank === 1);
  const lines = [
    "# FRUS 1989-1992 Volume VI Selected Document Source Crosswalk",
    "",
    "This crosswalk maps each selected chronology document to likely source-lane packets in Central Chronological Files, Blackwill files, Gates files, NARA Scout leads, and requested source pools. Treat matches as review leads: open the packet/PDF and verify before making a compiler decision.",
    "",
    "## Snapshot",
    "",
    `- Selected chronology documents: ${records.length}`,
    `- Documents with at least one source-lane match: ${matchedDocs.size}`,
    `- Documents with no source-lane match above threshold: ${unmatched.length}`,
    `- Crosswalk rows: ${rows.length}`,
    "",
    "## Best Match By Selected Document",
    "",
    markdownTable(
      ["Doc", "Chapter", "Date", "Selected document", "Best candidate", "Lane", "Score", "Why", "Links"],
      records.map((record) => {
        const best = topRows.find((row) => row.compilerNumber === record.compilerNumber);
        return [
          `Doc ${record.compilerNumber}`,
          record.chapter.name,
          record.date,
          record.documentTitle || record.title,
          best ? `${best.candidateId} - ${best.candidateTitle}` : "No source-lane match above threshold",
          best?.lane || "",
          best?.matchScore || "",
          best?.matchReasons || "",
          best ? [mdLink("Selected", record.pdfUrl), mdLink("Candidate", best.candidatePdfUrl || best.candidateCatalogUrl)].filter(Boolean).join(" / ") : mdLink("Selected", record.pdfUrl)
        ];
      })
    ),
    "",
    "## Review Rows",
    "",
    markdownTable(
      ["Doc", "Rank", "Score", "Candidate", "Lane", "Date", "Why", "Links"],
      rows
        .filter((row) => row.candidateId)
        .map((row) => [
          `Doc ${row.compilerNumber}`,
          row.matchRank,
          row.matchScore,
          `${row.candidateId} - ${row.candidateTitle}`,
          row.lane,
          row.candidateDate,
          row.matchReasons,
          [mdLink("Selected", row.selectedPdfUrl), mdLink("Candidate", row.candidatePdfUrl || row.candidateCatalogUrl)].filter(Boolean).join(" / ")
        ])
    ),
    ""
  ];
  return `${lines.join("\n")}\n`;
}

function buildSourceCrosswalkCsv(records, data) {
  const rows = sourceCrosswalkRows(records, data);
  const header = [
    "reviewStatus",
    "compilerDecision",
    "compilerNotes",
    "compilerNumber",
    "recordId",
    "chapter",
    "date",
    "type",
    "title",
    "selectedNaid",
    "selectedCatalogUrl",
    "selectedPdfUrl",
    "scheduleNaids",
    "matchRank",
    "matchScore",
    "matchStatus",
    "matchReasons",
    "candidateId",
    "lane",
    "candidateDate",
    "candidateTitle",
    "candidateNaid",
    "candidatePriority",
    "sourceSeries",
    "candidateCatalogUrl",
    "candidatePdfUrl"
  ];
  return `${csvRow(header)}\n${rows.map((row) => csvRow(header.map((field) => row[field]))).join("\n")}\n`;
}

function reportLink(label, filename) {
  return `[${label}](${filename})`;
}

function buildCompilerHandoff(records, data, persons) {
  const pages = records.reduce((sum, record) => sum + (record.pageCount || 0), 0);
  const actionRows = compilerActionQueueRows(records, data, persons);
  const coverageRows = sourceCoverageRows(records, data, persons);
  const sourceRows = sourceLeadWorksheetRows(data);
  const reviewRows = reviewQueueRows(data);
  const documentRegisterRowsCount = documentRegisterRows(records, data).length;
  const dossierRows = chapterDossierRows(records, data);
  const sourceCrosswalk = sourceCrosswalkRows(records, data);
  const gapFillCandidateRows = gapFillRows(records, data);
  const personRows = personDocumentRows(records, persons);
  const declassRows = declassificationReviewRows(records);
  const declassRequestRows = declassificationRequestRows(records, data);
  const qualityRows = dataQualityRows(records, data);
  const qualityFixRows = qualityRows.filter((row) => row.severity === "fix before citation");
  const missingScheduleRefs = records.filter((record) => !(record.scheduleReferences || []).length);
  const coverage = chapterCoverage(records, data);
  const requestedTotal = data.requested.reduce((sum, source) => sum + (source.queryHitFiles || 0), 0);
  const lines = [
    "# FRUS 1989-1992 Volume VI Compiler Handoff",
    "",
    "This is the start-here packet for the Eastern Mediterranean research assistant. It points the compiler to the live site, the cloneable repository, and the exports that should be opened first.",
    "",
    "## Links",
    "",
    "- Live site: https://therealjameswilson.github.io/GCT-89-92/",
    "- GitHub repository: https://github.com/therealjameswilson/GCT-89-92",
    "- Clone command: `git clone https://github.com/therealjameswilson/GCT-89-92.git`",
    "",
    "## Recommended Opening Order",
    "",
    "1. Start with the live chronology. It is the first section of the page and is organized into Greece, Cyprus, Turkey, and Regional chapters.",
    `2. Open ${reportLink("Compiler Action Queue", "compiler-action-queue.md")} for the ranked Monday-morning worklist across declassification, citation cleanup, gap filling, source-pool caveats, and apparatus review.`,
    `3. Open ${reportLink("Source Coverage Matrix", "compiler-source-coverage.md")} to verify which requested collections and compiler deliverables are covered, with counts and caveats.`,
    `4. Open ${reportLink("Draft Document Register", "compiler-document-register.md")} to translate the selected chronology into continuous draft document numbers, source-note drafts, and publication-apparatus cleanup flags.`,
    `5. Open ${reportLink("Chapter Dossiers", "compiler-chapter-dossiers.md")} when working one chapter at a time; it gathers selected chronology rows, top source leads, release follow-ups, and citation issues.`,
    `6. Open ${reportLink("Gap-Fill Candidate Worksheet", "compiler-gap-fill-candidates.md")} to work the Cyprus and Regional selection gaps from a narrowed candidate-addition shortlist.`,
    `7. Open ${reportLink("Selected Document Source Crosswalk", "compiler-source-crosswalk.md")} to see likely Central/Blackwill/Scowcroft/source-pool packets for each selected document.`,
    `8. Open ${reportLink("Next Review Queue", "compiler-next-review-queue.md")} for the cross-chapter source-lane packets most worth opening next.`,
    `9. Open ${reportLink("Declassification Packet", "compiler-declassification-review.md")} before final selection; it isolates partial releases, denials, marker sheets, and no-document rows.`,
    `10. Use ${reportLink("Declassification Request Worksheet", "compiler-declassification-requests.md")} to turn those release-status risks into assignable request language and MDR/search follow-up rows.`,
    `11. Open ${reportLink("Data-Quality Audit", "compiler-data-quality-audit.md")} before citation cleanup; it flags title variants, date mismatches, schedule caveats, and Catalog harvest issues.`,
    `12. Use ${reportLink("Selection Worksheet", "compiler-selection-worksheet.csv")} as the master working spreadsheet for review status, compiler decisions, and notes.`,
    `13. Use ${reportLink("Persons Document Index", "compiler-persons-document-index.md")} to connect selected documents to persons-list entries and participant variants.`,
    `14. Use ${reportLink("Persons List", "persons-list.md")} when drafting or checking FRUS-style identifications.`,
    "",
    "## Current Inventory",
    "",
    markdownTable(
      ["Artifact", "Use", "Current count"],
      [
        [reportLink("Working chronology pack", "compiler-chronology.md"), "Selected declassified chronology with source notes and schedule references", `${records.length} records / ${pages} PDF pages`],
        [reportLink("Source-note spreadsheet", "compiler-source-notes.csv"), "Sortable source-note and schedule-reference export", `${records.length} rows`],
        [reportLink("Compiler action queue", "compiler-action-queue.md"), "Single ranked worklist across release/search blockers, citation cleanup, gaps, coverage caveats, and apparatus review", `${actionRows.length} rows`],
        [reportLink("Source coverage matrix", "compiler-source-coverage.md"), "Requirement-to-artifact provenance matrix for requested source coverage and caveats", `${coverageRows.length} rows`],
        [reportLink("Draft document register", "compiler-document-register.md"), "Continuous draft document numbers, heading drafts, source-note drafts, and apparatus cleanup flags", `${documentRegisterRowsCount} rows`],
        [reportLink("Chapter dossiers", "compiler-chapter-dossiers.md"), "Per-chapter workbench combining chronology, top leads, declassification, and data-quality issues", `${dossierRows.length} dossier rows`],
        [reportLink("Gap-fill candidate worksheet", "compiler-gap-fill-candidates.md"), "Ranked candidate-addition shortlist focused on Cyprus and Regional selection gaps", `${gapFillCandidateRows.length} rows`],
        [reportLink("Selected document source crosswalk", "compiler-source-crosswalk.md"), "Likely source/context packets for each selected chronology document", `${sourceCrosswalk.length} rows`],
        [reportLink("Next review queue", "compiler-next-review-queue.md"), "Chapter-ranked source-lane opening queue", `${reviewRows.length} source-lane candidates`],
        [reportLink("Selection worksheet", "compiler-selection-worksheet.csv"), "Master decision spreadsheet across selected records and source leads", `${records.length + sourceRows.length} rows`],
        [reportLink("Gap audit", "compiler-gap-audit.md"), "Chapter coverage and risk register", `${CHAPTER_ORDER.length} chapter rows`],
        [reportLink("Declassification packet", "compiler-declassification-review.md"), "Release-status and marker follow-up queue", `${declassRows.length} rows`],
        [reportLink("Declassification request worksheet", "compiler-declassification-requests.md"), "Assignable request language with schedule evidence and source-packet context", `${declassRequestRows.length} rows`],
        [reportLink("Data-quality audit", "compiler-data-quality-audit.md"), "Metadata, date, title, and schedule-caveat cleanup queue", `${qualityRows.length} rows`],
        [reportLink("Persons document index", "compiler-persons-document-index.md"), "Participant-to-document coverage index for selected chronology records", `${personRows.length} rows`],
        [reportLink("Persons list", "persons-list.md"), "FRUS-style persons list working copy", `${persons.length} entries`]
      ]
    ),
    "",
    "## Source-Lane Counts",
    "",
    markdownTable(["Lane", "Count"], sourceLaneTotals(data)),
    "",
    "## Risk Snapshot",
    "",
    `- Declassification review rows: ${declassRows.length}`,
    `- Data-quality rows marked fix before citation: ${qualityFixRows.length}`,
    `- Selected chronology rows without schedule corroboration: ${missingScheduleRefs.length ? missingScheduleRefs.map((record) => `Doc ${record.compilerNumber}`).join(", ") : "none"}`,
    `- Requested source pools retained for review: ${data.requested.length} pools / ${requestedTotal} EastMed leads`,
    "",
    markdownTable(
      ["Chapter", "Selected records", "Central leads", "Central open first", "Blackwill chron leads", "Gates leads", "Requested-pool leads"],
      coverage.map((row) => [
        row.chapterName,
        row.records,
        row.central,
        row.centralOpenFirst,
        row.blackwillChron,
        row.gates,
        row.requestedLeads
      ])
    ),
    "",
    "## Working Rule",
    "",
    "Do not treat the source-lane leads as selected documents until the compiler has opened the packet/PDF, verified relevance, resolved release or citation issues, and recorded a decision in the selection worksheet.",
    ""
  ];
  return `${lines.join("\n")}\n`;
}

function rowAppliesToChapter(row, chapterName) {
  const chapter = clean(row.chapter);
  if (!chapter) return false;
  if (chapter === "Cross-chapter") return chapterName === "Regional";
  return chapter.split(/[;,]/).map((part) => part.trim()).includes(chapterName);
}

function chapterDossierRows(records, data) {
  const reviewRows = reviewQueueRows(data);
  const declassRows = declassificationReviewRows(records);
  const qualityRows = dataQualityRows(records, data);
  const rows = [];
  for (const chapterName of CHAPTER_ORDER) {
    records
      .filter((record) => record.chapter.name === chapterName)
      .forEach((record) => {
        rows.push({
          reviewStatus: "",
          compilerDecision: "",
          compilerNotes: "",
          chapter: chapterName,
          rowType: "Selected chronology",
          priority: releaseNeedsAttention(record) ? "Release/marker review" : "Selected",
          candidateId: `Doc ${record.compilerNumber}`,
          date: record.date,
          title: record.documentTitle || record.title,
          lane: record.type,
          reason: (record.participants || []).join("; "),
          sourceNote: record.sourceNote,
          researchNote: record.researchNote,
          catalogUrl: record.catalogUrl,
          pdfUrl: record.pdfUrl
        });
      });
    chapterQueueRows(reviewRows, chapterName, 25).forEach((row) => {
      rows.push({
        reviewStatus: "",
        compilerDecision: "",
        compilerNotes: "",
        chapter: chapterName,
        rowType: "Source lead",
        priority: `${row.queueRank} / ${row.queueBucket}`,
        candidateId: row.candidateId,
        date: row.date,
        title: row.title,
        lane: row.lane,
        reason: row.reviewReason,
        sourceNote: row.sourceNote,
        researchNote: row.researchNote,
        catalogUrl: row.catalogUrl,
        pdfUrl: row.pdfUrl
      });
    });
    declassRows
      .filter((row) => row.chapter === chapterName)
      .forEach((row) => {
        rows.push({
          reviewStatus: row.reviewStatus,
          compilerDecision: "",
          compilerNotes: row.outcome,
          chapter: chapterName,
          rowType: "Declassification follow-up",
          priority: row.releaseStatus,
          candidateId: `Doc ${row.compilerNumber}`,
          date: row.date,
          title: row.title,
          lane: row.type,
          reason: row.suggestedAction,
          sourceNote: row.sourceNote,
          researchNote: row.researchNote,
          catalogUrl: row.catalogUrl,
          pdfUrl: row.pdfUrl
        });
      });
    qualityRows
      .filter((row) => rowAppliesToChapter(row, chapterName))
      .forEach((row) => {
        rows.push({
          reviewStatus: row.reviewStatus || "",
          compilerDecision: "",
          compilerNotes: row.outcome || "",
          chapter: chapterName,
          rowType: "Citation/data-quality issue",
          priority: row.severity,
          candidateId: row.candidateId,
          date: row.date,
          title: row.title,
          lane: row.lane,
          reason: `${row.issue}: ${row.detail}`,
          sourceNote: row.suggestedAction,
          researchNote: "",
          catalogUrl: row.catalogUrl,
          pdfUrl: row.pdfUrl
        });
      });
  }
  return rows;
}

function buildChapterDossiersMarkdown(records, data) {
  const reviewRows = reviewQueueRows(data);
  const declassRows = declassificationReviewRows(records);
  const qualityRows = dataQualityRows(records, data);
  const coverage = chapterCoverage(records, data);
  const lines = [
    "# FRUS 1989-1992 Volume VI Chapter Dossiers",
    "",
    "This packet is a chapter workbench. Each chapter gathers the selected chronology, highest-ranked source leads, declassification follow-ups, and citation/data-quality issues so a compiler can work one chapter without jumping across every export.",
    ""
  ];
  lines.push(
    markdownTable(
      ["Chapter", "Selected records", "Pages", "Top source slots", "Declassification rows", "Data-quality rows"],
      CHAPTER_ORDER.map((chapterName) => {
        const row = coverage.find((item) => item.chapterName === chapterName);
        return [
          chapterName,
          row.records,
          row.pages,
          chapterQueueRows(reviewRows, chapterName, 25).length,
          declassRows.filter((item) => item.chapter === chapterName).length,
          qualityRows.filter((item) => rowAppliesToChapter(item, chapterName)).length
        ];
      })
    ),
    ""
  );
  for (const chapterName of CHAPTER_ORDER) {
    const coverageRow = coverage.find((row) => row.chapterName === chapterName);
    const selectedRows = records.filter((record) => record.chapter.name === chapterName);
    const sourceRows = chapterQueueRows(reviewRows, chapterName, 12);
    const releaseRows = declassRows.filter((row) => row.chapter === chapterName);
    const citationRows = qualityRows.filter((row) => rowAppliesToChapter(row, chapterName));
    lines.push(`## Chapter ${CHAPTER_ORDER.indexOf(chapterName) + 1}: ${chapterName}`, "");
    lines.push(
      markdownTable(
        ["Metric", "Value"],
        [
          ["Selected chronology records", coverageRow.records],
          ["Selected PDF pages", coverageRow.pages],
          ["Central Chron leads / open first", `${coverageRow.central} / ${coverageRow.centralOpenFirst}`],
          ["Blackwill Chron leads / open first", `${coverageRow.blackwillChron} / ${coverageRow.blackwillOpenFirst}`],
          ["Gates leads", coverageRow.gates],
          ["Requested-pool leads", coverageRow.requestedLeads]
        ]
      ),
      "",
      "### Selected Chronology",
      "",
      markdownTable(
        ["Doc", "Date", "Type", "Title", "Release", "Links"],
        selectedRows.map((record) => [
          `Doc ${record.compilerNumber}`,
          record.date,
          record.type,
          record.documentTitle || record.title,
          record.releaseStatus,
          recordLinks(record)
        ])
      ),
      "",
      "### Source Leads To Open Next",
      "",
      markdownTable(
        ["Rank", "Bucket", "Candidate", "Lane", "Date", "Title", "Why Open", "Links"],
        sourceRows.map((row) => [
          row.queueRank,
          row.queueBucket,
          row.candidateId,
          row.lane,
          row.date,
          row.title,
          reviewQueueMarkdownReason(row),
          reviewQueueLink(row)
        ])
      ),
      "",
      "### Declassification Follow-Up",
      "",
      releaseRows.length
        ? markdownTable(
            ["Doc", "Date", "Release", "Title", "Suggested Action", "Links"],
            releaseRows.map((row) => [
              `Doc ${row.compilerNumber}`,
              row.date,
              row.releaseStatus,
              row.title,
              row.suggestedAction,
              recordLinks(row)
            ])
          )
        : "No chapter-specific declassification follow-up rows.",
      "",
      "### Citation And Data-Quality Issues",
      "",
      citationRows.length
        ? markdownTable(
            ["Severity", "Candidate", "Date", "Title", "Issue", "Action", "Links"],
            citationRows.map((row) => [
              row.severity,
              row.candidateId,
              row.date,
              row.title,
              row.issue,
              row.suggestedAction,
              issueLinks(row)
            ])
          )
        : "No chapter-specific data-quality rows.",
      ""
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildChapterDossiersCsv(records, data) {
  const rows = chapterDossierRows(records, data);
  const header = [
    "reviewStatus",
    "compilerDecision",
    "compilerNotes",
    "chapter",
    "rowType",
    "priority",
    "candidateId",
    "date",
    "title",
    "lane",
    "reason",
    "sourceNote",
    "researchNote",
    "catalogUrl",
    "pdfUrl"
  ];
  return `${csvRow(header)}\n${rows.map((row) => csvRow(header.map((field) => row[field]))).join("\n")}\n`;
}

function normalizePersonText(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function personEntryNameParts(entry) {
  const [last = "", rest = ""] = entry.split(",", 2);
  const given = rest.split(/[;,]/)[0] || "";
  return {
    last: normalizePersonText(last),
    givenTokens: normalizePersonText(given)
      .split(" ")
      .filter((token) => token.length > 1)
  };
}

function participantMatchesPersonEntry(participant, entry) {
  const participantText = normalizePersonText(participant);
  const { last, givenTokens } = personEntryNameParts(entry);
  if (!last || !participantText.includes(last)) return false;
  if (!givenTokens.length) return true;
  return givenTokens.some((token) => participantText.includes(token));
}

function personEntryForParticipant(persons, participant) {
  return persons.find((person) => participantMatchesPersonEntry(participant, person.entry)) || null;
}

function personDocumentRows(records, persons) {
  const groups = new Map();
  for (const record of records) {
    for (const participant of record.participants || []) {
      const match = personEntryForParticipant(persons, participant);
      const key = match ? `entry:${match.id}` : `review:${participant}`;
      if (!groups.has(key)) {
        groups.set(key, {
          personsListStatus: match ? "Matched" : "Review",
          personKey: match ? match.entry.split(",").slice(0, 2).join(",").trim() : participant,
          participantVariants: new Set(),
          personsListEntry: match?.entry || "",
          documents: []
        });
      }
      const group = groups.get(key);
      group.participantVariants.add(participant);
      group.documents.push(record);
    }
  }
  return [...groups.values()]
    .map((group) => {
      const sortedDocs = [...group.documents].sort(
        (a, b) =>
          clean(a.sortDate || a.date).localeCompare(clean(b.sortDate || b.date)) ||
          a.chapter.number - b.chapter.number ||
          clean(a.title).localeCompare(clean(b.title))
      );
      const chapters = CHAPTER_ORDER.filter((chapterName) => sortedDocs.some((record) => record.chapter.name === chapterName));
      const docsByChapter = Object.fromEntries(
        CHAPTER_ORDER.map((chapterName) => [
          chapterName,
          sortedDocs
            .filter((record) => record.chapter.name === chapterName)
            .map((record) => `Doc ${record.compilerNumber} (${record.date})`)
            .join("; ")
        ])
      );
      return {
        ...group,
        participantVariants: [...group.participantVariants].sort().join("; "),
        documentCount: sortedDocs.length,
        chapters: chapters.join("; "),
        firstDate: sortedDocs[0]?.date || "",
        lastDate: sortedDocs.at(-1)?.date || "",
        docsByChapter,
        documentDetails: sortedDocs
          .map((record) => `Doc ${record.compilerNumber} - ${record.date} - ${record.documentTitle || record.title}`)
          .join(" || "),
        reviewNote: group.personsListStatus === "Review" ? "No clear persons-list match; verify whether this should be an organizational/collective entry or excluded from persons list." : ""
      };
    })
    .sort((a, b) => a.personsListStatus.localeCompare(b.personsListStatus) || a.personKey.localeCompare(b.personKey));
}

function buildPersonsDocumentIndexMarkdown(records, persons) {
  const rows = personDocumentRows(records, persons);
  const reviewRows = rows.filter((row) => row.personsListStatus === "Review");
  const lines = [
    "# FRUS 1989-1992 Volume VI Persons Document Index",
    "",
    "This index ties selected chronology participants to the working FRUS-style persons list. It is intended for apparatus checking: confirm coverage, identify variant participant strings, and locate the documents in which each person appears.",
    "",
    "## Snapshot",
    "",
    `- Participant/person rows: ${rows.length}`,
    `- Matched to persons list: ${rows.filter((row) => row.personsListStatus === "Matched").length}`,
    `- Needs review: ${reviewRows.length}`,
    "",
    "## Coverage Summary",
    "",
    markdownTable(
      ["Status", "Person", "Participant variant(s)", "Docs", "Chapters", "First date", "Last date"],
      rows.map((row) => [
        row.personsListStatus,
        row.personKey,
        row.participantVariants,
        row.documentCount,
        row.chapters,
        row.firstDate,
        row.lastDate
      ])
    ),
    "",
    "## Chapter Document Matrix",
    "",
    markdownTable(
      ["Person", ...CHAPTER_ORDER],
      rows.map((row) => [
        row.personKey,
        ...CHAPTER_ORDER.map((chapterName) => row.docsByChapter[chapterName] || "")
      ])
    ),
    "",
    "## Persons List Entries",
    "",
    markdownTable(
      ["Person", "Persons-list entry"],
      rows
        .filter((row) => row.personsListEntry)
        .map((row) => [row.personKey, row.personsListEntry])
    ),
    "",
    "## Coverage Review",
    "",
    reviewRows.length
      ? markdownTable(
          ["Participant", "Docs", "Review note"],
          reviewRows.map((row) => [row.personKey, row.documentCount, row.reviewNote])
        )
      : "All participant strings have a clear persons-list match.",
    ""
  ];
  return `${lines.join("\n")}\n`;
}

function buildPersonsDocumentIndexCsv(records, persons) {
  const rows = personDocumentRows(records, persons);
  const header = [
    "personsListStatus",
    "personKey",
    "participantVariants",
    "documentCount",
    "chapters",
    "firstDate",
    "lastDate",
    "greeceDocs",
    "cyprusDocs",
    "turkeyDocs",
    "regionalDocs",
    "documentDetails",
    "personsListEntry",
    "reviewNote"
  ];
  return `${csvRow(header)}\n${rows
    .map((row) =>
      csvRow([
        row.personsListStatus,
        row.personKey,
        row.participantVariants,
        row.documentCount,
        row.chapters,
        row.firstDate,
        row.lastDate,
        row.docsByChapter.Greece,
        row.docsByChapter.Cyprus,
        row.docsByChapter.Turkey,
        row.docsByChapter.Regional,
        row.documentDetails,
        row.personsListEntry,
        row.reviewNote
      ])
    )
    .join("\n")}\n`;
}

function declassificationAction(record) {
  const status = `${record.releaseStatus || ""} ${record.type || ""}`;
  if (/denied/i.test(status)) return "Request denial review and capture agency/referral rationale.";
  if (/partial/i.test(status)) return "Compare released text against source context and request full review of withheld passages if needed.";
  if (/marker|no memorandum|no memcon|no telcon/i.test(status)) return "Confirm whether a memorandum/telcon exists; use schedule references as evidence of the meeting or call.";
  return "Review release/access status before final selection.";
}

function scheduleReferenceLinks(record) {
  return (record.scheduleReferences || [])
    .filter((reference) => reference.sourceNote)
    .map((reference) =>
      [
        reference.title,
        reference.naid ? `NAID ${reference.naid}` : "",
        reference.catalogUrl ? `Catalog: ${reference.catalogUrl}` : "",
        reference.pdfUrl ? `PDF: ${reference.pdfUrl}` : ""
      ]
        .filter(Boolean)
        .join(" - ")
    )
    .join(" || ");
}

function declassificationReviewRows(records) {
  return records.filter(releaseNeedsAttention).map((record) => ({
    reviewStatus: "",
    followUpOwner: "",
    followUpDate: "",
    outcome: "",
    compilerNumber: record.compilerNumber,
    chapter: record.chapter.name,
    date: record.date,
    type: record.type,
    title: record.documentTitle || record.title,
    releaseStatus: record.releaseStatus,
    accessRestriction: record.accessRestriction,
    suggestedAction: declassificationAction(record),
    participants: (record.participants || []).join("; "),
    pageCount: record.pageCount,
    naid: record.naid,
    sourceNote: record.sourceNote,
    sourceNoteProvenance: sourceNoteProvenance(record),
    researchNote: record.researchNote,
    scheduleReferences: scheduleReferenceLinks(record),
    catalogUrl: record.catalogUrl,
    pdfUrl: record.pdfUrl
  }));
}

function declassificationRequestType(record) {
  const status = `${record.releaseStatus || ""} ${record.type || ""}`;
  if (/denied/i.test(status)) return "Denial review";
  if (/partial/i.test(status)) return "Full review of withheld portions";
  if (/marker|no memorandum|no memcon|no telcon/i.test(status)) return "Search or existence confirmation";
  return "Release-status review";
}

function declassificationRequestLanguage(record) {
  const requestType = declassificationRequestType(record);
  const title = record.documentTitle || record.title;
  if (requestType === "Denial review") {
    return `Review the denial for Doc ${record.compilerNumber}, "${title}", and provide a release determination or written referral/withholding rationale for the denied memorandum/call.`;
  }
  if (requestType === "Full review of withheld portions") {
    return `Conduct full declassification review of withheld or redacted portions for Doc ${record.compilerNumber}, "${title}", using related source-packet context and schedule evidence where available.`;
  }
  if (requestType === "Search or existence confirmation") {
    return `Search for, confirm, or locate the memorandum/telcon for Doc ${record.compilerNumber}, "${title}", using the attached Presidential Daily Diary/Backup references as evidence of the meeting or call.`;
  }
  return `Review the release/access status for Doc ${record.compilerNumber}, "${title}", before final compiler selection.`;
}

function compactSourcePacket(row) {
  return [
    row.matchRank ? `rank ${row.matchRank}` : "",
    row.lane,
    row.candidateId,
    row.candidateDate,
    row.candidateTitle,
    row.candidateNaid ? `NAID ${row.candidateNaid}` : ""
  ]
    .filter(Boolean)
    .join(" - ");
}

function sourcePacketLinks(row) {
  return [
    row.candidateCatalogUrl ? `${row.candidateId || row.lane} Catalog: ${row.candidateCatalogUrl}` : "",
    row.candidatePdfUrl ? `${row.candidateId || row.lane} PDF: ${row.candidatePdfUrl}` : ""
  ]
    .filter(Boolean)
    .join(" | ");
}

function declassificationRequestRows(records, data) {
  const crosswalkByDoc = new Map();
  for (const row of sourceCrosswalkRows(records, data).filter((row) => row.candidateId)) {
    const rows = crosswalkByDoc.get(row.compilerNumber) || [];
    rows.push(row);
    crosswalkByDoc.set(row.compilerNumber, rows);
  }

  return records.filter(releaseNeedsAttention).map((record) => {
    const packets = (crosswalkByDoc.get(record.compilerNumber) || []).slice(0, 3);
    return {
      requestStatus: "",
      followUpOwner: "",
      followUpDate: "",
      outcome: "",
      compilerNumber: record.compilerNumber,
      chapter: record.chapter.name,
      date: record.date,
      releaseStatus: record.releaseStatus,
      accessRestriction: record.accessRestriction,
      requestType: declassificationRequestType(record),
      requestLanguage: declassificationRequestLanguage(record),
      title: record.documentTitle || record.title,
      type: record.type,
      participants: (record.participants || []).join("; "),
      pageCount: record.pageCount,
      selectedNaid: record.naid,
      selectedCatalogUrl: record.catalogUrl,
      selectedPdfUrl: record.pdfUrl,
      scheduleNaids: (record.scheduleReferences || []).map((reference) => reference.naid).filter(Boolean).join("; "),
      scheduleReferences: scheduleReferenceLinks(record),
      sourcePackets: packets.map(compactSourcePacket).join(" || "),
      sourcePacketLinks: packets.map(sourcePacketLinks).filter(Boolean).join(" || "),
      suggestedAction: declassificationAction(record),
      sourceNote: record.sourceNote,
      sourceNoteProvenance: sourceNoteProvenance(record),
      researchNote: record.researchNote
    };
  });
}

function buildDeclassificationMarkdown(records) {
  const rows = declassificationReviewRows(records);
  const byChapter = CHAPTER_ORDER.map((chapterName) => [
    chapterName,
    rows.filter((row) => row.chapter === chapterName).length
  ]);
  const lines = [
    "# FRUS 1989-1992 Volume VI Declassification Review Packet",
    "",
    "This packet isolates selected chronology rows with partial releases, denied records, marker sheets, or no-memorandum/no-telcon indicators. It is designed as a follow-up checklist for declassification review, MDR planning, and final compiler selection.",
    "",
    "## Snapshot",
    "",
    `- Review rows: ${rows.length}`,
    `- Partial releases: ${rows.filter((row) => /partial/i.test(row.releaseStatus)).length}`,
    `- Denied records: ${rows.filter((row) => /denied/i.test(row.releaseStatus)).length}`,
    `- Marker/no-document rows: ${rows.filter((row) => /marker|no memorandum|no memcon|no telcon/i.test(`${row.releaseStatus} ${row.type}`)).length}`,
    "",
    markdownTable(["Chapter", "Review rows"], byChapter),
    "",
    "## Review Queue",
    ""
  ];
  for (const row of rows) {
    lines.push(
      `### Doc ${row.compilerNumber} - ${row.date} - ${row.releaseStatus}`,
      "",
      `**Title:** ${row.title}`,
      "",
      `**Participants:** ${row.participants || "Participants pending"}`,
      "",
      `**Suggested action:** ${row.suggestedAction}`,
      "",
      `**Source Note:** ${row.sourceNote}`,
      "",
      `**Research Note:** ${row.researchNote}`,
      "",
      `**Schedule Evidence:** ${row.scheduleReferences || "No schedule corroboration attached."}`,
      "",
      `**Links:** ${recordLinks(row) || "Links pending."}`,
      ""
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildDeclassificationCsv(records) {
  const rows = declassificationReviewRows(records);
  const header = [
    "reviewStatus",
    "followUpOwner",
    "followUpDate",
    "outcome",
    "compilerNumber",
    "chapter",
    "date",
    "type",
    "title",
    "releaseStatus",
    "accessRestriction",
    "suggestedAction",
    "participants",
    "pageCount",
    "naid",
    "sourceNote",
    "sourceNoteProvenance",
    "researchNote",
    "scheduleReferences",
    "catalogUrl",
    "pdfUrl"
  ];
  return `${csvRow(header)}\n${rows.map((row) => csvRow(header.map((field) => row[field]))).join("\n")}\n`;
}

function buildDeclassificationRequestsMarkdown(records, data) {
  const rows = declassificationRequestRows(records, data);
  const byType = countBy(rows, (row) => row.requestType);
  const lines = [
    "# FRUS 1989-1992 Volume VI Declassification Request Worksheet",
    "",
    "This worksheet turns the declassification review packet into an action queue. It preserves blank status/owner/date/outcome columns, request language, schedule evidence, and the most likely source-packet context for each partial, denied, marker, or no-document chronology row.",
    "",
    "## Snapshot",
    "",
    `- Request rows: ${rows.length}`,
    `- Partial-release requests: ${rows.filter((row) => /partial/i.test(row.releaseStatus)).length}`,
    `- Denial-review requests: ${rows.filter((row) => /denied/i.test(row.releaseStatus)).length}`,
    `- Search/existence-confirmation requests: ${rows.filter((row) => /Search or existence confirmation/i.test(row.requestType)).length}`,
    "",
    markdownTable(["Request type", "Rows"], byType),
    "",
    "## Request Batch",
    "",
    markdownTable(
      ["Doc", "Chapter", "Date", "Release status", "Request type", "Schedule NAIDs", "Top source packets", "Links"],
      rows.map((row) => [
        row.compilerNumber,
        row.chapter,
        row.date,
        row.releaseStatus,
        row.requestType,
        row.scheduleNaids || "pending",
        row.sourcePackets || "No source-packet match above threshold",
        recordLinks({ catalogUrl: row.selectedCatalogUrl, pdfUrl: row.selectedPdfUrl }) || "Links pending"
      ])
    ),
    "",
    "## Ready-To-Copy Request Notes",
    ""
  ];
  for (const row of rows) {
    lines.push(
      `### Doc ${row.compilerNumber} - ${row.requestType}`,
      "",
      row.requestLanguage,
      "",
      `Selected record: ${row.title}; ${row.date}; ${row.releaseStatus || "release status pending"}; NAID ${row.selectedNaid || "pending"}.`,
      "",
      `Schedule evidence: ${row.scheduleReferences || "No schedule corroboration attached."}`,
      "",
      `Source-packet context: ${row.sourcePackets || "No source-lane match above threshold."}`,
      "",
      `Selected links: ${recordLinks({ catalogUrl: row.selectedCatalogUrl, pdfUrl: row.selectedPdfUrl }) || "Links pending."}`,
      ""
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildDeclassificationRequestsCsv(records, data) {
  const rows = declassificationRequestRows(records, data);
  const header = [
    "requestStatus",
    "followUpOwner",
    "followUpDate",
    "outcome",
    "compilerNumber",
    "chapter",
    "date",
    "releaseStatus",
    "accessRestriction",
    "requestType",
    "requestLanguage",
    "title",
    "type",
    "participants",
    "pageCount",
    "selectedNaid",
    "selectedCatalogUrl",
    "selectedPdfUrl",
    "scheduleNaids",
    "scheduleReferences",
    "sourcePackets",
    "sourcePacketLinks",
    "suggestedAction",
    "sourceNote",
    "sourceNoteProvenance",
    "researchNote"
  ];
  return `${csvRow(header)}\n${rows.map((row) => csvRow(header.map((field) => row[field]))).join("\n")}\n`;
}

function draftDocumentHeading(record) {
  const type = clean(record.type);
  if (/no memorandum|no memcon|no telcon|marker/i.test(`${type} ${record.releaseStatus || ""}`)) return "Editorial Note / Document Search Pending";
  if (/telcon/i.test(type)) return "Memorandum of Telephone Conversation";
  if (/memcon/i.test(type)) return "Memorandum of Conversation";
  return type || "Document";
}

function scheduleEvidenceCompact(record) {
  return (record.scheduleReferences || [])
    .map((reference) => [reference.title, reference.naid ? `NAID ${reference.naid}` : ""].filter(Boolean).join(" - "))
    .filter(Boolean)
    .join(" || ");
}

function catalogDerivedSourceNote(record) {
  const source = record.source || {};
  const pathParts = [
    "George H.W. Bush Library",
    "Bush Presidential Records",
    "National Security Council",
    source.series || "",
    record.documentTitle || record.title
  ].filter(Boolean);
  return `Source: ${pathParts.join(", ")}.`;
}

function sourceNoteProvenance(item) {
  const catalogBits = [
    item.releaseStatus ? `public Catalog release status: ${item.releaseStatus}` : "",
    item.accessRestriction ? `Catalog access: ${item.accessRestriction}` : "",
    item.naid ? `NAID ${item.naid}` : "",
    item.pageCount ? `PDF extent: ${item.pageCount} pages` : "",
    item.objectFilename ? `digital object: ${item.objectFilename}` : ""
  ].filter(Boolean);
  return [
    "FRUS source-note draft is Catalog-derived and limited to repository, record group/collection, series, and title.",
    catalogBits.length ? `Catalog provenance retained separately: ${catalogBits.join("; ")}.` : "",
    "Final publication check: confirm original classification marking, drafting/clearance/distribution details, marginalia, and exact archival container/OA-ID against the PDF or Library metadata."
  ]
    .filter(Boolean)
    .join(" ");
}

function sourceNoteGaps(record, qualityRows) {
  const issues = qualityRows.filter((row) => {
    const selectedId = `Doc ${record.compilerNumber}`;
    return row.candidateId === selectedId || row.candidateId.startsWith(`${selectedId} / Schedule`);
  });
  const gaps = [
    "Confirm classification marking from PDF",
    "Confirm place/time and drafting/clearance details from text",
    "Keep Catalog release/access/NAID in provenance fields, not final FRUS source-note text"
  ];
  if (releaseNeedsAttention(record)) gaps.push("Resolve release/marker status before final selection");
  if (!(record.scheduleReferences || []).length) gaps.push("Attach Presidential Daily Diary/Backup schedule corroboration");
  if (/memcon/i.test(record.type || "") && /telcon/i.test(record.source?.series || "")) {
    gaps.push("Verify document type against source series: memcon-type title is cataloged in Presidential Telcon Files");
  }
  if (/telcon/i.test(record.type || "") && /memcon/i.test(record.source?.series || "")) {
    gaps.push("Verify document type against source series: telcon-type title is cataloged in Presidential Memcon Files");
  }
  if (issues.length) {
    gaps.push(
      `Resolve data-quality issue(s): ${[
        ...new Set(issues.map((row) => `${row.issue} (${row.candidateId})`))
      ].join("; ")}`
    );
  }
  return gaps.join(" | ");
}

function documentRegisterRows(records, data) {
  const qualityRows = dataQualityRows(records, data);
  return records.map((record, index) => ({
    reviewStatus: "",
    compilerDecision: "",
    compilerNotes: "",
    draftDocumentNumber: index + 1,
    compilerNumber: record.compilerNumber,
    chapter: record.chapter.name,
    date: record.date,
    headingDraft: draftDocumentHeading(record),
    title: record.documentTitle || record.title,
    participants: (record.participants || []).join("; "),
    releaseStatus: record.releaseStatus,
    accessRestriction: record.accessRestriction,
    pageCount: record.pageCount,
    naid: record.naid,
    catalogDerivedSourceNote: catalogDerivedSourceNote(record),
    sourceNoteProvenance: sourceNoteProvenance(record),
    currentSourceNote: record.sourceNote,
    sourceNoteGaps: sourceNoteGaps(record, qualityRows),
    scheduleEvidence: scheduleEvidenceCompact(record),
    catalogUrl: record.catalogUrl,
    pdfUrl: record.pdfUrl
  }));
}

function buildDocumentRegisterMarkdown(records, data) {
  const rows = documentRegisterRows(records, data);
  const releaseRows = rows.filter((row) => /partial|denied|marker|no memorandum|no memcon|no telcon/i.test(`${row.releaseStatus} ${row.headingDraft}`));
  const issueRows = rows.filter((row) => /Resolve data-quality/.test(row.sourceNoteGaps));
  const lines = [
    "# FRUS 1989-1992 Volume VI Draft Document Register",
    "",
    "This is a publication-apparatus bridge, not a final document list. It gives the compiler continuous draft document numbers, chapter placement, heading drafts, catalog-derived source-note text, schedule evidence, and the remaining FRUS source-note checks for each selected chronology record.",
    "",
    "## Source-Note Guardrails",
    "",
    "- Published FRUS source notes begin with the repository/collection/file path and then add verified classification and editorial details; do not treat Catalog release status or NAID as a substitute for final source-note work.",
    "- Official style examples checked: https://history.state.gov/historicaldocuments/frus1989-92v31/d69, https://history.state.gov/historicaldocuments/frus1989-92v31/d23, https://history.state.gov/historicaldocuments/frus1989-92v31/d90, and https://history.state.gov/historicaldocuments/frus1989-92v31/d172.",
    "- Use this register to draft and triage; verify final wording against each PDF and any archival container/file metadata before publication.",
    "",
    "## Snapshot",
    "",
    `- Draft document rows: ${rows.length}`,
    `- Release/marker rows needing selection or declassification review: ${releaseRows.length}`,
    `- Rows with data-quality/source-note cleanup flags: ${issueRows.length}`,
    "",
    markdownTable(
      ["Chapter", "Draft docs", "Release/marker rows", "Cleanup flags"],
      CHAPTER_ORDER.map((chapterName) => {
        const chapterRows = rows.filter((row) => row.chapter === chapterName);
        return [
          chapterName,
          chapterRows.length,
          chapterRows.filter((row) => releaseRows.includes(row)).length,
          chapterRows.filter((row) => issueRows.includes(row)).length
        ];
      })
    ),
    "",
    "## Draft Register",
    ""
  ];
  for (const chapterName of CHAPTER_ORDER) {
    const chapterRows = rows.filter((row) => row.chapter === chapterName);
    lines.push(`### Chapter ${CHAPTER_ORDER.indexOf(chapterName) + 1}: ${chapterName}`, "");
    lines.push(
      markdownTable(
        ["Draft Doc", "Compiler Doc", "Date", "Heading Draft", "Title", "Release", "Source-Note Gaps", "Links"],
        chapterRows.map((row) => [
          row.draftDocumentNumber,
          row.compilerNumber,
          row.date,
          row.headingDraft,
          row.title,
          row.releaseStatus,
          row.sourceNoteGaps,
          recordLinks({ catalogUrl: row.catalogUrl, pdfUrl: row.pdfUrl })
        ])
      ),
      ""
    );
  }
  lines.push("## Source-Note Drafts", "");
  for (const row of rows) {
    lines.push(
      `### Draft Document ${row.draftDocumentNumber} / Doc ${row.compilerNumber}`,
      "",
      `**Heading draft:** ${row.headingDraft}`,
      "",
      `**Title:** ${row.title}`,
      "",
      `**Participants:** ${row.participants || "Participants pending"}`,
      "",
      `**Catalog-derived source note:** ${row.catalogDerivedSourceNote}`,
      "",
      `**Source-note provenance:** ${row.sourceNoteProvenance}`,
      "",
      `**Schedule evidence:** ${row.scheduleEvidence || "No schedule corroboration attached."}`,
      "",
      `**Source-note gaps:** ${row.sourceNoteGaps}`,
      ""
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildDocumentRegisterCsv(records, data) {
  const rows = documentRegisterRows(records, data);
  const header = [
    "reviewStatus",
    "compilerDecision",
    "compilerNotes",
    "draftDocumentNumber",
    "compilerNumber",
    "chapter",
    "date",
    "headingDraft",
    "title",
    "participants",
    "releaseStatus",
    "accessRestriction",
    "pageCount",
    "naid",
    "catalogDerivedSourceNote",
    "sourceNoteProvenance",
    "currentSourceNote",
    "sourceNoteGaps",
    "scheduleEvidence",
    "catalogUrl",
    "pdfUrl"
  ];
  return `${csvRow(header)}\n${rows.map((row) => csvRow(header.map((field) => row[field]))).join("\n")}\n`;
}

function requestedSourceByLabel(data, label) {
  return data.requested.find((source) => source.label === label);
}

function sourceCoverageStatus(source) {
  if (!source) return "missing";
  if (source.childHarvestError || source.queryHarvestErrors || source.rootHarvestError) return "covered with caveat";
  return "covered";
}

function requestedSourceCoverageRow(data, label, requirement) {
  const source = requestedSourceByLabel(data, label);
  const leadCount = source?.leads?.length || 0;
  const caveats = [source?.childHarvestError, source?.onlineChildHarvestError, source?.rootHarvestError, source?.queryHarvestErrors ? `${source.queryHarvestErrors} query harvest error(s)` : ""]
    .filter(Boolean)
    .join(" | ");
  return {
    area: "User-requested source pool",
    requirement,
    sourceOrArtifact: label,
    naid: source?.naid || "",
    status: sourceCoverageStatus(source),
    evidenceCount: leadCount,
    evidence: source ? `${leadCount} EastMed leads retained; ${source.queryHitFiles || 0} query-hit files; online child total ${source.onlineChildTotal || "unknown"}.` : "No source data found.",
    keyArtifacts: [
      "data/requested-source-series.json",
      "reports/requested-source-series-eastmed.json",
      "reports/compiler-next-review-queue.md",
      "reports/compiler-gap-fill-candidates.md"
    ].join(" | "),
    remainingFollowUp: caveats || "Open retained leads and record compiler decisions in the selection worksheet.",
    catalogUrl: source?.requestedUrl || source?.searchWithinUrl || source?.catalogUrl || ""
  };
}

function sourceCoverageRows(records, data, persons) {
  const pages = records.reduce((sum, record) => sum + (record.pageCount || 0), 0);
  const restrictions = records.filter(releaseNeedsAttention);
  const qualityRows = dataQualityRows(records, data);
  const scheduleCovered = records.filter((record) => (record.scheduleReferences || []).length).length;
  const requestedTotal = data.requested.reduce((sum, source) => sum + (source.leads || []).length, 0);
  const rows = [
    {
      area: "Site structure",
      requirement: "Make the research assistant live with the declassified chronology as the first page section and four chapters: Greece, Cyprus, Turkey, Regional.",
      sourceOrArtifact: "GitHub Pages site",
      naid: "",
      status: "covered",
      evidenceCount: records.length,
      evidence: `${records.length} selected records / ${pages} PDF pages; chapter counts ${CHAPTER_ORDER.map((chapter) => `${chapter} ${records.filter((record) => record.chapter.name === chapter).length}`).join(", ")}.`,
      keyArtifacts: "index.html | app.js | reports/compiler-chronology.md",
      remainingFollowUp: "Keep cache key fresh after future data changes.",
      catalogUrl: "https://therealjameswilson.github.io/GCT-89-92/"
    },
    {
      area: "NARA Scout",
      requirement: "Use NARA Scout to find documents and leads for the volume.",
      sourceOrArtifact: "NARA Scout leads",
      naid: "",
      status: "covered",
      evidenceCount: data.scout.length,
      evidence: `${data.scout.length} Scout leads retained and exposed in the public page/source queues.`,
      keyArtifacts: "data/nara-scout-leads.json | reports/nara-scout-eastmed-search.json | reports/compiler-selection-worksheet.csv",
      remainingFollowUp: "Open leads marked high-value or MDR/restriction before final selection.",
      catalogUrl: "https://therealjameswilson.github.io/nara-scout/"
    },
    {
      area: "Core selected chronology",
      requirement: "Preserve selected memcons/telcons with source notes, direct Catalog/PDF links, and schedule corroboration.",
      sourceOrArtifact: "Selected declassified chronology",
      naid: "",
      status: "covered",
      evidenceCount: records.length,
      evidence: `${records.length} selected rows; ${scheduleCovered}/${records.length} have Daily Diary/Backup schedule references.`,
      keyArtifacts: "data/records.json | reports/compiler-chronology.md | reports/compiler-source-notes.csv | reports/compiler-document-register.md",
      remainingFollowUp: restrictions.length ? `${restrictions.length} release/marker rows require declassification or search follow-up.` : "No release/marker rows pending.",
      catalogUrl: "https://history.state.gov/historicaldocuments/frus1989-92v06"
    },
    {
      area: "Daily Diary/Backup",
      requirement: "Incorporate references to pertinent meetings and calls from Catalog NAID 186322.",
      sourceOrArtifact: "Presidential Daily Diary and Daily Backup Materials",
      naid: "186322",
      status: "covered",
      evidenceCount: scheduleCovered,
      evidence: `${scheduleCovered}/${records.length} selected chronology rows have schedule corroboration; requested-source lane also retains ${(requestedSourceByLabel(data, "Presidential Daily Diary and Backup")?.leads || []).length} source-pool leads.`,
      keyArtifacts: "reports/daily-diary-references-186322-eastmed.json | reports/compiler-source-notes.csv | reports/compiler-document-register.md",
      remainingFollowUp: "Rows with [EMPTY] diary titles remain schedule corroboration only until PDFs are checked.",
      catalogUrl: "https://catalog.archives.gov/id/186322"
    },
    {
      area: "User-requested source series",
      requirement: "Go through Robert D. Blackwill's Subject Files, Catalog NAID 2554653.",
      sourceOrArtifact: "Blackwill Subject Files",
      naid: "2554653",
      status: "complete-series harvested",
      evidenceCount: data.blackwill.length,
      evidence: `${data.blackwill.length} file units retained from complete-series review.`,
      keyArtifacts: "data/blackwill-files.json | reports/compiler-selection-worksheet.csv | reports/compiler-next-review-queue.md",
      remainingFollowUp: "Screen retained files for final selection decisions.",
      catalogUrl: "https://catalog.archives.gov/id/2554653"
    },
    {
      area: "User-requested source series",
      requirement: "Search within European and Eurasian Directorate Central Chronological Files, Catalog NAID 374000108.",
      sourceOrArtifact: "Central Chronological Files",
      naid: "374000108",
      status: "covered",
      evidenceCount: data.central.length,
      evidence: `${data.central.length} Central Chronological file leads retained; OCR signals captured for priority packets.`,
      keyArtifacts: "data/central-chronology-files.json | reports/central-chronology-374000108-eastmed.json | reports/compiler-source-crosswalk.md",
      remainingFollowUp: "Open packet PDFs before treating any packet lead as selected.",
      catalogUrl: "https://catalog.archives.gov/search-within/374000108"
    },
    {
      area: "User-requested source series",
      requirement: "Go through Robert D. Blackwill Chronological Files, Catalog NAID 2554659.",
      sourceOrArtifact: "Blackwill Chronological Files",
      naid: "2554659",
      status: "complete-series harvested",
      evidenceCount: data.blackwillChron.length,
      evidence: `${data.blackwillChron.length} file units retained from complete-series review with OCR sampling for priority packets.`,
      keyArtifacts: "data/blackwill-chron-files.json | reports/blackwill-chronology-2554659-eastmed.json | reports/compiler-next-review-queue.md",
      remainingFollowUp: "Open high-signal packets and record inclusion/exclusion in the selection worksheet.",
      catalogUrl: "https://catalog.archives.gov/id/2554659"
    },
    {
      area: "User-requested source series",
      requirement: "Go through Robert M. Gates Chronological Files, Catalog NAID 2554841.",
      sourceOrArtifact: "Gates Chronological Files",
      naid: "2554841",
      status: "complete-series harvested",
      evidenceCount: data.gates.length,
      evidence: `${data.gates.length} file units retained; current hits are sparse/peripheral but preserved in the source queue.`,
      keyArtifacts: "data/gates-chron-files.json | reports/gates-chronology-2554841-eastmed.json | reports/compiler-selection-worksheet.csv",
      remainingFollowUp: "Screen for copied or staff-context records before final exclusion.",
      catalogUrl: "https://catalog.archives.gov/id/2554841"
    },
    requestedSourceCoverageRow(data, "Scowcroft Papers", "Include all Scowcroft Papers source leads requested by the user."),
    requestedSourceCoverageRow(data, "Presidential Daily File", "Include Presidential Daily File online source-pool leads."),
    requestedSourceCoverageRow(data, "NSC", "Include H-Files National Security Council meeting/source leads."),
    requestedSourceCoverageRow(data, "NSC/DC Meetings", "Include NSC/DC Meetings source leads."),
    requestedSourceCoverageRow(data, "NSC/DC Meetings Follow-Up", "Include NSC/DC Meetings Follow-Up source leads."),
    requestedSourceCoverageRow(data, "NSR", "Include National Security Review source leads."),
    requestedSourceCoverageRow(data, "NSD", "Include National Security Directives source leads."),
    requestedSourceCoverageRow(data, "IF Transition", "Include NSC Institutional Files Transition source leads."),
    {
      area: "Selection risk",
      requirement: "Assume compiler risk and identify gaps.",
      sourceOrArtifact: "Gap and selection audits",
      naid: "",
      status: "covered",
      evidenceCount: qualityRows.length,
      evidence: `${qualityRows.length} data-quality rows; ${restrictions.length} declassification/release rows; ${requestedTotal} requested-source leads.`,
      keyArtifacts: "reports/compiler-gap-audit.md | reports/compiler-gap-fill-candidates.md | reports/compiler-data-quality-audit.md | reports/compiler-declassification-requests.md",
      remainingFollowUp: "Compiler should clear fix-before-citation and release/marker rows before final document list.",
      catalogUrl: ""
    },
    {
      area: "Persons apparatus",
      requirement: "Generate a FRUS-style persons list from the attached Bush comprehensive names list and connect it to selected documents.",
      sourceOrArtifact: "Persons list and participant index",
      naid: "",
      status: "covered",
      evidenceCount: persons.length,
      evidence: `${persons.length} persons-list entries; ${personDocumentRows(records, persons).length} participant/person index rows.`,
      keyArtifacts: "persons.html | reports/persons-list.md | reports/compiler-persons-document-index.md",
      remainingFollowUp: "Review unmatched/collective participant strings before final apparatus.",
      catalogUrl: "https://history.state.gov/historicaldocuments/frus1989-92v31/persons"
    }
  ];
  return rows;
}

function buildSourceCoverageMarkdown(records, data, persons) {
  const rows = sourceCoverageRows(records, data, persons);
  const statusCounts = countBy(rows, (row) => row.status);
  const caveatRows = rows.filter((row) => /caveat|missing/i.test(row.status));
  const lines = [
    "# FRUS 1989-1992 Volume VI Source Coverage and Provenance Matrix",
    "",
    "This matrix maps the user's requested source coverage and compiler-facing deliverables to the current evidence in the repository. It is intended as a quick audit trail: what was covered, where the proof lives, and what the compiler still needs to verify manually.",
    "",
    "## Snapshot",
    "",
    `- Coverage rows: ${rows.length}`,
    `- Rows with caveats or missing coverage: ${caveatRows.length}`,
    "",
    markdownTable(["Status", "Rows"], statusCounts),
    "",
    "## Coverage Matrix",
    "",
    markdownTable(
      ["Area", "Requirement", "Source/Artifact", "NAID", "Status", "Evidence", "Key Artifacts", "Remaining Follow-Up", "Link"],
      rows.map((row) => [
        row.area,
        row.requirement,
        row.sourceOrArtifact,
        row.naid,
        row.status,
        row.evidence,
        row.keyArtifacts,
        row.remainingFollowUp,
        row.catalogUrl
      ])
    ),
    "",
    "## Caveats To Keep Visible",
    "",
    caveatRows.length
      ? markdownTable(
          ["Source/Artifact", "Status", "Follow-Up"],
          caveatRows.map((row) => [row.sourceOrArtifact, row.status, row.remainingFollowUp])
        )
      : "No coverage caveats recorded.",
    ""
  ];
  return `${lines.join("\n")}\n`;
}

function buildSourceCoverageCsv(records, data, persons) {
  const rows = sourceCoverageRows(records, data, persons);
  const header = [
    "area",
    "requirement",
    "sourceOrArtifact",
    "naid",
    "status",
    "evidenceCount",
    "evidence",
    "keyArtifacts",
    "remainingFollowUp",
    "catalogUrl"
  ];
  return `${csvRow(header)}\n${rows.map((row) => csvRow(header.map((field) => row[field]))).join("\n")}\n`;
}

function compactActionDetail(value, limit = 240) {
  const text = clean(value);
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function actionRowLinks(row) {
  return [mdLink("Catalog", row.catalogUrl), mdLink("PDF", row.pdfUrl)].filter(Boolean).join(" | ");
}

function actionPriorityBase(row) {
  if (/denial/i.test(row.requestType || row.actionType || "")) return 0;
  if (/withheld|partial|full review/i.test(row.requestType || row.actionType || "")) return 20;
  if (/search|existence|marker|no memorandum/i.test(row.requestType || row.actionType || "")) return 40;
  return 60;
}

function declassificationActionQueueRows(records, data) {
  return declassificationRequestRows(records, data).map((row, index) => ({
    reviewStatus: "",
    followUpOwner: "",
    targetDate: "",
    outcome: "",
    actionRank: 100 + actionPriorityBase(row) + index,
    priorityBand: "P0 - selected-document release/search blocker",
    actionType: row.requestType,
    chapter: row.chapter,
    date: row.date,
    candidateId: `Doc ${row.compilerNumber}`,
    title: row.title,
    whyNow: `${row.releaseStatus}; ${row.scheduleNaids ? `schedule NAIDs ${row.scheduleNaids}` : "schedule evidence pending"}; ${row.sourcePackets ? "source-packet context attached" : "no source-packet match above threshold"}.`,
    nextAction: row.requestLanguage,
    evidence: [row.scheduleReferences, row.sourcePackets].filter(Boolean).join(" || "),
    sourceArtifacts: "reports/compiler-declassification-requests.md | reports/compiler-declassification-review.md | reports/compiler-document-register.md",
    catalogUrl: row.selectedCatalogUrl,
    pdfUrl: row.selectedPdfUrl
  }));
}

function dataQualityActionQueueRows(records, data) {
  return dataQualityRows(records, data)
    .filter((row) => row.severity !== "caveat" && !/^Catalog (child|query)-harvest caveat$/i.test(row.issue))
    .map((row, index) => ({
      reviewStatus: row.reviewStatus || "",
      followUpOwner: row.followUpOwner || "",
      targetDate: "",
      outcome: row.outcome || "",
      actionRank: (row.severity === "fix before citation" ? 200 : 300) + index,
      priorityBand: row.severity === "fix before citation" ? "P1 - citation blocker" : "P1 - metadata/source review",
      actionType: row.issue,
      chapter: row.chapter,
      date: row.date,
      candidateId: row.candidateId,
      title: row.title,
      whyNow: `${row.severity}: ${row.detail}`,
      nextAction: row.suggestedAction,
      evidence: row.detail,
      sourceArtifacts: "reports/compiler-data-quality-audit.md | reports/compiler-data-quality-audit.csv",
      catalogUrl: row.catalogUrl,
      pdfUrl: row.pdfUrl
    }));
}

function gapActionQueueRows(records, data) {
  const rows = gapFillRows(records, data);
  const quotas = {
    Greece: 3,
    Cyprus: 10,
    Turkey: 5,
    Regional: 10
  };
  const chapterOffsets = {
    Cyprus: 0,
    Regional: 40,
    Turkey: 80,
    Greece: 120
  };
  const selected = [];
  for (const chapterName of CHAPTER_ORDER) {
    const chapterRows = rows.filter((row) => row.chapter === chapterName);
    const additions = chapterRows.filter((row) => row.candidateDisposition === "Potential gap-fill addition");
    const context = chapterRows.filter((row) => row.candidateDisposition !== "Potential gap-fill addition");
    selected.push(...[...additions, ...context].slice(0, quotas[chapterName]));
  }
  return selected.map((row, index) => ({
    reviewStatus: row.reviewStatus || "",
    followUpOwner: "",
    targetDate: "",
    outcome: row.compilerDecision || "",
    actionRank: 400 + (chapterOffsets[row.chapter] || 0) + index,
    priorityBand: "P2 - selection gap/source-packet review",
    actionType: row.candidateDisposition,
    chapter: row.chapter,
    date: row.date,
    candidateId: row.candidateId,
    title: row.title,
    whyNow: row.whyConsider,
    nextAction: `Open ${row.candidateId}; record include, exclude, context-only, or follow-up decision in the selection worksheet.`,
    evidence: row.peopleOrSignals || row.researchNote,
    sourceArtifacts: "reports/compiler-gap-fill-candidates.md | reports/compiler-selection-worksheet.csv | reports/compiler-next-review-queue.md",
    catalogUrl: row.catalogUrl,
    pdfUrl: row.pdfUrl
  }));
}

function coverageCaveatActionQueueRows(records, data, persons) {
  return sourceCoverageRows(records, data, persons)
    .filter((row) => /caveat|missing/i.test(row.status))
    .map((row, index) => ({
      reviewStatus: "",
      followUpOwner: "",
      targetDate: "",
      outcome: "",
      actionRank: 600 + index,
      priorityBand: "P3 - source-pool coverage caveat",
      actionType: row.status,
      chapter: "Cross-chapter",
      date: "",
      candidateId: row.naid ? `NAID ${row.naid}` : row.sourceOrArtifact,
      title: row.sourceOrArtifact,
      whyNow: row.evidence,
      nextAction: row.remainingFollowUp,
      evidence: row.keyArtifacts,
      sourceArtifacts: "reports/compiler-source-coverage.md | reports/requested-source-series-eastmed.json",
      catalogUrl: row.catalogUrl,
      pdfUrl: ""
    }));
}

function scheduleCaveatActionQueueRows(records, data) {
  const rows = dataQualityRows(records, data).filter((row) => row.severity === "caveat");
  if (!rows.length) return [];
  return [
    {
      reviewStatus: "",
      followUpOwner: "",
      targetDate: "",
      outcome: "",
      actionRank: 700,
      priorityBand: "P4 - schedule-evidence caveat",
      actionType: "Schedule title caveat batch",
      chapter: "Cross-chapter",
      date: "",
      candidateId: `${rows.length} schedule caveats`,
      title: "Presidential Daily Diary/Backup [EMPTY] title review",
      whyNow: `${rows.length} schedule corroboration rows include [EMPTY] titles and should be used only after PDF spot-checking.`,
      nextAction: "Open the listed Daily Diary/Backup PDFs from the data-quality audit and confirm the schedule evidence before final citation.",
      evidence: rows.map((row) => `${row.candidateId}: ${row.title}`).join(" || "),
      sourceArtifacts: "reports/compiler-data-quality-audit.md | reports/compiler-source-notes.csv | reports/compiler-document-register.md",
      catalogUrl: "",
      pdfUrl: ""
    }
  ];
}

function personsActionQueueRows(records, persons) {
  return personDocumentRows(records, persons)
    .filter((row) => row.personsListStatus === "Review")
    .map((row, index) => ({
      reviewStatus: "",
      followUpOwner: "",
      targetDate: "",
      outcome: "",
      actionRank: 720 + index,
      priorityBand: "P4 - persons apparatus review",
      actionType: "Persons-list coverage review",
      chapter: row.chapters || "Cross-chapter",
      date: row.firstDate,
      candidateId: row.personKey,
      title: row.participantVariants,
      whyNow: `${row.documentCount} selected chronology document(s) use a participant string without a clear persons-list match.`,
      nextAction: row.reviewNote,
      evidence: row.documentDetails,
      sourceArtifacts: "reports/compiler-persons-document-index.md | reports/persons-list.md",
      catalogUrl: "",
      pdfUrl: ""
    }));
}

function compilerActionQueueRows(records, data, persons) {
  return [
    ...declassificationActionQueueRows(records, data),
    ...dataQualityActionQueueRows(records, data),
    ...gapActionQueueRows(records, data),
    ...coverageCaveatActionQueueRows(records, data, persons),
    ...scheduleCaveatActionQueueRows(records, data),
    ...personsActionQueueRows(records, persons)
  ].sort((a, b) => a.actionRank - b.actionRank || clean(a.candidateId).localeCompare(clean(b.candidateId)));
}

function buildCompilerActionQueueMarkdown(records, data, persons, rows = compilerActionQueueRows(records, data, persons)) {
  const bandCounts = countBy(rows, (row) => row.priorityBand).sort((a, b) => a[0].localeCompare(b[0]));
  const lines = [
    "# FRUS 1989-1992 Volume VI Compiler Action Queue",
    "",
    "This is the consolidated worklist for the compiler. It merges declassification/search blockers, citation and metadata cleanup, gap-fill packets, source-pool caveats, schedule-corroboration caveats, and persons-apparatus review into one ranked queue.",
    "",
    "## Snapshot",
    "",
    `- Action rows: ${rows.length}`,
    `- Selected-document release/search blockers: ${rows.filter((row) => row.priorityBand.startsWith("P0")).length}`,
    `- Citation or metadata rows: ${rows.filter((row) => row.priorityBand.startsWith("P1")).length}`,
    `- Gap/source-packet rows: ${rows.filter((row) => row.priorityBand.startsWith("P2")).length}`,
    "",
    markdownTable(["Priority band", "Rows"], bandCounts),
    "",
    "## How To Use",
    "",
    "1. Clear P0 and P1 rows before treating the selected chronology as publication-ready.",
    "2. Use P2 rows to test whether Cyprus and Regional, especially, need additional documents or source-context notes.",
    "3. Use P3 and P4 rows to keep source-pool caveats, schedule-corroboration caveats, and apparatus cleanup visible during final review.",
    "",
    "## Top Worklist",
    "",
    markdownTable(
      ["Rank", "Priority", "Type", "Candidate", "Chapter", "Date", "Title", "Next Action", "Links"],
      rows.slice(0, 30).map((row) => [
        row.actionRank,
        row.priorityBand,
        row.actionType,
        row.candidateId,
        row.chapter,
        row.date,
        row.title,
        compactActionDetail(row.nextAction),
        actionRowLinks(row)
      ])
    ),
    ""
  ];
  for (const band of [...new Set(rows.map((row) => row.priorityBand))].sort()) {
    const bandRows = rows.filter((row) => row.priorityBand === band);
    lines.push(`## ${band}`, "");
    lines.push(
      markdownTable(
        ["Rank", "Candidate", "Chapter", "Date", "Title", "Why Now", "Next Action", "Artifacts"],
        bandRows.map((row) => [
          row.actionRank,
          row.candidateId,
          row.chapter,
          row.date,
          row.title,
          compactActionDetail(row.whyNow),
          compactActionDetail(row.nextAction),
          row.sourceArtifacts
        ])
      ),
      ""
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildCompilerActionQueueCsv(records, data, persons, rows = compilerActionQueueRows(records, data, persons)) {
  const header = [
    "reviewStatus",
    "followUpOwner",
    "targetDate",
    "outcome",
    "actionRank",
    "priorityBand",
    "actionType",
    "chapter",
    "date",
    "candidateId",
    "title",
    "whyNow",
    "nextAction",
    "evidence",
    "sourceArtifacts",
    "catalogUrl",
    "pdfUrl"
  ];
  return `${csvRow(header)}\n${rows.map((row) => csvRow(header.map((field) => row[field]))).join("\n")}\n`;
}

function buildCompilerActionQueueJs(rows) {
  return `window.COMPILER_ACTION_QUEUE = ${JSON.stringify(rows, null, 2)};\n`;
}

function buildMarkdown(records) {
  const pages = records.reduce((sum, record) => sum + (record.pageCount || 0), 0);
  const restrictions = records.filter(releaseNeedsAttention);
  const missingScheduleRefs = records.filter((record) => !(record.scheduleReferences || []).length);
  const lines = [
    "# FRUS 1989-1992 Volume VI Compiler Chronology Pack",
    "",
    "Working export from the GCT research assistant. It preserves the compiler chronology number, date, record type, title, participants, FRUS-style source note, research breadcrumb, schedule corroboration, and direct Catalog/PDF links.",
    "",
    "## Snapshot",
    "",
    `- Conversation records: ${records.length}`,
    `- PDF pages counted: ${pages}`,
    `- Restriction or marker-review rows: ${restrictions.length}`,
    `- Rows without Daily Diary/Backup schedule references: ${missingScheduleRefs.length}`,
    "",
    "## Gap Checks",
    ""
  ];

  for (const chapterName of ["Cyprus", "Regional"]) {
    const count = records.filter((record) => record.chapter.name === chapterName).length;
    lines.push(`- ${chapterName}: ${count} selected chronology records; compare against Scout, Central Chronology, and requested source-pool leads.`);
  }

  if (missingScheduleRefs.length) {
    lines.push(`- Missing schedule references: ${missingScheduleRefs.map((record) => `Doc ${record.compilerNumber}`).join(", ")}.`);
  }

  if (restrictions.length) {
    lines.push(`- Release or marker review: ${restrictions.map((record) => `Doc ${record.compilerNumber}`).join(", ")}.`);
  }

  for (const chapterName of CHAPTER_ORDER) {
    const chapterRecords = records.filter((record) => record.chapter.name === chapterName);
    lines.push("", `## Chapter ${CHAPTER_ORDER.indexOf(chapterName) + 1}: ${chapterName}`, "");
    for (const record of chapterRecords) {
      lines.push(
        `### Doc ${record.compilerNumber} - ${record.date} - ${record.type}`,
        "",
        `**Title:** ${record.documentTitle || record.title}`,
        "",
        `**Participants:** ${(record.participants || []).join("; ") || "Participants pending"}`,
        "",
        `**Release/Page/NAID:** ${[record.releaseStatus, record.pageCount ? `${record.pageCount} pages` : "", record.naid ? `NAID ${record.naid}` : ""].filter(Boolean).join("; ")}`,
        "",
        `**Source Note:** ${record.sourceNote || "Source note pending."}`,
        "",
        `**Source-Note Provenance:** ${sourceNoteProvenance(record)}`,
        "",
        `**Research Note:** ${record.researchNote || "Research note pending."}`,
        "",
        `**Schedule References:** ${scheduleSummary(record) || "No same-date Daily Diary/Backup reference attached."}`,
        "",
        `**Links:** ${recordLinks(record) || "Links pending."}`,
        ""
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

function buildCsv(records) {
  const header = [
    "compilerNumber",
    "chapter",
    "date",
    "type",
    "title",
    "participants",
    "releaseStatus",
    "pageCount",
    "naid",
    "sourceNote",
    "sourceNoteProvenance",
    "researchNote",
    "scheduleReferences",
    "catalogUrl",
    "pdfUrl"
  ];
  const rows = records.map((record) =>
    csvRow([
      record.compilerNumber,
      record.chapter.name,
      record.date,
      record.type,
      record.documentTitle || record.title,
      (record.participants || []).join("; "),
      record.releaseStatus,
      record.pageCount,
      record.naid,
      record.sourceNote,
      sourceNoteProvenance(record),
      record.researchNote,
      scheduleSummary(record),
      record.catalogUrl,
      record.pdfUrl
    ])
  );
  return `${csvRow(header)}\n${rows.join("\n")}\n`;
}

function main() {
  const records = assignCompilerNumbers(readJson("data/records.json"));
  const persons = readJson("data/persons.json");
  const data = {
    scout: readJson("data/nara-scout-leads.json"),
    central: readJson("data/central-chronology-files.json"),
    blackwill: readJson("data/blackwill-files.json"),
    blackwillChron: readJson("data/blackwill-chron-files.json"),
    gates: readJson("data/gates-chron-files.json"),
    requested: readJson("data/requested-source-series.json")
  };
  fs.mkdirSync(path.join(ROOT, "reports"), { recursive: true });
  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
  const actionRows = compilerActionQueueRows(records, data, persons);
  fs.writeFileSync(path.join(ROOT, "reports/compiler-handoff.md"), buildCompilerHandoff(records, data, persons));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-chronology.md"), buildMarkdown(records));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-source-notes.csv"), buildCsv(records));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-action-queue.md"), buildCompilerActionQueueMarkdown(records, data, persons, actionRows));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-action-queue.csv"), buildCompilerActionQueueCsv(records, data, persons, actionRows));
  fs.writeFileSync(path.join(ROOT, "data/compiler-action-queue.json"), `${JSON.stringify(actionRows, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, "data/compiler-action-queue.js"), buildCompilerActionQueueJs(actionRows));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-source-coverage.md"), buildSourceCoverageMarkdown(records, data, persons));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-source-coverage.csv"), buildSourceCoverageCsv(records, data, persons));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-document-register.md"), buildDocumentRegisterMarkdown(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-document-register.csv"), buildDocumentRegisterCsv(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-gap-audit.md"), buildGapAudit(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-gap-audit.csv"), buildGapCsv(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-gap-fill-candidates.md"), buildGapFillMarkdown(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-gap-fill-candidates.csv"), buildGapFillCsv(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-chapter-dossiers.md"), buildChapterDossiersMarkdown(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-chapter-dossiers.csv"), buildChapterDossiersCsv(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-source-crosswalk.md"), buildSourceCrosswalkMarkdown(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-source-crosswalk.csv"), buildSourceCrosswalkCsv(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-selection-worksheet.csv"), buildSelectionWorksheet(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-next-review-queue.md"), buildReviewQueueMarkdown(data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-next-review-queue.csv"), buildReviewQueueCsv(data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-declassification-review.md"), buildDeclassificationMarkdown(records));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-declassification-review.csv"), buildDeclassificationCsv(records));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-declassification-requests.md"), buildDeclassificationRequestsMarkdown(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-declassification-requests.csv"), buildDeclassificationRequestsCsv(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-data-quality-audit.md"), buildDataQualityMarkdown(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-data-quality-audit.csv"), buildDataQualityCsv(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-persons-document-index.md"), buildPersonsDocumentIndexMarkdown(records, persons));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-persons-document-index.csv"), buildPersonsDocumentIndexCsv(records, persons));
  console.log(`Wrote compiler exports for ${records.length} records.`);
}

main();
