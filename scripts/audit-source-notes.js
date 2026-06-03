#!/usr/bin/env node

const fs = require("fs");

const DATASETS = [
  "data/records.json",
  "data/nara-scout-leads.json",
  "data/blackwill-files.json",
  "data/central-chronology-files.json",
  "data/blackwill-chron-files.json",
  "data/gates-chron-files.json",
  "data/requested-source-series.json"
];

const DISALLOWED_SOURCE_NOTE_PATTERNS = [
  /Release status:/,
  /Access restriction:/,
  /Catalog access:/,
  /\bNAID\s+\d+/
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function walk(value, path, visitor) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, visitor));
    return;
  }
  if (!value || typeof value !== "object") return;
  visitor(value, path);
  for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`, visitor);
}

function parseCsvHeader(file) {
  const [headerLine = ""] = fs.readFileSync(file, "utf8").split(/\r?\n/, 1);
  return headerLine.split(",");
}

function auditDatasets() {
  const violations = [];
  let sourceNoteCount = 0;
  let provenanceCount = 0;

  for (const file of DATASETS) {
    walk(readJson(file), file, (item, path) => {
      if (Object.prototype.hasOwnProperty.call(item, "sourceNote")) {
        sourceNoteCount += 1;
        const sourceNote = String(item.sourceNote || "");
        for (const pattern of DISALLOWED_SOURCE_NOTE_PATTERNS) {
          if (pattern.test(sourceNote)) violations.push(`${path}: sourceNote contains Catalog-only provenance (${pattern})`);
        }
      }
      if (/Catalog provenance:/.test(String(item.researchNote || ""))) provenanceCount += 1;
    });
  }

  return { sourceNoteCount, provenanceCount, violations };
}

function auditCompilerCsv() {
  const header = parseCsvHeader("reports/compiler-source-notes.csv");
  return {
    hasProvenanceColumn: header.includes("sourceNoteProvenance"),
    hasSourceNoteColumn: header.includes("sourceNote"),
    hasResearchNoteColumn: header.includes("researchNote")
  };
}

function main() {
  const datasetAudit = auditDatasets();
  const csvAudit = auditCompilerCsv();
  const failures = [...datasetAudit.violations];

  if (!csvAudit.hasSourceNoteColumn) failures.push("reports/compiler-source-notes.csv missing sourceNote column");
  if (!csvAudit.hasResearchNoteColumn) failures.push("reports/compiler-source-notes.csv missing researchNote column");
  if (!csvAudit.hasProvenanceColumn) failures.push("reports/compiler-source-notes.csv missing sourceNoteProvenance column");
  if (datasetAudit.provenanceCount !== datasetAudit.sourceNoteCount) {
    failures.push(
      `Catalog provenance count ${datasetAudit.provenanceCount} does not match source-note count ${datasetAudit.sourceNoteCount}`
    );
  }

  console.log(`source notes checked: ${datasetAudit.sourceNoteCount}`);
  console.log(`research notes with Catalog provenance: ${datasetAudit.provenanceCount}`);
  console.log(`compiler-source-notes provenance column: ${csvAudit.hasProvenanceColumn ? "yes" : "no"}`);

  if (failures.length) {
    console.error("\nSource-note audit failed:");
    for (const failure of failures.slice(0, 40)) console.error(`- ${failure}`);
    if (failures.length > 40) console.error(`- ...and ${failures.length - 40} more`);
    process.exit(1);
  }

  console.log("FRUS-style source-note provenance audit passed.");
}

main();
