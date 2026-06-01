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
    `- Schedule corroboration is almost complete; only ${missingScheduleRefs.length} selected row lacks a Daily Diary/Backup reference: ${missingScheduleRefs.map((record) => `Doc ${record.compilerNumber}`).join(", ") || "none"}.`,
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

function reportLink(label, filename) {
  return `[${label}](${filename})`;
}

function buildCompilerHandoff(records, data, persons) {
  const pages = records.reduce((sum, record) => sum + (record.pageCount || 0), 0);
  const sourceRows = sourceLeadWorksheetRows(data);
  const reviewRows = reviewQueueRows(data);
  const declassRows = declassificationReviewRows(records);
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
    `2. Open ${reportLink("Next Review Queue", "compiler-next-review-queue.md")} for the chapter-ranked source-lane packets most worth opening next.`,
    `3. Open ${reportLink("Declassification Packet", "compiler-declassification-review.md")} before final selection; it isolates partial releases, denials, marker sheets, and no-document rows.`,
    `4. Open ${reportLink("Data-Quality Audit", "compiler-data-quality-audit.md")} before citation cleanup; it flags title variants, date mismatches, schedule caveats, and Catalog harvest issues.`,
    `5. Use ${reportLink("Selection Worksheet", "compiler-selection-worksheet.csv")} as the master working spreadsheet for review status, compiler decisions, and notes.`,
    `6. Use ${reportLink("Persons List", "persons-list.md")} when drafting or checking FRUS-style identifications.`,
    "",
    "## Current Inventory",
    "",
    markdownTable(
      ["Artifact", "Use", "Current count"],
      [
        [reportLink("Working chronology pack", "compiler-chronology.md"), "Selected declassified chronology with source notes and schedule references", `${records.length} records / ${pages} PDF pages`],
        [reportLink("Source-note spreadsheet", "compiler-source-notes.csv"), "Sortable source-note and schedule-reference export", `${records.length} rows`],
        [reportLink("Next review queue", "compiler-next-review-queue.md"), "Chapter-ranked source-lane opening queue", `${reviewRows.length} source-lane candidates`],
        [reportLink("Selection worksheet", "compiler-selection-worksheet.csv"), "Master decision spreadsheet across selected records and source leads", `${records.length + sourceRows.length} rows`],
        [reportLink("Gap audit", "compiler-gap-audit.md"), "Chapter coverage and risk register", `${CHAPTER_ORDER.length} chapter rows`],
        [reportLink("Declassification packet", "compiler-declassification-review.md"), "Release-status and marker follow-up queue", `${declassRows.length} rows`],
        [reportLink("Data-quality audit", "compiler-data-quality-audit.md"), "Metadata, date, title, and schedule-caveat cleanup queue", `${qualityRows.length} rows`],
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
    researchNote: record.researchNote,
    scheduleReferences: scheduleReferenceLinks(record),
    catalogUrl: record.catalogUrl,
    pdfUrl: record.pdfUrl
  }));
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
    "researchNote",
    "scheduleReferences",
    "catalogUrl",
    "pdfUrl"
  ];
  return `${csvRow(header)}\n${rows.map((row) => csvRow(header.map((field) => row[field]))).join("\n")}\n`;
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
  fs.writeFileSync(path.join(ROOT, "reports/compiler-handoff.md"), buildCompilerHandoff(records, data, persons));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-chronology.md"), buildMarkdown(records));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-source-notes.csv"), buildCsv(records));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-gap-audit.md"), buildGapAudit(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-gap-audit.csv"), buildGapCsv(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-selection-worksheet.csv"), buildSelectionWorksheet(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-next-review-queue.md"), buildReviewQueueMarkdown(data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-next-review-queue.csv"), buildReviewQueueCsv(data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-declassification-review.md"), buildDeclassificationMarkdown(records));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-declassification-review.csv"), buildDeclassificationCsv(records));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-data-quality-audit.md"), buildDataQualityMarkdown(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-data-quality-audit.csv"), buildDataQualityCsv(records, data));
  console.log(`Wrote compiler exports for ${records.length} records.`);
}

main();
