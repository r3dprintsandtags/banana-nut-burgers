import fs from "fs";
const s = fs.readFileSync("register.html", "utf8");
const hits = s.match(/Step \d of 6[^"]{0,80}/g) || [];
console.log(hits.join("\n"));
const es = s.match(/Paso \d de 6[^"]{0,80}/g) || [];
console.log("---");
console.log(es.join("\n"));
