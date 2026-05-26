#!/usr/bin/env node

const fs = require("fs");
const { walkSourceNotes } = require("./source-note-style");

const DATASETS = [
  ["data/records.json", "data/records.js", "GCT_RECORDS"],
  ["data/nara-scout-leads.json", "data/nara-scout-leads.js", "NARA_SCOUT_LEADS"],
  ["data/blackwill-files.json", "data/blackwill-files.js", "BLACKWILL_FILES"],
  ["data/central-chronology-files.json", "data/central-chronology-files.js", "CENTRAL_CHRONOLOGY_FILES"],
  ["data/blackwill-chron-files.json", "data/blackwill-chron-files.js", "BLACKWILL_CHRON_FILES"],
  ["data/gates-chron-files.json", "data/gates-chron-files.js", "GATES_CHRON_FILES"],
  ["data/requested-source-series.json", "data/requested-source-series.js", "REQUESTED_SOURCE_SERIES"]
];

const REPORTS = [
  "reports/nara-scout-eastmed-search.json",
  "reports/central-chronology-374000108-eastmed.json",
  "reports/blackwill-chronology-2554659-eastmed.json",
  "reports/gates-chronology-2554841-eastmed.json",
  "reports/requested-source-series-eastmed.json",
  "reports/daily-diary-references-186322-eastmed.json"
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeJs(file, variableName, value) {
  fs.writeFileSync(file, `window.${variableName} = ${JSON.stringify(value, null, 2)};\n`);
}

for (const [jsonFile, jsFile, variableName] of DATASETS) {
  const data = walkSourceNotes(readJson(jsonFile));
  writeJson(jsonFile, data);
  writeJs(jsFile, variableName, data);
  console.error(`normalized ${jsonFile}`);
}

for (const report of REPORTS) {
  if (!fs.existsSync(report)) continue;
  const data = walkSourceNotes(readJson(report));
  writeJson(report, data);
  console.error(`normalized ${report}`);
}
