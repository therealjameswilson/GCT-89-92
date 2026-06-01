const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CHAPTER_ORDER = ["Greece", "Cyprus", "Turkey", "Regional"];

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
  return String(value || "").replace(/\s+/g, " ").trim();
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
  fs.mkdirSync(path.join(ROOT, "reports"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "reports/compiler-chronology.md"), buildMarkdown(records));
  fs.writeFileSync(path.join(ROOT, "reports/compiler-source-notes.csv"), buildCsv(records));
  console.log(`Wrote compiler exports for ${records.length} records.`);
}

main();
