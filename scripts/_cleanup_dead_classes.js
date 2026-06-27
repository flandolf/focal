#!/usr/bin/env node
// One-shot cleanup: removes dead glamour class tokens from focal TSX files.
// Idempotent — re-runs are no-ops if no tokens remain.
// Run: node scripts/_cleanup_dead_classes.js <files...>

const fs = require("fs");

const DEAD_CLASSES = [
  "glass-panel",
  "glass-dialog",
  "glass-sidebar",
  "app-aurora",
  "focal-shell",
  "hairline-grid",
  "workbench-section",
  "kpi-breath-glow",
  "card-glow",
  "btn-glow-primary",
  "active-glow",
];

// Word-boundary alternative: match a token surrounded by whitespace, quote,
// bracket, paren, curly, or comma. Lets comments and unrelated strings keep
// the bare word (e.g. backtick-wrapped doc strings stay intact).
const alternation = DEAD_CLASSES.map((c) =>
  c.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"),
).join("|");
const PATTERN = new RegExp(
  `(?<=[\\s"\\[({,])(?:${alternation})(?=[\\s"\\])}])`,
  "g",
);

function clean(content) {
  // Repeat until stable to handle adjacent dead tokens that collapse.
  let prev = null;
  while (prev !== content) {
    prev = content;
    content = content.replace(PATTERN, "");
  }
  // Collapse any double spaces inside className strings.
  content = content.replace(/className=" +/g, 'className="');
  content = content.replace(/ {2,}/g, " ");
  content = content.replace(/ +"/g, '"');
  return content;
}

const files = process.argv.slice(2);
let total = 0;
for (const file of files) {
  if (!fs.existsSync(file)) {
    console.error(`No file: ${file}`);
    continue;
  }
  const src = fs.readFileSync(file, "utf8");
  const out = clean(src);
  if (out !== src) {
    fs.writeFileSync(file, out, "utf8");
    console.log(`Cleaned: ${file}`);
    total++;
  }
}
console.log(`Total files changed: ${total}`);
