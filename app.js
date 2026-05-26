const CHAPTER_ORDER = ["Greece", "Cyprus", "Turkey", "Regional"];

const recordsRoot = document.querySelector("#records-root");
const scoutRoot = document.querySelector("#scout-root");
const centralRoot = document.querySelector("#central-root");
const blackwillRoot = document.querySelector("#blackwill-root");
const blackwillChronRoot = document.querySelector("#blackwill-chron-root");
const gatesChronRoot = document.querySelector("#gates-chron-root");
const requestedSourceRoot = document.querySelector("#requested-source-root");
const compilerRoot = document.querySelector("#compiler-root");

const totalRecords = document.querySelector("#total-records");
const totalPages = document.querySelector("#total-pages");
const scoutCount = document.querySelector("#scout-count");
const centralCount = document.querySelector("#central-count");
const blackwillCount = document.querySelector("#blackwill-count");
const blackwillChronCount = document.querySelector("#blackwill-chron-count");
const gatesChronCount = document.querySelector("#gates-chron-count");
const requestedSourceCount = document.querySelector("#requested-source-count");

const recordSearch = document.querySelector("#record-search");
const chapterFilter = document.querySelector("#chapter-filter");
const typeFilter = document.querySelector("#type-filter");
const releaseFilter = document.querySelector("#release-filter");
const clearFilters = document.querySelector("#clear-filters");
const recordsSummary = document.querySelector("#records-summary");

const scoutSearch = document.querySelector("#scout-search");
const scoutChapterFilter = document.querySelector("#scout-chapter-filter");
const scoutCategoryFilter = document.querySelector("#scout-category-filter");
const scoutClear = document.querySelector("#scout-clear");
const scoutSummary = document.querySelector("#scout-summary");

const centralSearch = document.querySelector("#central-search");
const centralChapterFilter = document.querySelector("#central-chapter-filter");
const centralPriorityFilter = document.querySelector("#central-priority-filter");
const centralClear = document.querySelector("#central-clear");
const centralSummary = document.querySelector("#central-summary");

const blackwillSearch = document.querySelector("#blackwill-search");
const blackwillPriorityFilter = document.querySelector("#blackwill-priority-filter");
const blackwillClear = document.querySelector("#blackwill-clear");
const blackwillSummary = document.querySelector("#blackwill-summary");

const blackwillChronSearch = document.querySelector("#blackwill-chron-search");
const blackwillChronChapterFilter = document.querySelector("#blackwill-chron-chapter-filter");
const blackwillChronPriorityFilter = document.querySelector("#blackwill-chron-priority-filter");
const blackwillChronClear = document.querySelector("#blackwill-chron-clear");
const blackwillChronSummary = document.querySelector("#blackwill-chron-summary");

const gatesChronSearch = document.querySelector("#gates-chron-search");
const gatesChronChapterFilter = document.querySelector("#gates-chron-chapter-filter");
const gatesChronPriorityFilter = document.querySelector("#gates-chron-priority-filter");
const gatesChronClear = document.querySelector("#gates-chron-clear");
const gatesChronSummary = document.querySelector("#gates-chron-summary");

const requestedSourceSearch = document.querySelector("#requested-source-search");
const requestedSourcePriorityFilter = document.querySelector("#requested-source-priority-filter");
const requestedSourceClear = document.querySelector("#requested-source-clear");
const requestedSourceSummary = document.querySelector("#requested-source-summary");

let allRecords = [];
let allScoutLeads = [];
let allCentralFiles = [];
let allBlackwillFiles = [];
let allBlackwillChronFiles = [];
let allGatesChronFiles = [];
let allRequestedSources = [];

function chapterId(chapterName) {
  return `chapter-${chapterName.toLowerCase().replaceAll(" ", "-")}`;
}

