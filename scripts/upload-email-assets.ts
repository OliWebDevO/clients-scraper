import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = "email-assets";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const files = [
  "icon-showcase.png",
  "icon-results.png",
  "icon-tailored.png",
  "icon-management.png",
  "icon-partnership.png",
  "icon-platform.png",
];

async function upload() {
  for (const file of files) {
    const filePath = path.join("public", "email", file);
    const buffer = fs.readFileSync(filePath);

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(file, buffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (error) {
      console.error(`Failed: ${file}`, error.message);
    } else {
      const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${file}`;
      console.log(`Uploaded: ${url}`);
    }
  }
}

upload();
