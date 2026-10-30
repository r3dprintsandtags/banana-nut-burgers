import fs from "fs";

const toml = fs.readFileSync(process.env.APPDATA + "/xdg.config/.wrangler/config/default.toml", "utf8");
const token = toml.match(/oauth_token = "([^"]+)"/)[1];
const url = "https://api.cloudflare.com/client/v4/accounts/c873266eecf83e99e0b4f749e098356c/d1/database/c9aae575-c976-47f7-90b1-f52077b0cec1/query";

for (const file of process.argv.slice(2)) {
  const sql = fs.readFileSync(file, "utf8").replace(/^--[^\n]*\n/, "").trim();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
  });
  const data = await res.json();
  console.log(file, data.success, data.errors, data.result && data.result[0] && data.result[0].meta && data.result[0].meta.changes);
  if (!data.success) process.exit(1);
}
