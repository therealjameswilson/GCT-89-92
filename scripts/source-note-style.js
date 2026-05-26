function clean(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function sentence(value) {
  const text = clean(value);
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function normalizeKey(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueParts(parts) {
  const seen = [];
  const output = [];
  for (const part of parts.map(clean).filter(Boolean)) {
    const key = normalizeKey(part);
    if (!key || seen.some((existing) => existing === key || (key.length > 8 && existing.includes(key)))) continue;
    const narrowerIndex = seen.findIndex((existing) => existing.length > 8 && key.includes(existing));
    if (narrowerIndex >= 0) {
      seen.splice(narrowerIndex, 1);
      output.splice(narrowerIndex, 1);
    }
    seen.push(key);
    output.push(part);
  }
  return output;
}

function inferRepository(item) {
  const source = item.source || {};
  const sourceText = [
    source.collection,
    source.series,
    source.name,
    item.collection,
    item.series,
    item.title,
    item.sourceNote
  ]
    .filter(Boolean)
    .join(" ");
  if (/Bush|George H\.?\s*W\.?|White House Office|National Security Council|Scowcroft|Presidential Daily File|NSC|NSD|NSR|IF Transition/i.test(sourceText)) {
    return "George H.W. Bush Library";
  }
  if (/Department of State|Central Foreign Policy File/i.test(sourceText)) {
    return "Department of State";
  }
  return "National Archives";
}

function formatCollection(value) {
  const text = clean(value);
  if (/^Records of the National Security Council \(George H\. W\. Bush Administration\)$/i.test(text)) {
    return "Bush Presidential Records, National Security Council";
  }
  const whiteHouse = text.match(/^Records of the White House Office of (.+) \(George H\. W\. Bush Administration\)$/i);
  if (whiteHouse) return `Bush Presidential Records, White House Office of ${whiteHouse[1]}`;
  if (/^White House Office of .+ Files$/i.test(text)) return `Bush Presidential Records, ${text}`;
  if (/^Brent Scowcroft Papers$/i.test(text)) return "Bush Presidential Records, Brent Scowcroft Collection";
  return text;
}

function sourceCollection(item) {
  const collection = item.source?.collection || item.collection || "";
  if (!collection && /Scowcroft/i.test(item.title || item.label || "")) return "Bush Presidential Records, Brent Scowcroft Collection";
  if (!collection && /National Security Council|NSC|NSD|NSR|IF Transition/i.test(item.title || item.label || "")) {
    return "Bush Presidential Records, National Security Council";
  }
  if (!collection && /Presidential Daily File/i.test(item.title || item.label || "")) return "Bush Presidential Records";
  return formatCollection(collection);
}

function sourceSeries(item) {
  return item.source?.series || item.series || "";
}

function sourceFile(item) {
  return item.source?.fileTitle || item.fileTitle || "";
}

function itemTitle(item) {
  return item.documentTitle || item.title || item.label || "";
}

function usableStatus(value) {
  const text = clean(value);
  if (!text) return "";
  if (/^(access status not specified|catalog metadata pending|unknown)$/i.test(text)) return "";
  return text;
}

function buildFrusSourceNote(item) {
  const parts = uniqueParts([
    inferRepository(item),
    sourceCollection(item),
    sourceSeries(item),
    sourceFile(item),
    itemTitle(item)
  ]);
  const citation = `Source: ${parts.join(", ")}`;
  const details = [];
  const releaseStatus = usableStatus(item.releaseStatus);
  const accessRestriction = usableStatus(item.accessRestriction);
  if (releaseStatus) details.push(`Release status: ${releaseStatus}`);
  if (!releaseStatus && accessRestriction) details.push(`Access restriction: ${accessRestriction}`);
  if (item.naid) details.push(`NAID ${clean(item.naid)}`);
  return [sentence(citation), ...details.map(sentence)].filter(Boolean).join(" ");
}

function buildResearchNote(item) {
  const parts = [];
  if (item.matchBasis) parts.push(`Match basis: ${item.matchBasis}.`);
  if (item.queryLabels?.length) parts.push(`Query hit(s): ${item.queryLabels.join(", ")}.`);
  if (item.queryTotals?.length) {
    const totals = [...item.queryTotals]
      .sort((a, b) => (b.total || 0) - (a.total || 0))
      .slice(0, 8)
      .map((query) => `${query.label || query.q} (${query.total || 0})`);
    if (totals.length) parts.push(`Query totals: ${totals.join(", ")}.`);
  }
  if (item.ocrStatus) parts.push(`OCR status: ${item.ocrStatus}.`);
  if (item.documentSignals?.length) parts.push(`OCR signals: ${item.documentSignals.slice(0, 3).join(" | ")}.`);
  if (item.pageCount) parts.push(`PDF extent: ${item.pageCount} pages.`);
  if (item.objectFilename) parts.push(`Digital object: ${item.objectFilename}.`);
  if (item.childTotal != null) parts.push(`Children found: ${item.childTotal}.`);
  if (item.onlineChildTotal != null) parts.push(`Online children: ${item.onlineChildTotal}.`);
  if (item.queryHitFiles != null) parts.push(`Retained EastMed leads: ${item.queryHitFiles}.`);
  if (item.rootHarvestError) parts.push(`Root metadata note: ${item.rootHarvestError}.`);
  if (item.childHarvestError) parts.push(`Child search note: ${item.childHarvestError}.`);
  if (item.onlineChildHarvestError) parts.push(`Online child search note: ${item.onlineChildHarvestError}.`);
  if (item.queryHarvestErrors) parts.push(`${item.queryHarvestErrors} topic searches returned endpoint errors in this run.`);
  if (item.catalogUrl) parts.push(`Catalog: ${item.catalogUrl}.`);
  if (item.searchWithinUrl) parts.push(`Search Within: ${item.searchWithinUrl}.`);
  return clean(parts.join(" "));
}

function applyFrusSourceStyle(item) {
  if (!item || typeof item !== "object") return item;
  item.sourceNote = buildFrusSourceNote(item);
  const researchNote = buildResearchNote(item);
  if (researchNote) item.researchNote = researchNote;
  return item;
}

function walkSourceNotes(value) {
  if (Array.isArray(value)) {
    value.forEach(walkSourceNotes);
    return value;
  }
  if (!value || typeof value !== "object") return value;
  if (Object.prototype.hasOwnProperty.call(value, "sourceNote")) applyFrusSourceStyle(value);
  for (const child of Object.values(value)) walkSourceNotes(child);
  return value;
}

module.exports = {
  applyFrusSourceStyle,
  buildFrusSourceNote,
  buildResearchNote,
  walkSourceNotes
};
