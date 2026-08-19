import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, "..", "data", "kyoiku-kanji.csv");
const outPath = path.join(__dirname, "..", "migrations", "0002_seed.sql");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

const csvText = readFileSync(csvPath, "utf-8");
const rows = parseCsv(csvText);
const header = rows[0];
const dataRows = rows.slice(1);

const colIndex = Object.fromEntries(header.map((h, i) => [h, i]));

const BATCH_SIZE = 100;

const rowTuples = dataRows.map((r) => {
  const kanji = r[colIndex.kanji];
  const strokeCount = Number(r[colIndex.kstroke]);
  const meaning = r[colIndex.kmeaning];
  const grade = Number(r[colIndex.kgrade]);
  const kunyomiJa = r[colIndex.kunyomi_ja] || null;
  const kunyomi = r[colIndex.kunyomi] || null;
  const onyomiJa = r[colIndex.onyomi_ja] || null;
  const onyomi = r[colIndex.onyomi] || null;
  const examplesRaw = r[colIndex.examples] || "[]";

  // Validate the examples field is well-formed JSON before embedding it.
  JSON.parse(examplesRaw);

  const values = [
    sqlString(kanji),
    strokeCount,
    sqlString(meaning),
    grade,
    sqlString(kunyomiJa),
    sqlString(kunyomi),
    sqlString(onyomiJa),
    sqlString(onyomi),
    sqlString(examplesRaw),
  ].join(", ");

  return `(${values})`;
});

const lines = [];
lines.push("DELETE FROM kanji;");

for (let i = 0; i < rowTuples.length; i += BATCH_SIZE) {
  const batch = rowTuples.slice(i, i + BATCH_SIZE);
  lines.push(
    `INSERT INTO kanji (kanji, stroke_count, meaning, grade, kunyomi_ja, kunyomi, onyomi_ja, onyomi, examples) VALUES\n${batch.join(",\n")};`,
  );
}

writeFileSync(outPath, lines.join("\n") + "\n");
console.log(
  `Wrote ${dataRows.length} rows to ${outPath} in ${Math.ceil(rowTuples.length / BATCH_SIZE)} statements`,
);
