import fs from "fs";
import path from "path";

const srcDir = "C:/Users/adria/.cursor/projects/c-Users-adria-Downloads-projects-Banana-nut-burger/assets";
const destDir = path.resolve("img");
fs.mkdirSync(destDir, { recursive: true });

const map = {
  "5505ecb3": "shop-front.jpg",
  "e28df50a": "shop-flag.jpg",
  "d0fc0440": "shop-beach.jpg",
  "904c039b": "dive-boat.png",
  "8718c58c": "backroll.jpg",
  "a0adfa86": "reef-swim.jpg",
  "fb96029c": "deep-blue.jpg",
};

for (const f of fs.readdirSync(srcDir)) {
  for (const [id, name] of Object.entries(map)) {
    if (f.includes(id)) {
      fs.copyFileSync(path.join(srcDir, f), path.join(destDir, name));
      console.log("copied", name);
    }
  }
}

// Inspect IMG keys in index.html
const html = fs.readFileSync("index.html", "utf8");
const imgMatch = html.match(/const IMG=\{([\s\S]*?)\};/);
if (imgMatch) {
  const keys = [...imgMatch[1].matchAll(/(\w+):/g)].map((m) => m[1]);
  console.log("IMG keys:", keys.join(", "));
}
console.log("hero has data uri:", /url\(data:image/.test(html));
console.log("file size MB:", (html.length / 1e6).toFixed(2));
