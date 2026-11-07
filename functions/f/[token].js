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
<script>try{if(/[?&]embed=/.test(location.search))document.documentElement.classList.add("embed")}catch(e){}</script>
<link rel="icon" href="/img/bnb-logo.png" type="image/png">
<style>
:root{
  --bg:#fff8e6;--surface:#ffffff;--text:#0a2533;--muted:#3d5160;--border:#8a7348;
  --primary:#075a78;--primary-text:#ffffff;--danger:#9b1c1c;--paper:#ffffff;--paper-text:#0a2533;
  --filled:#08315c;--disabled:#d5dee4;--disabled-text:#0a2533;
}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch}
body{background:var(--bg);color:var(--text);font:17px/1.5 system-ui,sans-serif;padding:16px 16px calc(96px + env(safe-area-inset-bottom,0px))}
h1{font-size:28px;line-height:1.2;margin:8px 0 12px;color:var(--text)}
h2{font-size:22px;margin:0 0 8px;color:var(--text)}
h3{font-size:20px;line-height:1.3;margin:18px 0 8px;color:var(--text)}
.wrap{max-width:720px;margin:0 auto}
html.embed,html.embed body{min-height:0;height:auto;overflow:hidden}
html.embed body{padding:12px 12px 20px;background:var(--bg)}
html.embed .brand,html.embed #langBtn{display:none}
html.embed .bar{margin:0 0 4px;min-height:0}
html.embed h1{font-size:26px;margin:0 0 12px}
.bar{display:flex;justify-content:space-between;align-items:center;gap:8px}
.brand{display:inline-flex;align-items:center;gap:10px;color:var(--text);font-weight:800;text-decoration:none}.brand:hover{opacity:.9}.brand img{width:64px;height:64px;border-radius:50%;object-fit:cover;display:block}
.card{background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:16px;padding:16px;margin-top:12px}
.card p,.card li,.card label,.card h2,.card h3,.card span{color:var(--text)}
.mut{color:var(--muted);font-size:16px;line-height:1.45}
.card .mut,.docpos{color:var(--muted)}
label{display:block;font-weight:700;margin-top:16px;font-size:17px;line-height:1.4}
input,select,textarea{width:100%;font:inherit;padding:14px 16px;border-radius:12px;border:1px solid var(--border);background:var(--paper);color:var(--paper-text);min-height:52px}
.bad,.bad input{outline:3px solid var(--danger)}
.yesno{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px}
.yesno label{margin:0;display:flex;gap:8px;align-items:center;justify-content:center;padding:14px 16px;min-height:56px;font-size:18px;border:2px solid var(--border);border-radius:14px;background:var(--surface);color:var(--text);cursor:pointer}
.yesno label.picked,.yesno label:has(input:checked){border-color:var(--primary);background:color-mix(in srgb,var(--primary) 18%,var(--surface));font-weight:800}
.yesno input{accent-color:var(--primary);width:18px;height:18px;min-height:18px}
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
.doc,.paper{max-height:min(78vh,920px);overflow:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;overscroll-behavior:contain;border:1px solid var(--border);border-radius:12px;padding:16px;background:#fff!important;color:#0a2533!important;white-space:pre-wrap;cursor:zoom-in;font-size:16px;line-height:1.5}
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
.stepper{display:flex;flex-direction:column;flex-wrap:nowrap;gap:10px;margin:12px 0;overflow:visible}
.stepitem{border:1.5px solid var(--border);border-radius:18px;background:var(--surface);overflow:hidden}
.stepitem .stepbtn{width:100%;display:flex;flex-direction:row;align-items:center;justify-content:space-between;gap:12px;background:transparent;color:inherit;border:0;border-radius:0;text-align:left;padding:14px 16px;min-height:60px;box-shadow:none}
.stepbtn .nm{font-weight:800;font-size:18px;line-height:1.25;flex:1;min-width:0}
.stepbtn .ss{color:var(--muted);font-size:13px;font-weight:800;margin-left:auto;flex:none;text-transform:uppercase;letter-spacing:.4px}
.stepitem.open{border:2px solid var(--primary);background:var(--surface);box-shadow:0 10px 28px rgba(7,90,120,.14)}
.stepitem.open .stepbtn{min-height:76px;padding:18px 18px 10px;align-items:flex-start}
.stepitem.open .nm{font-size:26px;line-height:1.15}
.stepitem.open .ss{font-size:14px;padding-top:6px}
.steppanel{padding:4px 18px 20px}
.steppanel .card{background:transparent;border:0;box-shadow:none;padding:0;margin:0}
.steppanel h2#stepHeading{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.steppanel label{font-size:18px;line-height:1.4}
.steppanel .mut,.steppanel .note,.steppanel .docpos{font-size:16px;line-height:1.45}
.steppanel input,.steppanel select,.steppanel textarea{font-size:18px;min-height:56px}
.steppanel .yesno label{min-height:60px;font-size:18px}
.steppanel .actions button,.steppanel .doclist button,.steppanel .doc-enlarge{min-height:56px;font-size:18px}
.stepbtn.attention,.stepitem.attention{box-shadow:inset 8px 0 0 var(--danger)}
.stepitem.locked{background:var(--disabled);color:var(--disabled-text)}
.stepitem.locked .ss{color:var(--disabled-text)}
.stepitem.complete .ss{color:#0d6b3d}
html.embed .actions.sticky{position:static;left:auto;right:auto;bottom:auto;margin-top:16px;padding:0;background:transparent;border:0;backdrop-filter:none;max-width:none}
.doclist{list-style:none;padding:0;margin:8px 0}
.doclist button{width:100%;background:var(--surface);color:var(--text);border:1px solid var(--border);margin-top:6px;text-align:left}
.actions{display:flex;gap:8px;margin-top:16px}
.actions button{flex:1}
.actions.sticky{position:fixed;left:0;right:0;bottom:0;z-index:40;margin:0 auto;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(10px);border-top:1px solid var(--border);max-width:1040px}
button:disabled{opacity:1;background:var(--disabled);color:var(--disabled-text);cursor:not-allowed}
#retry,#missing{background:var(--surface);color:var(--text);border:1px solid var(--danger);border-radius:12px;padding:12px;margin-top:12px}
#missing .miss{display:block;width:100%;margin-top:8px;background:var(--surface);color:var(--text);border:1px solid var(--border);text-align:left}
#pad,#gpad,canvas.sigpad{width:100%;height:200px;border:2px solid var(--primary);border-radius:12px;background:#fff;touch-action:none}
@media(min-width:900px){
  body{font-size:18px}
  h1{font-size:36px}
  .wrap{max-width:1040px}
  html.embed h1{font-size:32px}
  .stepitem .stepbtn{min-height:68px;padding:16px 20px}
  .stepbtn .nm{font-size:20px}
  .stepitem.open .stepbtn{min-height:92px;padding:22px 24px 12px}
  .stepitem.open .nm{font-size:34px}
  .stepitem.open .ss{font-size:15px}
  .steppanel{padding:6px 28px 28px}
  .steppanel label{font-size:20px}
  .steppanel .mut,.steppanel .note,.steppanel .docpos{font-size:18px}
  .steppanel input,.steppanel select,.steppanel textarea{font-size:18px;min-height:60px}
  .steppanel .yesno label{min-height:68px;font-size:20px}
  .doc,.paper{max-height:min(82vh,1100px);font-size:17px}
  #pad,#gpad,canvas.sigpad{height:240px}
  .actions.sticky{max-width:1040px}
}
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
  <div id="retry" class="hide" role="status"></div>
  <div id="missing" class="hide" role="status"></div>
  <div id="err" class="err" aria-live="polite"></div>
  <nav class="stepper" id="stepper" aria-label="Progress"></nav>
  <div id="app"></div>
</div>
<script>${script}</script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
