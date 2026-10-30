import http from "http";
import fs from "fs";
import { onRequestGet } from "../functions/f/[token].js";

const legal = "SSI sample sentence. I, (print name of participant), understand this activity.\n".repeat(40);

const payload = {
  packet: { key: "try_scuba", name: "Try Scuba packet" },
  shopName: "Banana Nut Burgers Dive Shop",
  turnstileSiteKey: "",
  templates: [
    { key: "try_scuba_reg", name: "Try Scuba Registration", legal, schema: { sections: [] } },
    {
      key: "fit_to_dive",
      name: "Fit to Dive",
      legal,
      schema: { sections: [{ id: "fit", title: { en: "Fit to Dive", es: "Apto para bucear" }, fields: [{ key: "fit_q1", type: "yes_no", required: true, label: { en: "Are you currently suffering from a cold?", es: "¿Tienes un resfriado ahora?" } }] }] },
    },
  ],
  answers: { first_name: "Maria", last_name: "Lopez", dob: "1990-04-02" },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname.startsWith("/api/forms/public/")) {
    if (req.method === "GET") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(payload));
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    res.setHeader("content-type", "application/json");
    if (body.action === "submit") {
      res.end(JSON.stringify({ registrationNumber: "BNB-2610-0099", files: [{ key: "fit_to_dive" }], needsPhysician: false }));
      return;
    }
    res.end(JSON.stringify({ ok: true, saved: true, note: "Copy this secure link.", link: "http://127.0.0.1:8787/f/demo" }));
    return;
  }
  if (url.pathname.startsWith("/f/")) {
    const token = url.pathname.split("/")[2] || "demo";
    const out = await onRequestGet({ params: { token } });
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(await out.text());
    return;
  }
  if (url.pathname === "/register" || url.pathname === "/register.html") {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(fs.readFileSync("register.html"));
    return;
  }
  res.statusCode = 404;
  res.end("not found");
});

server.listen(8787, "127.0.0.1", () => console.log("preview http://127.0.0.1:8787/f/demo"));
