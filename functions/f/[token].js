// GET /f/:token — mobile form packet UI (token-gated)
import { renderDocumentHtml } from "../_lib/forms/document.js";
import { packetClientScript } from "../_lib/forms/packet-client.js";
import {
  ageYears, fieldVisible, isAckSection, legalBundle, buildFlow, stepLabel, stepProblems,
  earlierBlock, missingItems, resumeTarget, firstOpenDocument, hashFor, parseHash, documentCanAgree,
  recordSignature, applyReuseSignature, submitFailureView,
} from "../_lib/forms/wizard.js";

const wizardSource = [
  ageYears, fieldVisible, isAckSection, legalBundle, buildFlow, stepLabel, stepProblems,
  earlierBlock, missingItems, resumeTarget, firstOpenDocument, hashFor, parseHash, documentCanAgree,
  recordSignature, applyReuseSignature, submitFailureView,
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
:root{
  --bg:#fff8e6;--surface:#ffffff;--text:#0a2533;--muted:#3d5160;--border:#8a7348;
  --primary:#075a78;--primary-text:#ffffff;--danger:#9b1c1c;--paper:#ffffff;--paper-text:#0a2533;
  --filled:#08315c;--disabled:#d5dee4;--disabled-text:#0a2533;
}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch}
body{background:var(--bg);color:var(--text);font:16px/1.5 system-ui,sans-serif;padding:16px 16px calc(96px + env(safe-area-inset-bottom,0px))}
h1{font-size:22px;margin:8px 0;color:var(--text)}
h2{font-size:18px;margin:0 0 8px;color:var(--text)}
.wrap{max-width:640px;margin:0 auto}
.bar{display:flex;justify-content:space-between;align-items:center;gap:8px}
.brand{display:inline-flex;align-items:center;gap:10px;color:var(--text);font-weight:800;text-decoration:none}.brand:hover{opacity:.9}.brand img{width:64px;height:64px;border-radius:50%;object-fit:cover;display:block}
.card{background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:16px;padding:16px;margin-top:12px}
.card p,.card li,.card label,.card h2,.card h3,.card span{color:var(--text)}
.mut{color:var(--muted);font-size:14px}
.card .mut,.docpos{color:var(--muted)}
label{display:block;font-weight:700;margin-top:14px;font-size:16px;line-height:1.35}
input,select,textarea{width:100%;font:17px/1.4 system-ui,sans-serif;padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--paper);color:var(--paper-text);min-height:52px}
.bad,.bad input{outline:3px solid var(--danger)}
.yesno{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}
.yesno label{margin:0;display:flex;gap:8px;align-items:center;justify-content:center;padding:14px 12px;min-height:56px;border:2px solid var(--border);border-radius:14px;background:var(--surface);color:var(--text);cursor:pointer;font-size:18px}
.yesno label.picked,.yesno label:has(input:checked){border-color:var(--primary);background:color-mix(in srgb,var(--primary) 18%,var(--surface));font-weight:800}
.yesno input{accent-color:var(--primary);width:22px;height:22px;min-height:22px}
.qcard{margin:16px 0;padding:16px;border:1px solid var(--border);border-radius:18px;background:var(--surface)}
.qcard > label{font-size:18px;line-height:1.45;font-weight:650;margin:0 0 12px}
.qcard .yesno{margin-top:0}
.qcard .chk{font-size:17px;line-height:1.45;margin-top:0}
.note{font-size:16px;line-height:1.5}
.who{border:1px solid var(--border);border-radius:18px;padding:16px;background:#f3fafc;margin:0 0 14px}
.who-name{font-size:24px;font-weight:800;margin:0;line-height:1.2;color:var(--text)}
.who-meta{font-size:17px;font-weight:700;margin:6px 0 0;line-height:1.35;color:var(--text)}
.sigcard{margin-top:16px;padding:16px;border:2px solid var(--primary);border-radius:18px;background:var(--surface)}
.sigcard h3{margin:0 0 4px;font-size:20px}
.sigpreview{display:block;width:100%;height:120px;object-fit:contain;background:#fff;border:1px dashed var(--border);border-radius:12px;margin:10px 0}
.docpills{display:flex;gap:8px;overflow-x:auto;padding:2px 0 10px;margin:0;list-style:none}
.docpills button{flex:none;width:auto;margin:0;min-height:44px;padding:8px 14px;font-size:14px;border-radius:999px}
button{font:inherit;cursor:pointer;border:1px solid transparent;border-radius:14px;padding:12px 16px;background:var(--primary);color:var(--primary-text);font-weight:700;min-height:48px}
.ghost{background:var(--surface);color:var(--text);border:1px solid var(--border)}
.ban{background:var(--primary);color:var(--primary-text)}
.err{color:var(--danger);font-weight:700}
.ok{color:#0d6b3d;font-weight:700}
.hide{display:none}
.notice{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px;margin-top:12px;color:var(--text)}
.note{margin-top:10px;font-size:14px;color:var(--muted)}
.boxhead{margin-top:16px;font-weight:800;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:8px 10px;color:var(--text)}
.chk{display:flex;gap:10px;align-items:flex-start;margin-top:12px;font-weight:700;color:var(--text)}
.chk input{width:22px;height:22px;min-height:22px;flex:none}
.doc,.paper{overflow:visible;border:1px solid var(--border);border-radius:12px;padding:8px;background:#fff!important;color:#0a2533!important;white-space:pre-wrap;cursor:zoom-in}
.docpos{font-size:18px;font-weight:800;color:var(--text)!important;margin:4px 0 8px}
.doc canvas,.paper canvas{width:100%!important;height:auto!important;border:0!important;border-radius:0!important;touch-action:pan-y!important;pointer-events:none}
.paper .filled{color:#08315c!important;font-weight:800;border-bottom:1px solid #08315c}
.paper .cap,.paper .blank{color:#3d5160!important}
.doc-enlarge{width:100%;margin:8px 0 0;background:var(--surface);color:var(--text);border:1px solid var(--border)}
#docLightbox{position:fixed;inset:0;z-index:10000;display:none;flex-direction:column;background:rgba(6,22,31,.94);padding:env(safe-area-inset-top,12px) 12px env(safe-area-inset-bottom,12px)}
#docLightbox.open{display:flex}
#docLightbox .lbbar{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;flex:none}
#docLightbox .lbbar b{color:#f5fbff}
#docLightbox .lbscroll{flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;overscroll-behavior:contain;background:#fff;border-radius:12px;padding:12px;-webkit-user-select:none;user-select:none}
#docLightbox .lbscroll img,#docLightbox .lbscroll canvas{width:100%;height:auto;display:block;margin:0 0 8px}
.sigblock{margin-top:12px;padding-top:8px;border-top:1px solid #c5b89a}
.stepper{display:flex;flex-direction:column;flex-wrap:nowrap;gap:8px;margin:12px 0;overflow:visible}
.stepbtn{width:100%;display:flex;flex-direction:row;align-items:center;justify-content:space-between;gap:10px;background:var(--surface);color:var(--text);border:1px solid var(--border);text-align:left;padding:10px 12px}
.stepbtn .nm{font-weight:700}
.stepbtn .ss{color:var(--muted);font-size:12px;font-weight:800;margin-left:auto;text-transform:uppercase;letter-spacing:.4px}
.stepbtn[aria-current="step"]{outline:3px solid var(--primary)}
.stepbtn.attention{box-shadow:inset 8px 0 0 var(--danger)}
.stepbtn.locked{background:var(--disabled);color:var(--disabled-text)}
.stepbtn.complete .ss{color:#0d6b3d}
.doclist{list-style:none;padding:0;margin:8px 0}
.doclist button{width:100%;background:var(--surface);color:var(--text);border:1px solid var(--border);margin-top:6px;text-align:left}
.actions{display:flex;gap:8px;margin-top:16px}
.actions button{flex:1}
.actions.sticky{position:fixed;left:0;right:0;bottom:0;z-index:40;margin:0;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(10px);border-top:1px solid var(--border);max-width:640px;margin-left:auto;margin-right:auto}
button:disabled{opacity:1;background:var(--disabled);color:var(--disabled-text);cursor:not-allowed}
#retry,#missing{background:var(--surface);color:var(--text);border:1px solid var(--danger);border-radius:12px;padding:12px;margin-top:12px}
#missing .miss{display:block;width:100%;margin-top:8px;background:var(--surface);color:var(--text);border:1px solid var(--border);text-align:left}
#pad,#gpad,canvas.sigpad{width:100%;height:180px;border:2px solid var(--primary);border-radius:14px;background:#fff;touch-action:none}
body.embed{padding:8px 8px 24px;background:transparent}
body.embed .brand,body.embed #title{display:none}
body.embed .actions.sticky{position:static;margin-top:16px;padding:0;border:0;background:transparent;backdrop-filter:none;max-width:none}
</style>
</head>
<body>
<div class="wrap">
  <div class="bar">
    <a class="brand" href="/" aria-label="Banana Nut Burgers home"><img src="/img/bnb-logo.png" width="64" height="64" alt="Banana Nut Burgers Dive Shop"><span>Banana Nut Burgers</span></a>
    <span id="saved" class="mut"></span>
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
