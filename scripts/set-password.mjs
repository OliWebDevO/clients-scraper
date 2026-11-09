// Create or reset an app login.
// Usage (from the project folder):  node --env-file=.env.local scripts/set-password.mjs you@example.com
// The password is asked interactively and never shown.
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const email = process.argv[2]?.toLowerCase().trim();
if (!email) {
  console.error("Usage: node --env-file=.env.local scripts/set-password.mjs <email>");
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    stdin.on("data", function onData(char) {
      if (char === "\r" || char === "\n") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(value);
      } else if (char === "\u0003") {
        process.exit(1);
      } else if (char === "\u007f") {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    });
  });
}

const password = await askHidden("New password: ");
if (password.length < 10) {
  console.error("Use at least 10 characters.");
  process.exit(1);
}
if ((await askHidden("Repeat password: ")) !== password) {
  console.error("Passwords don't match.");
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { error } = await supabase
  .from("app_users")
  .upsert({ email, password_hash: await bcrypt.hash(password, 12) }, { onConflict: "email" });

if (error) {
  console.error("Failed:", error.message);
  process.exit(1);
}
console.log(`✓ Password set for ${email}`);
