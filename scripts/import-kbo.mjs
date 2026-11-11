// Import recently created Belgian businesses from the KBO/BCE Open Data export.
//
// 1. Register (free) and download the monthly "Full" zip:
//    https://economie.fgov.be/fr/themes/entreprises/banque-carrefour-des/services-pour-tous/reutilisation-des-donnees/kbo-open-data
// 2. Unzip it into a folder (enterprise.csv, establishment.csv, activity.csv, address.csv, denomination.csv, contact.csv, code.csv)
// 3. Preview:  node --env-file=.env.local scripts/import-kbo.mjs ~/Downloads/KboOpenData --dry-run
//    Import:   node --env-file=.env.local scripts/import-kbo.mjs ~/Downloads/KboOpenData
//
// Options:
//   --since-days=365           only businesses started in the last N days (default 365)
//   --zip=1000-1210,1300-1499  postcode ranges (default: Brussels + Walloon/Flemish Brabant 1000-1999,3000-3499)
//   --keywords=coiffure,restauration   match on the French NACE description of the main activity
//   --limit=10000              max rows to import
//   --dry-run                  print what would be imported, write nothing
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_KEYWORDS = [
  "restauration", "débits de boissons", "coiffure", "beauté", "bien-être", "esthétique",
  "boulangerie", "pâtisserie", "boucherie", "traiteur", "chocolat",
  "installation électrique", "plomberie", "chauffage", "menuiserie", "peinture", "vitrerie",
  "carrelage", "couverture", "parachèvement", "réparation de véhicules", "fitness",
  "fleurs", "habillement", "chaussures", "kinésithérapie", "photographi", "toilettage",
];

/* ── CLI ── */
const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;
const dryRun = args.includes("--dry-run");
const sinceDays = Number(opt("since-days", "365"));
const limit = Number(opt("limit", "10000"));
const keywords = opt("keywords", DEFAULT_KEYWORDS.join(",")).split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
const zipRanges = opt("zip", "1000-1999,3000-3499").split(",").map((r) => {
  const [a, b] = r.split("-").map(Number);
  return [a, b ?? a];
});

if (!dir || !fs.existsSync(path.join(dir, "enterprise.csv"))) {
  console.error("Usage: node --env-file=.env.local scripts/import-kbo.mjs <folder with enterprise.csv …> [--dry-run]");
  process.exit(1);
}

/* ── CSV streaming (KBO files are comma-separated with quoted fields) ── */
function parseLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function eachRow(file, onRow) {
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) throw new Error(`Missing ${file} in ${dir}`);
  const rl = readline.createInterface({ input: fs.createReadStream(full, "utf8"), crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    if (!line) continue;
    const cells = parseLine(line);
    if (!header) { header = cells.map((h) => h.replace(/^﻿/, "")); continue; }
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    onRow(row);
  }
}

