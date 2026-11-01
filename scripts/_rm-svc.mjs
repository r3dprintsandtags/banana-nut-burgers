import fs from "fs";
const p = "index.html";
let s = fs.readFileSync(p, "utf8");
const before = s.length;
s = s.replace(
  ',["beach","Beach & bar","Cold drinks and sunsets after the water."],["falls","Hike & explore","Waterfalls and jungle."]','');
s = s.replace(
  ',["beach","Playa y bar","Bebidas frías y atardeceres después del agua."],["falls","Caminata y aventura","Cascadas y selva."]','');
s = s.replace('beach:"img/shop-beach.jpg",falls:"img/deep-blue.jpg",', "");
s = s.replace('beach:"img/shop-beach.jpg",falls:"img/deep-blue.jpg"', "");
if (s.length === before) {
  console.error("No replacements made");
  process.exit(1);
}
fs.writeFileSync(p, s);
console.log("removed", before - s.length, "chars");
