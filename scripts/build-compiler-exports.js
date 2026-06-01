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
  const data = {
    scout: readJson("data/nara-scout-leads.json"),
    central: readJson("data/central-chronology-files.json"),
    blackwill: readJson("data/blackwill-files.json"),
    blackwillChron: readJson("data/blackwill-chron-files.json"),
    gates: readJson("data/gates-chron-files.json"),
    requested: readJson("data/requested-source-series.json")
  };
  fs.mkdirSync(path.join(ROOT, "reports"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "reports/compiler-chronology.md"), buildMarkdown(records));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-source-notes.csv"), buildCsv(records));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-gap-audit.md"), buildGapAudit(records, data));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-gap-audit.csv"), buildGapCsv(records, data));
  console.log(`Wrote compiler exports for ${records.length} records.`);
}

main();
