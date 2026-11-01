import { onRequestGet } from "../functions/f/[token].js";
import fs from "fs";

const html = await (await onRequestGet({ params: { token: "demo" } })).text();
const start = html.indexOf("<script>");
const end = html.lastIndexOf("</script>");
if (start < 0 || end < 0) {
  console.error("missing script");
  process.exit(1);
}
const script = html.slice(start + 8, end);
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
