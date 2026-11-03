// GET /f/:token — mobile form packet UI (token-gated)
import { renderDocumentHtml } from "../_lib/forms/document.js";
import { packetClientScript } from "../_lib/forms/packet-client.js";
import {
  ageYears, fieldVisible, isAckSection, legalBundle, buildFlow, stepLabel, stepProblems,
  earlierBlock, missingItems, resumeTarget, firstOpenDocument, hashFor, parseHash, documentCanAgree,
  recordSignature, submitFailureView,
} from "../_lib/forms/wizard.js";

const wizardSource = [
  ageYears, fieldVisible, isAckSection, legalBundle, buildFlow, stepLabel, stepProblems,
  earlierBlock, missingItems, resumeTarget, firstOpenDocument, hashFor, parseHash, documentCanAgree,
  recordSignature, submitFailureView,
].map((fn) => fn.toString()).join("\n");

export async function onRequestGet({ params }) {
  const token = params.token || "";
  const script = packetClientScript({
    token,
    renderSource: renderDocumentHtml.toString(),
    wizardSource,
  });
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Forms · Banana Nut Burgers</title>
<link rel="icon" href="/img/bnb-logo.png" type="image/png">
<style>
:root,html[data-theme="light"]{
  --bg:#fff8e6;--surface:#ffffff;--text:#0a2533;--muted:#3d5160;--border:#8a7348;
  --primary:#075a78;--primary-text:#ffffff;--danger:#9b1c1c;--paper:#ffffff;--paper-text:#0a2533;
  --filled:#08315c;--on-photo:#f4fbff;--photo:#06161f;--disabled:#d5dee4;--disabled-text:#0a2533;
}
html[data-theme="dark"]{
  --bg:#06161f;--surface:#123041;--text:#f5fbff;--muted:#d5e4ee;--border:#8eb4c8;
  --primary:#8fd4f0;--primary-text:#06202b;--danger:#ffb4b4;--paper:#ffffff;--paper-text:#0a2533;
  --filled:#08315c;--on-photo:#f4fbff;--photo:#06161f;--disabled:#2c4a5c;--disabled-text:#f5fbff;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,sans-serif;padding:16px 16px 48px}
html[data-theme="dark"] body{background:var(--photo) url(/img/deep-blue.jpg) center/cover fixed no-repeat}
html[data-theme="dark"] body:before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;background:#06161f}
html[data-theme="dark"] .wrap{position:relative;z-index:1}
h1{font-size:22px;margin:8px 0;color:var(--text)}
html[data-theme="dark"] h1,html[data-theme="dark"] .brand{color:var(--on-photo)}
h2{font-size:18px;margin:0 0 8px;color:var(--text)}
.wrap{max-width:640px;margin:0 auto}
.bar{display:flex;justify-content:space-between;align-items:center;gap:8px}
.brand{display:inline-flex;align-items:center;gap:10px;color:var(--text);font-weight:800;text-decoration:none}.brand:hover{opacity:.9}.brand img{width:64px;height:64px;border-radius:50%;object-fit:cover;display:block}
.card{background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:16px;padding:16px;margin-top:12px}
.card p,.card li,.card label,.card h2,.card h3,.card span{color:var(--text)}
.mut{color:var(--muted);font-size:14px}
.card .mut,.docpos{color:var(--muted)}
label{display:block;font-weight:700;margin-top:12px;font-size:14px}
input,select,textarea{width:100%;font:inherit;padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--paper);color:var(--paper-text);min-height:48px}
.bad,.bad input{outline:3px solid var(--danger)}
.yesno{display:flex;gap:10px;margin-top:6px}
.yesno label{margin:0;display:flex;gap:6px;align-items:center;padding:10px 12px;border:1.5px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text);cursor:pointer}
.yesno label.picked,.yesno label:has(input:checked){border-color:var(--primary);background:color-mix(in srgb,var(--primary) 18%,var(--surface));font-weight:800}
.yesno input{accent-color:var(--primary);width:18px;height:18px;min-height:18px}
button{font:inherit;cursor:pointer;border:1px solid transparent;border-radius:14px;padding:12px 16px;background:var(--primary);color:var(--primary-text);font-weight:700;min-height:48px}
.ghost{background:var(--surface);color:var(--text);border:1px solid var(--border)}
.ban{background:var(--primary);color:var(--primary-text)}
.err{color:var(--danger);font-weight:700}
.ok{color:#0d6b3d;font-weight:700}
html[data-theme="dark"] .ok{color:#b6f0cf}
.hide{display:none}
.notice{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px;margin-top:12px;color:var(--text)}
.note{margin-top:10px;font-size:14px;color:var(--muted)}
.boxhead{margin-top:16px;font-weight:800;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:8px 10px;color:var(--text)}
.chk{display:flex;gap:10px;align-items:flex-start;margin-top:12px;font-weight:700;color:var(--text)}
.chk input{width:22px;height:22px;min-height:22px;flex:none}
.doc,.paper{max-height:52vh;overflow:auto;border:1px solid var(--border);border-radius:12px;padding:12px;background:#fff!important;color:#0a2533!important;white-space:pre-wrap}
.paper .filled{color:#08315c!important;font-weight:800;border-bottom:1px solid #08315c}
.paper .cap,.paper .blank{color:#3d5160!important}
.sigblock{margin-top:12px;padding-top:8px;border-top:1px solid #c5b89a}
.stepper{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.stepbtn{flex:1 1 140px;display:flex;flex-direction:column;align-items:flex-start;background:var(--surface);color:var(--text);border:1px solid var(--border);text-align:left}
.stepbtn .ss{color:var(--muted);font-size:12px;font-weight:800}
.stepbtn[aria-current="step"]{outline:3px solid var(--primary)}
.stepbtn.attention{box-shadow:inset 8px 0 0 var(--danger)}
.stepbtn.locked{background:var(--disabled);color:var(--disabled-text)}
.stepbtn.complete .ss{color:#0d6b3d}
html[data-theme="dark"] .stepbtn.complete .ss{color:#b6f0cf}
.doclist{list-style:none;padding:0;margin:8px 0}
.doclist button{width:100%;background:var(--surface);color:var(--text);border:1px solid var(--border);margin-top:6px;text-align:left}
.actions{display:flex;gap:8px;margin-top:16px}
.actions button{flex:1}
button:disabled{opacity:1;background:var(--disabled);color:var(--disabled-text);cursor:not-allowed}
#retry,#missing{background:var(--surface);color:var(--text);border:1px solid var(--danger);border-radius:12px;padding:12px;margin-top:12px}
#missing .miss{display:block;width:100%;margin-top:8px;background:var(--surface);color:var(--text);border:1px solid var(--border);text-align:left}
canvas{width:100%;height:160px;border:2px solid var(--primary);border-radius:12px;background:#fff;touch-action:none}
</style>
</head>
<body>
<div class="wrap">
  <div class="bar">
    <a class="brand" href="/" aria-label="Banana Nut Burgers home"><img src="/img/bnb-logo.png" width="64" height="64" alt="Banana Nut Burgers Dive Shop"><span>Forms</span></a>
    <span id="saved" class="mut"></span>
    <button type="button" class="ghost" id="themeBtn">Dark</button>
    <button type="button" class="ghost" id="langBtn">ES</button>
  </div>
  <h1 id="title">Loading…</h1>
  <nav class="stepper" id="stepper" aria-label="Progress"></nav>
  <div id="retry" class="hide" role="status"></div>
  <div id="missing" class="hide" role="status"></div>
  <div id="err" class="err" aria-live="polite"></div>
  <div id="app"></div>
</div>
<script>${script}</script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
