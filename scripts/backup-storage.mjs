// Télécharge tous les fichiers des buckets Storage (sous-dossiers compris) dans <dossier>/<bucket>/.
// Usage : node --env-file=.env.local scripts/backup-storage.mjs <dossier>
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BUCKETS = ["documents", "email-assets"];
const PAGE_SIZE = 100;

const dest = process.argv[2];
if (!dest) {
  console.error("Usage : node --env-file=.env.local scripts/backup-storage.mjs <dossier>");
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function backupFolder(bucket, prefix) {
  let count = 0;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data: entries, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;

    for (const entry of entries) {
      const key = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (!entry.id) {
        count += await backupFolder(bucket, key); // dossier : on descend
        continue;
      }
      const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(key);
      if (downloadError) throw downloadError;
      const file = path.join(dest, bucket, key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, Buffer.from(await blob.arrayBuffer()));
      count++;
    }
    if (entries.length < PAGE_SIZE) break;
  }
  return count;
}

for (const bucket of BUCKETS) {
  await mkdir(path.join(dest, bucket), { recursive: true });
  const count = await backupFolder(bucket, "");
  console.log(`${count} fichier(s) téléchargé(s) depuis le bucket "${bucket}"`);
}
