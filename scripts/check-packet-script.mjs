import { onRequestGet } from "../functions/f/[token].js";
import fs from "fs";

const html = await (await onRequestGet({ params: { token: "demo" } })).text();
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const script = blocks.sort((a, b) => b.length - a.length)[0] || "";
if (!script) {
  console.error("missing script");
  process.exit(1);
}
try {
  new Function(script);
  console.log("script ok", script.length);
} catch (e) {
  console.error(String(e));
  fs.writeFileSync("scripts/_packet-script.js", script);
  process.exit(1);
}
if (/<\/script/i.test(script)) {
  console.error("script contains a closing script tag");
  process.exit(1);
}
