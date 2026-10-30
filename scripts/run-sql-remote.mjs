import fs from "fs";
import { execSync } from "child_process";

const file = process.argv[2];
if (!file) { console.error("Usage: node scripts/run-sql-remote.mjs <file.sql>"); process.exit(1); }
const raw = fs.readFileSync(file, "utf8");
// Split on semicolons at end of statements; keep it simple
const stmts = raw
  .split(/;\s*\n/)
  .map((s) => s.replace(/--[^\n]*/g, "").trim())
  .filter((s) => s.length > 5);

let ok = 0, fail = 0;
for (const stmt of stmts) {
  const sql = stmt.endsWith(";") ? stmt : stmt + ";";
  try {
    execSync(`npx wrangler d1 execute banana-nut-burgers-db --remote --command=${JSON.stringify(sql)}`, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    ok++;
    console.log("OK", sql.slice(0, 60).replace(/\s+/g, " ") + "…");
  } catch (e) {
    fail++;
    const err = (e.stderr || e.stdout || e.message || "").toString();
    // ignore duplicate column / already exists
    if (/duplicate column|already exists|UNIQUE constraint/i.test(err)) {
      console.log("SKIP", sql.slice(0, 50).replace(/\s+/g, " "), "→", err.match(/SQLITE[^\n]+|[A-Za-z ]+error[^\n]*/i)?.[0] || "exists");
      ok++; fail--;
    } else {
      console.error("FAIL", sql.slice(0, 80), "\n", err.slice(-300));
    }
  }
}
console.log(`Done: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