function chapterHeading(chapterName) {
  return `Chapter ${CHAPTER_ORDER.indexOf(chapterName) + 1}: ${chapterName}`;
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function byChapterThenDate(a, b) {
  return (
    a.chapter.number - b.chapter.number ||
    a.sortDate.localeCompare(b.sortDate) ||
    a.title.localeCompare(b.title)
  );
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function addOptions(select, values, label) {
  if (!select) return;
  select.replaceChildren(new Option(label, ""), ...values.map((value) => new Option(value, value)));
}

function assignCompilerNumbers(records) {
  const chapterCounts = new Map();
  for (const record of [...records].sort(byChapterThenDate)) {
    const chapterCount = (chapterCounts.get(record.chapter.name) || 0) + 1;
    chapterCounts.set(record.chapter.name, chapterCount);
    record.compilerNumber = `${record.chapter.number}.${String(chapterCount).padStart(3, "0")}`;
  }
  return records;
}

function assignSequential(items, prefix, fieldName) {
  return [...items]
    .sort((a, b) => a.sortDate?.localeCompare(b.sortDate || "") || a.title.localeCompare(b.title))
    .map((item, index) => ({ ...item, [fieldName]: `${prefix} ${String(index + 1).padStart(3, "0")}` }));
}

function setCounts() {
  const pages = allRecords.reduce((sum, record) => sum + (record.pageCount || 0), 0);
  if (totalRecords) totalRecords.textContent = allRecords.length.toString();
  if (totalPages) totalPages.textContent = pages.toString();
  if (scoutCount) scoutCount.textContent = allScoutLeads.length.toString();
  if (centralCount) centralCount.textContent = allCentralFiles.length.toString();
  if (blackwillCount) blackwillCount.textContent = allBlackwillFiles.length.toString();
  if (blackwillChronCount) blackwillChronCount.textContent = allBlackwillChronFiles.length.toString();
  if (gatesChronCount) gatesChronCount.textContent = allGatesChronFiles.length.toString();
  if (requestedSourceCount) requestedSourceCount.textContent = allRequestedSources.length.toString();

  for (const chapterName of CHAPTER_ORDER) {
    const chapterRecords = allRecords.filter((record) => record.chapter.name === chapterName);
    const countNode = document.querySelector(`[data-chapter-count="${chapterName}"]`);
    const pagesNode = document.querySelector(`[data-chapter-pages="${chapterName}"]`);
    if (countNode) countNode.textContent = chapterRecords.length.toString();
    if (pagesNode) {
      pagesNode.textContent = chapterRecords.reduce((sum, record) => sum + (record.pageCount || 0), 0).toString();
    }
  }
}

function populateFilters() {
  addOptions(chapterFilter, CHAPTER_ORDER, "All chapters");
  addOptions(typeFilter, uniqueSorted(allRecords.map((record) => record.type)), "All types");
  addOptions(releaseFilter, uniqueSorted(allRecords.map((record) => record.releaseStatus)), "All release statuses");
  addOptions(scoutChapterFilter, CHAPTER_ORDER, "All chapters");
  addOptions(scoutCategoryFilter, uniqueSorted(allScoutLeads.map((lead) => lead.category)), "All categories");
  addOptions(centralChapterFilter, CHAPTER_ORDER, "All chapters");
  addOptions(centralPriorityFilter, uniqueSorted(allCentralFiles.map((file) => file.priority)), "All priorities");
  addOptions(blackwillChronChapterFilter, CHAPTER_ORDER, "All chapters");
  addOptions(blackwillChronPriorityFilter, uniqueSorted(allBlackwillChronFiles.map((file) => file.priority)), "All priorities");
  addOptions(gatesChronChapterFilter, CHAPTER_ORDER, "All chapters");
  addOptions(gatesChronPriorityFilter, uniqueSorted(allGatesChronFiles.map((file) => file.priority)), "All priorities");
  addOptions(requestedSourcePriorityFilter, uniqueSorted(allRequestedSources.map((source) => source.priority)), "All priorities");
  addOptions(
    blackwillPriorityFilter,
    uniqueSorted(allBlackwillFiles.map((file) => file.priority)),
    "All priorities"
  );
}

function releaseNeedsAttention(record) {
  return /partial|denied|restricted|marker|no memorandum|unknown/i.test(
    `${record.releaseStatus || ""} ${record.accessRestriction || ""} ${record.type || ""}`
  );
}

function countBy(items, getter) {
  const counts = new Map();
  for (const item of items) {
    const key = getter(item) || "Unspecified";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function createMetric(label, value, detail) {
  const card = document.createElement("article");
  card.className = "compiler-card";
  const valueNode = document.createElement("strong");
  valueNode.textContent = value;
  const labelNode = document.createElement("span");
  labelNode.textContent = label;
  const detailNode = document.createElement("p");
  detailNode.textContent = detail;
  card.append(valueNode, labelNode, detailNode);
  return card;
}

function renderCompilerDesk() {
  if (!compilerRoot) return;
  const pages = allRecords.reduce((sum, record) => sum + (record.pageCount || 0), 0);
  const blackwillPages = allBlackwillFiles.reduce((sum, file) => sum + (file.pageCount || 0), 0);
  const blackwillChronOcr = allBlackwillChronFiles.filter((file) => (file.documentSignals || []).length).length;
  const gatesChronOcr = allGatesChronFiles.filter((file) => (file.documentSignals || []).length).length;
  const centralOcr = allCentralFiles.filter((file) => (file.documentSignals || []).length).length;
  const requestedQueryLeads = allRequestedSources.reduce((sum, source) => sum + (source.queryHitFiles || 0), 0);
  const restrictions = allRecords.filter(releaseNeedsAttention);

  const metrics = document.createElement("div");
  metrics.className = "compiler-metrics";
  metrics.append(
    createMetric("Conversation records", allRecords.length.toString(), "Official memcon/telcon rows grouped by chapter."),
    createMetric("Conversation pages", pages.toString(), "PDF extents measured from Catalog digital objects."),
    createMetric("Restriction markers", restrictions.length.toString(), "Partial, denied, marker, or no-document rows."),
    createMetric(
      "Scout + series leads",
      `${allScoutLeads.length + allCentralFiles.length + allBlackwillFiles.length + allBlackwillChronFiles.length + allGatesChronFiles.length + allRequestedSources.length}`,
      `${centralOcr} Central, ${blackwillChronOcr} Blackwill, and ${gatesChronOcr} Gates packets have OCR signals; ${allRequestedSources.length} requested pools retain ${requestedQueryLeads} query leads.`
    )
  );

  const sourcePanel = document.createElement("div");
  sourcePanel.className = "compiler-panel";
  const sourceTitle = document.createElement("h3");
  sourceTitle.textContent = "Source Mix";
  const sourceList = document.createElement("ol");
  sourceList.className = "compiler-list";
  for (const [source, count] of countBy(allRecords, (record) => record.source?.series || record.source?.name).slice(0, 6)) {
    const item = document.createElement("li");
    item.textContent = `${source}: ${count}`;
    sourceList.append(item);
  }
  sourcePanel.append(sourceTitle, sourceList);

  const scoutPanel = document.createElement("div");
  scoutPanel.className = "compiler-panel";
  const scoutTitle = document.createElement("h3");
  scoutTitle.textContent = "NARA Scout Queues";
  const scoutList = document.createElement("ol");
  scoutList.className = "compiler-list";
  for (const [category, count] of countBy(allScoutLeads, (lead) => lead.category)) {
    const item = document.createElement("li");
    item.textContent = `${category}: ${count}`;
    scoutList.append(item);
  }
  scoutPanel.append(scoutTitle, scoutList);

  const ledger = document.createElement("div");
  ledger.className = "compiler-panel compiler-panel-wide";
  const ledgerTitle = document.createElement("h3");
  ledgerTitle.textContent = "Declassification and Marker Ledger";
  const ledgerList = document.createElement("ol");
  ledgerList.className = "compiler-list";
  for (const record of restrictions.sort(byChapterThenDate).slice(0, 10)) {
    const item = document.createElement("li");
    item.textContent = `Doc ${record.compilerNumber}: ${formatDate(record.date)} - ${record.title} (${record.releaseStatus})`;
    ledgerList.append(item);
  }
  if (!ledgerList.children.length) {
    const item = document.createElement("li");
    item.textContent = "No conversation records currently require restriction-ledger attention.";
    ledgerList.append(item);
  }
  ledger.append(ledgerTitle, ledgerList);

  compilerRoot.replaceChildren(metrics, sourcePanel, scoutPanel, ledger);
}

function createMeta(values) {
  const meta = document.createElement("div");
  meta.className = "record-meta";
  for (const value of values.filter(Boolean)) {
    const item = document.createElement("span");
    item.textContent = value;
    meta.append(item);
  }
  return meta;
}

function createTopics(values) {
  const topics = document.createElement("div");
  topics.className = "record-topics";
  for (const value of uniqueSorted(values).slice(0, 7)) {
    const item = document.createElement("span");
    item.textContent = value;
    topics.append(item);
  }
  return topics;
}

function createFlags(values) {
  const flags = document.createElement("div");
  flags.className = "record-flags";
  for (const value of values.filter(Boolean)) {
    const item = document.createElement("span");
    item.textContent = value;
    flags.append(item);
  }
  return flags;
}

function createSourceDetails(summaryText, sourceNote, bodyText = "") {
  const details = document.createElement("details");
  details.className = "record-source-note";
  const summary = document.createElement("summary");
  summary.textContent = summaryText;
  const source = document.createElement("p");
  source.className = "record-frus-source-note";
  source.textContent = sourceNote || "Source note pending.";
  details.append(summary, source);
  if (bodyText) {
    const body = document.createElement("p");
    body.className = "record-research-note";
    body.textContent = bodyText;
    details.append(body);
  }
  return details;
}

function createScheduleReferenceDetails(references = []) {
  const usableReferences = references.filter((reference) => reference.sourceNote);
  if (!usableReferences.length) return null;

  const details = document.createElement("details");
  details.className = "record-source-note record-schedule-references";
  const summary = document.createElement("summary");
  summary.textContent = "Meeting/call references";
  details.append(summary);

  for (const reference of usableReferences) {
    const source = document.createElement("p");
    source.className = "record-frus-source-note";
    source.textContent = reference.sourceNote;
    details.append(source);

    const noteText = [reference.researchNote, reference.scopeAndContentNote].filter(Boolean).join(" ");
    if (noteText) {
      const note = document.createElement("p");
      note.className = "record-research-note";
      note.textContent = noteText;
      details.append(note);
    }
  }

  return details;
}

function createLinks(links) {
  const wrap = document.createElement("div");
  wrap.className = "record-links";
  for (const [label, url] of links) {
    if (!url) continue;
    const link = document.createElement("a");
    link.href = url;
    link.rel = "noreferrer";
    link.textContent = label;
    wrap.append(link);
  }
  return wrap;
}

function createRecordRow(record) {
  const row = document.createElement("article");
  row.className = "record-row";

  const dateStack = document.createElement("div");
  dateStack.className = "record-date-stack";
  const number = document.createElement("span");
  number.className = "record-doc-number";
  number.textContent = `Doc ${record.compilerNumber}`;
  const date = document.createElement("time");
  date.className = "record-date";
  date.dateTime = record.date;
  date.textContent = formatDate(record.date);
  dateStack.append(number, date);

  const body = document.createElement("div");
  const title = document.createElement("a");
  title.className = "record-title";
  title.href = record.catalogUrl || record.pdfUrl;
  title.rel = "noreferrer";
  title.textContent = record.documentTitle || record.title;

  const subject = document.createElement("p");
  subject.className = "record-subject";
  subject.textContent = (record.participants || []).slice(0, 5).join("; ");

  const sourceLine = document.createElement("p");
  sourceLine.className = "record-source-line";
  sourceLine.textContent = record.source?.series || record.source?.collection || record.source?.name || "Source pending";

  body.append(
    title,
    subject,
    sourceLine,
    createMeta([
      record.type,
      record.countries?.filter((country) => country !== "United States").join(", "),
      record.pageCount ? `${record.pageCount} pages` : "Pages pending",
      `NAID ${record.naid}`,
      record.releaseStatus
    ]),
    createTopics(record.topics || []),
    createFlags([releaseNeedsAttention(record) ? "Restriction / marker review" : ""]),
    createSourceDetails("Source note", record.sourceNote, record.researchNote)
  );
  const scheduleReferences = createScheduleReferenceDetails(record.scheduleReferences || []);
  if (scheduleReferences) body.append(scheduleReferences);

  row.append(dateStack, body, createLinks([["Catalog", record.catalogUrl], ["PDF", record.pdfUrl]]));
  return row;
}

function searchText(item) {
  return JSON.stringify(item).toLowerCase();
}

function filterRecords() {
  const query = recordSearch?.value.trim().toLowerCase() || "";
  const chapter = chapterFilter?.value || "";
  const type = typeFilter?.value || "";
  const release = releaseFilter?.value || "";
  return allRecords.filter((record) => {
    if (chapter && record.chapter.name !== chapter) return false;
    if (type && record.type !== type) return false;
    if (release && record.releaseStatus !== release) return false;
    return !query || searchText(record).includes(query);
  });
}

function renderRecords() {
  const records = filterRecords().sort(byChapterThenDate);
  const selectedChapter = chapterFilter?.value || "";
  const chaptersToRender = selectedChapter ? [selectedChapter] : CHAPTER_ORDER;
  const pages = records.reduce((sum, record) => sum + (record.pageCount || 0), 0);
  if (recordsSummary) recordsSummary.textContent = `Showing ${records.length} of ${allRecords.length} records / ${pages} pages in view`;
  recordsRoot.replaceChildren();

  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "empty-chapter";
    empty.textContent = "No records match the current search or filters.";
    recordsRoot.append(empty);
    return;
  }

  for (const chapterName of chaptersToRender) {
    const chapterRecords = records.filter((record) => record.chapter.name === chapterName);
    if (!chapterRecords.length && !selectedChapter) continue;
    const section = document.createElement("section");
    section.className = "record-chapter";
    section.id = chapterId(chapterName);

    const header = document.createElement("div");
    header.className = "record-chapter-header";
    const heading = document.createElement("h3");
    heading.textContent = chapterHeading(chapterName);
    const count = document.createElement("p");
    count.className = "record-count";
    count.textContent = `${chapterRecords.length} records / ${chapterRecords.reduce((sum, record) => sum + (record.pageCount || 0), 0)} pages`;
    header.append(heading, count);

    const list = document.createElement("div");
    list.className = "record-list";
    for (const record of chapterRecords) list.append(createRecordRow(record));
    section.append(header, list);
    recordsRoot.append(section);
  }
}

function createScoutRow(lead) {
  const row = document.createElement("article");
  row.className = "record-row scout-row";

  const dateStack = document.createElement("div");
  dateStack.className = "record-date-stack";
  const number = document.createElement("span");
  number.className = "record-doc-number";
  number.textContent = lead.leadNumber;
  const date = document.createElement("time");
  date.className = "record-date";
  date.dateTime = lead.date;
  date.textContent = lead.year || formatDate(lead.date);
  dateStack.append(number, date);

  const body = document.createElement("div");
  const title = document.createElement("a");
  title.className = "record-title";
  title.href = lead.catalogUrl;
  title.rel = "noreferrer";
  title.textContent = lead.title;

  const sourceLine = document.createElement("p");
  sourceLine.className = "record-source-line";
  sourceLine.textContent = lead.source?.series || lead.source?.collection || "NARA Scout lead";

  body.append(
    title,
    sourceLine,
    createMeta([
      lead.chapter.name,
      lead.category,
      lead.levelOfDescription,
      lead.accessRestriction,
      lead.objectCount ? `${lead.objectCount} digital object` : "",
      `NAID ${lead.naid}`,
      `Score ${lead.score}`
    ]),
    createTopics([...(lead.topics || []), ...(lead.queryLabels || [])]),
    createSourceDetails("Source note", lead.sourceNote, [lead.researchNote, lead.scopeAndContentNote].filter(Boolean).join(" "))
  );

  row.append(dateStack, body, createLinks([["Catalog", lead.catalogUrl], ["PDF", lead.pdfUrl], ["NARA Scout", lead.scoutUrls?.[0]]]));
  return row;
}

function filterScoutLeads() {
  const query = scoutSearch?.value.trim().toLowerCase() || "";
  const chapter = scoutChapterFilter?.value || "";
  const category = scoutCategoryFilter?.value || "";
  return allScoutLeads.filter((lead) => {
    if (chapter && lead.chapter.name !== chapter) return false;
    if (category && lead.category !== category) return false;
    return !query || searchText(lead).includes(query);
  });
}

function renderScoutLeads() {
  const leads = filterScoutLeads().sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  if (scoutSummary) scoutSummary.textContent = `Showing ${leads.length} of ${allScoutLeads.length} NARA Scout leads`;
  scoutRoot.replaceChildren();
  if (!leads.length) {
    const empty = document.createElement("p");
    empty.className = "empty-chapter";
    empty.textContent = "No NARA Scout leads match the current filters.";
    scoutRoot.append(empty);
    return;
  }
  for (const lead of leads) scoutRoot.append(createScoutRow(lead));
}

function createCentralRow(file) {
  const row = document.createElement("article");
  row.className = "record-row central-row";

  const dateStack = document.createElement("div");
  dateStack.className = "record-date-stack";
  const number = document.createElement("span");
  number.className = "record-doc-number";
  number.textContent = file.fileNumber;
  const date = document.createElement("time");
  date.className = "record-date";
  date.dateTime = file.date;
  date.textContent = file.year || "1989-1993";
  dateStack.append(number, date);

  const body = document.createElement("div");
  const title = document.createElement("a");
  title.className = "record-title";
  title.href = file.catalogUrl;
  title.rel = "noreferrer";
  title.textContent = file.title;

  const sourceLine = document.createElement("p");
  sourceLine.className = "record-source-line";
  sourceLine.textContent = file.source?.series || "European and Eurasian Directorate Central Chronological Files";

  const rationale = document.createElement("p");
  rationale.className = "record-subject";
  rationale.textContent = file.rationale;

  body.append(
    title,
    rationale,
    sourceLine,
    createMeta([
      file.chapter.name,
      file.priority,
      file.category,
      file.pageCount ? `${file.pageCount} pages` : "Pages pending",
      file.accessRestriction,
      `NAID ${file.naid}`,
      `Score ${file.score}`
    ]),
    createTopics([...(file.queryLabels || []), file.ocrStatus]),
    createSourceDetails("Source note", file.sourceNote, file.researchNote)
  );

  row.append(dateStack, body, createLinks([["Catalog", file.catalogUrl], ["PDF", file.pdfUrl], ["Series", file.source?.url]]));
  return row;
}

function filterCentralFiles() {
  const query = centralSearch?.value.trim().toLowerCase() || "";
  const chapter = centralChapterFilter?.value || "";
  const priority = centralPriorityFilter?.value || "";
  return allCentralFiles.filter((file) => {
    if (chapter && file.chapter.name !== chapter) return false;
    if (priority && file.priority !== priority) return false;
    return !query || searchText(file).includes(query);
  });
}

function renderCentralFiles() {
  const files = filterCentralFiles().sort((a, b) => b.score - a.score || a.sortDate.localeCompare(b.sortDate));
  const ocrSignals = files.filter((file) => (file.documentSignals || []).length).length;
  if (centralSummary) {
    centralSummary.textContent = `Showing ${files.length} of ${allCentralFiles.length} Central Chronology leads / ${ocrSignals} with OCR signals in view`;
  }
  centralRoot.replaceChildren();
  if (!files.length) {
    const empty = document.createElement("p");
    empty.className = "empty-chapter";
    empty.textContent = "No Central Chronology files match the current filters.";
    centralRoot.append(empty);
    return;
  }
  for (const file of files) centralRoot.append(createCentralRow(file));
}

function createBlackwillRow(file) {
  const row = document.createElement("article");
  row.className = "record-row blackwill-row";

  const dateStack = document.createElement("div");
  dateStack.className = "record-date-stack";
  const number = document.createElement("span");
  number.className = "record-doc-number";
  number.textContent = file.fileNumber;
  const date = document.createElement("time");
  date.className = "record-date";
  date.dateTime = file.date;
  date.textContent = file.year || "1989-1993";
  dateStack.append(number, date);

  const body = document.createElement("div");
  const title = document.createElement("a");
  title.className = "record-title";
  title.href = file.catalogUrl;
  title.rel = "noreferrer";
  title.textContent = file.title;

  const sourceLine = document.createElement("p");
  sourceLine.className = "record-source-line";
  sourceLine.textContent = file.source?.series || "Robert D. Blackwill's Subject Files";

  const rationale = document.createElement("p");
  rationale.className = "record-subject";
  rationale.textContent = file.rationale;

  body.append(
    title,
    rationale,
    sourceLine,
    createMeta([
      file.priority,
      file.accessRestriction,
      file.pageCount ? `${file.pageCount} pages` : "Pages pending",
      file.levelOfDescription,
      `NAID ${file.naid}`
    ]),
    createSourceDetails("Source note", file.sourceNote, file.researchNote)
  );

  row.append(dateStack, body, createLinks([["Catalog", file.catalogUrl], ["PDF", file.pdfUrl], ["Series", file.source?.url]]));
  return row;
}

function filterBlackwillFiles() {
  const query = blackwillSearch?.value.trim().toLowerCase() || "";
  const priority = blackwillPriorityFilter?.value || "";
  return allBlackwillFiles.filter((file) => {
    if (priority && file.priority !== priority) return false;
    return !query || searchText(file).includes(query);
  });
}

function renderBlackwillFiles() {
  const files = filterBlackwillFiles().sort((a, b) => a.sortTitle.localeCompare(b.sortTitle));
  const pages = files.reduce((sum, file) => sum + (file.pageCount || 0), 0);
  if (blackwillSummary) blackwillSummary.textContent = `Showing ${files.length} of ${allBlackwillFiles.length} files / ${pages} pages in view`;
  blackwillRoot.replaceChildren();
  if (!files.length) {
    const empty = document.createElement("p");
    empty.className = "empty-chapter";
    empty.textContent = "No Blackwill files match the current filters.";
    blackwillRoot.append(empty);
    return;
  }
  for (const file of files) blackwillRoot.append(createBlackwillRow(file));
}

function createBlackwillChronRow(file) {
  const row = document.createElement("article");
  row.className = "record-row blackwill-chron-row";

  const dateStack = document.createElement("div");
  dateStack.className = "record-date-stack";
  const number = document.createElement("span");
  number.className = "record-doc-number";
  number.textContent = file.fileNumber;
  const date = document.createElement("time");
  date.className = "record-date";
  date.dateTime = file.date;
  date.textContent = file.year || "1989-1990";
  dateStack.append(number, date);

  const body = document.createElement("div");
  const title = document.createElement("a");
  title.className = "record-title";
  title.href = file.catalogUrl;
  title.rel = "noreferrer";
  title.textContent = file.title;

  const sourceLine = document.createElement("p");
  sourceLine.className = "record-source-line";
  sourceLine.textContent = file.source?.series || "Robert D. Blackwill Chronological Files";

  const rationale = document.createElement("p");
  rationale.className = "record-subject";
  rationale.textContent = file.rationale;

  body.append(
    title,
    rationale,
    sourceLine,
    createMeta([
      file.chapter.name,
      file.priority,
      file.category,
      file.pageCount ? `${file.pageCount} pages` : "Pages pending",
      file.accessRestriction,
      `NAID ${file.naid}`,
      file.score ? `Score ${file.score}` : ""
    ]),
    createTopics([...(file.queryLabels || []), file.ocrStatus]),
    createSourceDetails("Source note", file.sourceNote, file.researchNote)
  );

  row.append(dateStack, body, createLinks([["Catalog", file.catalogUrl], ["PDF", file.pdfUrl], ["Series", file.source?.url]]));
  return row;
}

function filterBlackwillChronFiles() {
  const query = blackwillChronSearch?.value.trim().toLowerCase() || "";
  const chapter = blackwillChronChapterFilter?.value || "";
  const priority = blackwillChronPriorityFilter?.value || "";
  return allBlackwillChronFiles.filter((file) => {
    if (chapter && file.chapter.name !== chapter) return false;
    if (priority && file.priority !== priority) return false;
    return !query || searchText(file).includes(query);
  });
}

function renderBlackwillChronFiles() {
  const files = filterBlackwillChronFiles().sort((a, b) => b.score - a.score || a.sortDate.localeCompare(b.sortDate));
  const ocrSignals = files.filter((file) => (file.documentSignals || []).length).length;
  if (blackwillChronSummary) {
    blackwillChronSummary.textContent = `Showing ${files.length} of ${allBlackwillChronFiles.length} chronological files / ${ocrSignals} with OCR signals in view`;
  }
  blackwillChronRoot.replaceChildren();
  if (!files.length) {
    const empty = document.createElement("p");
    empty.className = "empty-chapter";
    empty.textContent = "No Blackwill chronological files match the current filters.";
    blackwillChronRoot.append(empty);
    return;
  }
  for (const file of files) blackwillChronRoot.append(createBlackwillChronRow(file));
}

function createGatesChronRow(file) {
  const row = document.createElement("article");
  row.className = "record-row gates-chron-row";

  const dateStack = document.createElement("div");
  dateStack.className = "record-date-stack";
  const number = document.createElement("span");
  number.className = "record-doc-number";
  number.textContent = file.fileNumber;
  const date = document.createElement("time");
  date.className = "record-date";
  date.dateTime = file.date;
  date.textContent = file.year || "1989-1991";
  dateStack.append(number, date);

  const body = document.createElement("div");
  const title = document.createElement("a");
  title.className = "record-title";
  title.href = file.catalogUrl;
  title.rel = "noreferrer";
  title.textContent = file.title;

  const sourceLine = document.createElement("p");
  sourceLine.className = "record-source-line";
  sourceLine.textContent = file.source?.series || "Robert M. Gates' Chronological Files";

  const rationale = document.createElement("p");
  rationale.className = "record-subject";
  rationale.textContent = file.rationale;

  body.append(
    title,
    rationale,
    sourceLine,
    createMeta([
      file.chapter.name,
      file.priority,
      file.category,
      file.pageCount ? `${file.pageCount} pages` : "Pages pending",
      file.accessRestriction,
      `NAID ${file.naid}`,
      file.score ? `Score ${file.score}` : ""
    ]),
    createTopics([...(file.queryLabels || []), file.ocrStatus]),
    createSourceDetails("Source note", file.sourceNote, file.researchNote)
  );

  row.append(dateStack, body, createLinks([["Catalog", file.catalogUrl], ["PDF", file.pdfUrl], ["Series", file.source?.url]]));
  return row;
}

function filterGatesChronFiles() {
  const query = gatesChronSearch?.value.trim().toLowerCase() || "";
  const chapter = gatesChronChapterFilter?.value || "";
  const priority = gatesChronPriorityFilter?.value || "";
  return allGatesChronFiles.filter((file) => {
    if (chapter && file.chapter.name !== chapter) return false;
    if (priority && file.priority !== priority) return false;
    return !query || searchText(file).includes(query);
  });
}

function renderGatesChronFiles() {
  const files = filterGatesChronFiles().sort((a, b) => b.score - a.score || a.sortTitle.localeCompare(b.sortTitle));
  const ocrSignals = files.filter((file) => (file.documentSignals || []).length).length;
  if (gatesChronSummary) {
    gatesChronSummary.textContent = `Showing ${files.length} of ${allGatesChronFiles.length} chronological files / ${ocrSignals} with OCR signals in view`;
  }
  gatesChronRoot.replaceChildren();
  if (!files.length) {
    const empty = document.createElement("p");
    empty.className = "empty-chapter";
    empty.textContent = "No Gates chronological files match the current filters.";
    gatesChronRoot.append(empty);
    return;
  }
  for (const file of files) gatesChronRoot.append(createGatesChronRow(file));
}

function sourcePoolErrorFlags(source) {
  return [
    source.rootHarvestError ? "Root metadata retry needed" : "",
    source.childHarvestError || source.onlineChildHarvestError ? "Child search caveat" : "",
    source.queryHarvestErrors ? `${source.queryHarvestErrors} query caveats` : ""
  ];
}

function createRequestedSourceRow(source) {
  const row = document.createElement("article");
  row.className = "record-row requested-source-row";

  const dateStack = document.createElement("div");
  dateStack.className = "record-date-stack";
  const number = document.createElement("span");
  number.className = "record-doc-number";
  number.textContent = source.sourceNumber;
  const date = document.createElement("span");
  date.className = "record-date";
  date.textContent = source.shortLabel || source.label;
  dateStack.append(number, date);

  const body = document.createElement("div");
  const title = document.createElement("a");
  title.className = "record-title";
  title.href = source.searchWithinUrl || source.catalogUrl;
  title.rel = "noreferrer";
  title.textContent = source.title || source.label;

  const sourceLine = document.createElement("p");
  sourceLine.className = "record-source-line";
  sourceLine.textContent = [source.label, source.dateRange].filter(Boolean).join(" / ") || "Requested Catalog source pool";

  const summary = document.createElement("p");
  summary.className = "record-subject";
  summary.textContent =
    source.scopeAndContentNote ||
    source.note ||
    "Standing source-pool anchor for EastMed document selection and declassification review.";

  const queryTopics = [...(source.queryTotals || [])]
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
    .slice(0, 8)
    .map((query) => `${query.label} (${query.total})`);
  const leadSnippets = (source.leads || [])
    .slice(0, 6)
    .map((lead) => `${lead.title} (NAID ${lead.naid})`);
  const caveats = [
    source.rootHarvestError ? `Root metadata note: ${source.rootHarvestError}` : "",
    source.childHarvestError ? `Child search note: ${source.childHarvestError}` : "",
    source.onlineChildHarvestError ? `Online child search note: ${source.onlineChildHarvestError}` : "",
    source.queryHarvestErrors ? `${source.queryHarvestErrors} topic searches returned endpoint errors in this run.` : ""
  ].filter(Boolean);
  const detailsText = [
    leadSnippets.length
      ? `Retained top leads: ${leadSnippets.join(" | ")}`
      : "No query-hit lead records were retained from this public endpoint run.",
    ...caveats
  ].join(" ");

  body.append(
    title,
    summary,
    sourceLine,
    createMeta([
      source.priority,
      source.levelOfDescription,
      source.dateRange,
      source.onlineChildTotal ? `${source.onlineChildTotal} online child records` : "",
      source.childTotal ? `${source.childTotal} child records` : "",
      source.queryHitFiles ? `${source.queryHitFiles} retained leads` : "0 retained leads",
      source.queryHitTotal ? `${source.queryHitTotal} query hits` : "",
      source.seriesCount ? `${source.seriesCount} series` : "",
      `NAID ${source.naid}`
    ]),
    createTopics(queryTopics),
    createFlags(sourcePoolErrorFlags(source)),
    createSourceDetails("Source note", source.sourceNote, [source.researchNote, detailsText].filter(Boolean).join(" "))
  );

  row.append(
    dateStack,
    body,
    createLinks([
      ["Catalog", source.catalogUrl],
      ["Search Within", source.searchWithinUrl],
      ["Requested URL", source.requestedUrl]
    ])
  );
  return row;
}

function filterRequestedSources() {
  const query = requestedSourceSearch?.value.trim().toLowerCase() || "";
  const priority = requestedSourcePriorityFilter?.value || "";
  return allRequestedSources.filter((source) => {
    if (priority && source.priority !== priority) return false;
    return !query || searchText(source).includes(query);
  });
}

function renderRequestedSources() {
  if (!requestedSourceRoot) return;
  const sources = filterRequestedSources();
  const retainedLeads = sources.reduce((sum, source) => sum + (source.queryHitFiles || 0), 0);
  const onlineChildren = sources.reduce((sum, source) => sum + (source.onlineChildTotal || 0), 0);
  if (requestedSourceSummary) {
    requestedSourceSummary.textContent = `Showing ${sources.length} of ${allRequestedSources.length} requested source pools / ${retainedLeads} retained leads / ${onlineChildren} online child records in view`;
  }
  requestedSourceRoot.replaceChildren();
  if (!sources.length) {
    const empty = document.createElement("p");
    empty.className = "empty-chapter";
    empty.textContent = "No requested source pools match the current filters.";
    requestedSourceRoot.append(empty);
    return;
  }
  for (const source of sources) requestedSourceRoot.append(createRequestedSourceRow(source));
}

function bindFilters() {
  for (const control of [recordSearch, chapterFilter, typeFilter, releaseFilter]) {
    control?.addEventListener("input", renderRecords);
    control?.addEventListener("change", renderRecords);
  }
  clearFilters?.addEventListener("click", () => {
    if (recordSearch) recordSearch.value = "";
    if (chapterFilter) chapterFilter.value = "";
    if (typeFilter) typeFilter.value = "";
    if (releaseFilter) releaseFilter.value = "";
    renderRecords();
    recordSearch?.focus();
  });

  for (const control of [scoutSearch, scoutChapterFilter, scoutCategoryFilter]) {
    control?.addEventListener("input", renderScoutLeads);
    control?.addEventListener("change", renderScoutLeads);
  }
  scoutClear?.addEventListener("click", () => {
    if (scoutSearch) scoutSearch.value = "";
    if (scoutChapterFilter) scoutChapterFilter.value = "";
    if (scoutCategoryFilter) scoutCategoryFilter.value = "";
    renderScoutLeads();
    scoutSearch?.focus();
  });

  for (const control of [centralSearch, centralChapterFilter, centralPriorityFilter]) {
    control?.addEventListener("input", renderCentralFiles);
    control?.addEventListener("change", renderCentralFiles);
  }
  centralClear?.addEventListener("click", () => {
    if (centralSearch) centralSearch.value = "";
    if (centralChapterFilter) centralChapterFilter.value = "";
    if (centralPriorityFilter) centralPriorityFilter.value = "";
    renderCentralFiles();
    centralSearch?.focus();
  });

  for (const control of [blackwillSearch, blackwillPriorityFilter]) {
    control?.addEventListener("input", renderBlackwillFiles);
    control?.addEventListener("change", renderBlackwillFiles);
  }
  blackwillClear?.addEventListener("click", () => {
    if (blackwillSearch) blackwillSearch.value = "";
    if (blackwillPriorityFilter) blackwillPriorityFilter.value = "";
    renderBlackwillFiles();
    blackwillSearch?.focus();
  });

  for (const control of [blackwillChronSearch, blackwillChronChapterFilter, blackwillChronPriorityFilter]) {
    control?.addEventListener("input", renderBlackwillChronFiles);
    control?.addEventListener("change", renderBlackwillChronFiles);
  }
  blackwillChronClear?.addEventListener("click", () => {
    if (blackwillChronSearch) blackwillChronSearch.value = "";
    if (blackwillChronChapterFilter) blackwillChronChapterFilter.value = "";
    if (blackwillChronPriorityFilter) blackwillChronPriorityFilter.value = "";
    renderBlackwillChronFiles();
    blackwillChronSearch?.focus();
  });

  for (const control of [gatesChronSearch, gatesChronChapterFilter, gatesChronPriorityFilter]) {
    control?.addEventListener("input", renderGatesChronFiles);
    control?.addEventListener("change", renderGatesChronFiles);
  }
  gatesChronClear?.addEventListener("click", () => {
    if (gatesChronSearch) gatesChronSearch.value = "";
    if (gatesChronChapterFilter) gatesChronChapterFilter.value = "";
    if (gatesChronPriorityFilter) gatesChronPriorityFilter.value = "";
    renderGatesChronFiles();
    gatesChronSearch?.focus();
  });

  for (const control of [requestedSourceSearch, requestedSourcePriorityFilter]) {
    control?.addEventListener("input", renderRequestedSources);
    control?.addEventListener("change", renderRequestedSources);
  }
  requestedSourceClear?.addEventListener("click", () => {
    if (requestedSourceSearch) requestedSourceSearch.value = "";
    if (requestedSourcePriorityFilter) requestedSourcePriorityFilter.value = "";
    renderRequestedSources();
    requestedSourceSearch?.focus();
  });

  for (const card of document.querySelectorAll(".chapter-card")) {
    card.addEventListener("click", (event) => {
      const targetId = card.getAttribute("href");
      const chapterName = card.dataset.chapterName;
      if (!targetId?.startsWith("#") || !chapterName) return;
      if (chapterFilter) chapterFilter.value = chapterName;
      event.preventDefault();
      history.pushState(null, "", targetId);
      renderRecords();
      document.querySelector(targetId)?.scrollIntoView({ block: "start" });
    });
  }
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
  return response.json();
}

async function init() {
  try {
    allRecords = assignCompilerNumbers(window.GCT_RECORDS || (await loadJson("data/records.json")));
    allScoutLeads = assignSequential(window.NARA_SCOUT_LEADS || (await loadJson("data/nara-scout-leads.json")), "Lead", "leadNumber");
    allCentralFiles = assignSequential(
      window.CENTRAL_CHRONOLOGY_FILES || (await loadJson("data/central-chronology-files.json")),
      "CC",
      "fileNumber"
    );
    allBlackwillFiles = assignSequential(window.BLACKWILL_FILES || (await loadJson("data/blackwill-files.json")), "BW", "fileNumber");
    allBlackwillChronFiles = assignSequential(
      window.BLACKWILL_CHRON_FILES || (await loadJson("data/blackwill-chron-files.json")),
      "BC",
      "fileNumber"
    );
    allGatesChronFiles = assignSequential(
      window.GATES_CHRON_FILES || (await loadJson("data/gates-chron-files.json")),
      "GC",
      "fileNumber"
    );
    allRequestedSources = (window.REQUESTED_SOURCE_SERIES || (await loadJson("data/requested-source-series.json"))).map(
      (source, index) => ({ ...source, sourceNumber: `RS ${String(index + 1).padStart(3, "0")}` })
    );
    setCounts();
    populateFilters();
    bindFilters();
    renderCompilerDesk();
    renderRecords();
    renderScoutLeads();
    renderCentralFiles();
    renderBlackwillFiles();
    renderBlackwillChronFiles();
    renderGatesChronFiles();
    renderRequestedSources();
    if (window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView();
  } catch (error) {
    const message = "The research data could not be loaded. Try opening this site through a local server or GitHub Pages.";
    recordsRoot.innerHTML = `<p class="error">${message}</p>`;
    scoutRoot.innerHTML = `<p class="error">${message}</p>`;
    centralRoot.innerHTML = `<p class="error">${message}</p>`;
    blackwillRoot.innerHTML = `<p class="error">${message}</p>`;
    blackwillChronRoot.innerHTML = `<p class="error">${message}</p>`;
    gatesChronRoot.innerHTML = `<p class="error">${message}</p>`;
    if (requestedSourceRoot) requestedSourceRoot.innerHTML = `<p class="error">${message}</p>`;
    console.error(error);
  }
}

init();
