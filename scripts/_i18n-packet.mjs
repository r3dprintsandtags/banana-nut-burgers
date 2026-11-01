import fs from "fs";
let s = fs.readFileSync("register.html", "utf8");
const extras = {
  en: {
    packetTry: "Try Scuba packet",
    packetRec: "Recreational packet",
    regNumLabel: "Registration #",
    packetFail: "Could not start packet forms",
  },
  es: {
    packetTry: "Paquete Try Scuba",
    packetRec: "Paquete recreativo",
    regNumLabel: "Registro #",
    packetFail: "No se pudieron iniciar los formularios",
  },
};
const tStart = s.indexOf("const T = {");
for (const [lang, map] of Object.entries(extras)) {
  const startTok = `\n  ${lang}:{`;
  const rel = s.indexOf(startTok, tStart);
  if (rel < 0) throw new Error("no " + lang);
  const abs = rel + startTok.length;
  const endTok = lang === "en" ? "},\n  es:{" : "}\n};";
  const end = s.indexOf(endTok, abs);
  let block = s.slice(abs, end);
  for (const [k, v] of Object.entries(map)) {
    const re = new RegExp(`${k}:"(?:\\\\.|[^"\\\\])*"`);
    const lit = `${k}:${JSON.stringify(v)}`;
    if (re.test(block)) block = block.replace(re, lit);
    else block = block.replace("resumeBad:", `${lit},resumeBad:`);
  }
  s = s.slice(0, abs) + block + s.slice(end);
}
fs.writeFileSync("register.html", s);
console.log("packet keys ok");