const parseDate = (d) => {
  const m = d.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const zipAllowed = (zip) => zipRanges.some(([a, b]) => Number(zip) >= a && Number(zip) <= b);
const nace = (code) => code.replace(/\./g, "");

/* ── 1. Active enterprises started recently ── */
const sinceIso = new Date(Date.now() - sinceDays * 86400000).toISOString().slice(0, 10);
const enterprises = new Map(); // number → { start, person }
await eachRow("enterprise.csv", (r) => {
  const start = parseDate(r.StartDate);
  // TypeOfEnterprise 1 = natural person (sole trader), 2 = legal person (company)
  if (r.Status === "AC" && start && start >= sinceIso) enterprises.set(r.EnterpriseNumber, { start, person: r.TypeOfEnterprise === "1" });
});
console.log(`• ${enterprises.size} active enterprises started since ${sinceIso}`);

/* ── 2. Their establishment units (where the shop/office physically is) ── */
const estToEnt = new Map();
await eachRow("establishment.csv", (r) => {
  if (enterprises.has(r.EnterpriseNumber)) estToEnt.set(r.EstablishmentNumber, r.EnterpriseNumber);
});
const entOf = (entity) => (enterprises.has(entity) ? entity : estToEnt.get(entity));

/* ── 3. NACE descriptions (French) ── */
const naceLabel = new Map(); // "Nace2008:96021" → "Coiffure"
await eachRow("code.csv", (r) => {
  if (/^Nace/i.test(r.Category) && r.Language === "FR") naceLabel.set(`${r.Category}:${nace(r.Code)}`, r.Description);
});

/* ── 4. Main activity matching the target sectors ── */
const activityOf = new Map(); // enterprise → French label (establishment-level activity preferred)
await eachRow("activity.csv", (r) => {
  const ent = entOf(r.EntityNumber);
  if (!ent || r.Classification !== "MAIN") return;
  const label = naceLabel.get(`Nace${r.NaceVersion}:${nace(r.NaceCode)}`);
  if (!label || !keywords.some((k) => label.toLowerCase().includes(k))) return;
  if (!activityOf.has(ent) || r.EntityNumber !== ent) activityOf.set(ent, label);
});
console.log(`• ${activityOf.size} in the target sectors`);

/* ── 5. Address in the target postcodes ── */
const addressOf = new Map(); // enterprise → "Street 12, 1050 Ixelles" (establishment address preferred)
await eachRow("address.csv", (r) => {
  const ent = entOf(r.EntityNumber);
  if (!ent || !activityOf.has(ent) || r.DateStrikingOff || !zipAllowed(r.Zipcode)) return;
  const street = [r.StreetFR || r.StreetNL, r.HouseNumber].filter(Boolean).join(" ") + (r.Box ? ` bte ${r.Box}` : "");
  const address = `${street}, ${r.Zipcode} ${r.MunicipalityFR || r.MunicipalityNL}`;
  if (!addressOf.has(ent) || r.EntityNumber !== ent) addressOf.set(ent, address);
});
console.log(`• ${addressOf.size} in postcodes ${zipRanges.map(([a, b]) => (a === b ? a : `${a}-${b}`)).join(", ")}`);

/* ── 6. Name: commercial name of the establishment > official name, French > other ── */
const nameOf = new Map(); // enterprise → { name, rank }
const officialOf = new Map(); // enterprise → official name (for a sole trader: their own name)
await eachRow("denomination.csv", (r) => {
  const ent = entOf(r.EntityNumber);
  if (!ent || !addressOf.has(ent) || !r.Denomination) return;
  // TypeOfDenomination: 001 official, 002 abbreviation, 003 commercial. Language: 1 = FR, 2 = NL
  const rank = (r.TypeOfDenomination === "003" ? 0 : r.TypeOfDenomination === "001" ? 2 : 4) + (r.Language === "1" ? 0 : 1);
  const current = nameOf.get(ent);
  if (!current || rank < current.rank) nameOf.set(ent, { name: r.Denomination.trim(), rank });
  if (r.TypeOfDenomination === "001") officialOf.set(ent, r.Denomination.trim());
});

// "Dupont, Marie" and "MARIE DUPONT" are the same person name
const sameName = (a, b) => {
  const words = (x) => x.toLowerCase().replace(/[,.]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
  return !!a && !!b && words(a) === words(b);
};

/* ── 7. Contact details (rarely filled, but free when they are) ── */
const contactOf = new Map();
await eachRow("contact.csv", (r) => {
  const ent = entOf(r.EntityNumber);
  if (!ent || !addressOf.has(ent)) return;
  const c = contactOf.get(ent) || {};
  if (r.ContactType === "TEL" && !c.phone) c.phone = r.Value;
  if (r.ContactType === "EMAIL" && !c.email) c.email = r.Value.toLowerCase();
  if (r.ContactType === "WEB" && !c.web) c.web = /^https?:\/\//i.test(r.Value) ? r.Value : `https://${r.Value}`;
  contactOf.set(ent, c);
});

/* ── Build rows ── */
const rows = [...addressOf.keys()]
  .filter((ent) => nameOf.has(ent) && /\p{L}/u.test(nameOf.get(ent).name)) // registered under its number only: no name to address
  .sort((a, b) => enterprises.get(b).start.localeCompare(enterprises.get(a).start))
  .slice(0, limit)
  .map((ent) => {
    const c = contactOf.get(ent) || {};
    const { name, rank } = nameOf.get(ent);
    // Sole trader registered under their own name (no commercial name): the email must not "congratulate" a person's name
    // (or whose "commercial name" is just their own name)
    const personName = enterprises.get(ent).person && (rank >= 2 || sameName(name, officialOf.get(ent)));
    return {
      name: personName ? name.replace(/^([^,]+),\s*(.+)$/, "$2 $1") : name,
      address: addressOf.get(ent),
      phone: c.phone || null,
      email: c.email || null,
      category: activityOf.get(ent),
      has_website: !!c.web,
      website_url: c.web || null,
      source: personName ? "kbo_person" : "kbo",
      legal_person: !enterprises.get(ent).person, // false = natural person: never emailed automatically
      kbo_number: ent,
      company_start_date: enterprises.get(ent).start,
      location_query: `KBO ${new Date().toISOString().slice(0, 10)}`,
    };
  });

console.log(`• ${rows.length} rows ready${rows.length === limit ? ` (capped by --limit=${limit})` : ""}\n`);

if (dryRun) {
  console.table(rows.slice(0, 20).map((r) => ({ start: r.company_start_date, name: r.name, type: r.source === "kbo_person" ? "nom propre" : "nom commercial", activity: r.category.slice(0, 45), address: r.address, email: r.email ?? "" })));
  const withEmail = rows.filter((r) => r.email).length;
  console.log(`\n${withEmail}/${rows.length} have an email, ${rows.filter((r) => r.website_url).length} a website, ${rows.filter((r) => r.source === "kbo_person").length} are sole traders under their own name.`);
  console.log("\nDry run — nothing written. Remove --dry-run to import.");
  process.exit(0);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let imported = 0;
let skipped = 0;
for (let i = 0; i < rows.length; i += 50) {
  const batch = rows.slice(i, i + 50);
  const { error } = await supabase.from("businesses").upsert(batch, { onConflict: "kbo_number" });
  if (!error) { imported += batch.length; continue; }
  // A row can clash with an existing Google Maps entry (same name + address): retry one by one
  for (const row of batch) {
    const { error: rowError } = await supabase.from("businesses").upsert(row, { onConflict: "kbo_number" });
    if (rowError) skipped++;
    else imported++;
  }
}
console.log(`✓ ${imported} imported${skipped ? `, ${skipped} skipped (already in the list)` : ""}`);
