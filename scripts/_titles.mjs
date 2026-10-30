import fs from "fs";
const s = fs.readFileSync("register.html", "utf8");
for (const key of ["fH2", "fSub", "trForms", "trWaivers", "trSafety", "dH", "dSub", "packetPending", "packetWait"]) {
  const m = s.match(new RegExp(key + ':"([^"]*)"'));
  console.log(key, m && m[1]);
}
