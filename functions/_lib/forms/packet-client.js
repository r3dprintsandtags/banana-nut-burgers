/** Browser script for /f/:token. Injected as text; wizard helpers are function declarations. */
export function packetClientScript({ token, renderSource, wizardSource }) {
  return `
const TOKEN=${JSON.stringify(token)};
const renderDocumentHtml = ${renderSource};
${wizardSource}
let L=(navigator.language||"en").startsWith("es")?"es":"en";
try{const saved=localStorage.getItem("bnb_lang");if(saved==="en"||saved==="es")L=saved}catch(e){}
try{ localStorage.removeItem("bnb_theme"); }catch(e){}
let payload=null, answers={}, flow=null, stepId="about", docIndex=0, returnTo="", doneOut=null, pendingFocus="", medicalAnchor="", pendingNotice="";
let embedMode="";
try{ embedMode=new URLSearchParams(location.search).get("embed")||""; }catch(e){}
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function applyTheme(){ /* light-only — matches registration / Banana Nut Burgers brand */ }
function lab(f){return typeof f.label==="string"?f.label:(f.label&&(f.label[L]||f.label.en))||f.key}
function syncLangBtn(){ if($("langBtn")) $("langBtn").textContent=L==="en"?"ES":"EN"; document.documentElement.lang=L; }
function sigKey(){ return "bnb_sigs_"+TOKEN; }
function loadSigs(){
  try{
    const extra=JSON.parse(sessionStorage.getItem(sigKey())||"{}");
    answers.__signatures=Object.assign({}, extra, answers.__signatures||{});
  }catch(e){}
}
function saveSigs(){ try{ sessionStorage.setItem(sigKey(), JSON.stringify(answers.__signatures||{})); }catch(e){} }
function postEmbedSize(){
  if(window.parent===window) return;
  const h=Math.ceil(Math.max(document.body.scrollHeight||0, document.documentElement.scrollHeight||0, document.body.offsetHeight||0))+12;
  try{ window.parent.postMessage({type:"bnb_embed_height", h:Math.max(h, 520)}, location.origin); }catch(e){}
}
function fmtDob(iso){
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(iso||""))) return "";
  const parts=String(iso).split("-").map(Number);
  try{ return new Intl.DateTimeFormat(L==="es"?"es":"en",{month:"long",day:"numeric",year:"numeric"}).format(new Date(parts[0], parts[1]-1, parts[2])); }
  catch(e){ return String(iso); }
}
function identityBanner(){
  const box=document.createElement("section");
  box.className="who";
  const name=((answers.first_name||"")+" "+(answers.last_name||"")).trim();
  const h=document.createElement("p");
  h.className="who-name";
  h.textContent=name||(L==="es"?"Este buzo":"This diver");
  box.appendChild(h);
  const dob=fmtDob(answers.dob);
  const phone=String(answers.cell_phone||answers.phone||"").trim();
  const em=String(answers.emergency_contact_name||"").trim();
  const bits=[];
  if(dob) bits.push((L==="es"?"Nacimiento: ":"Date of birth: ")+dob);
  if(phone) bits.push((L==="es"?"Teléfono: ":"Phone: ")+phone);
  if(em) bits.push((L==="es"?"Emergencia: ":"Emergency: ")+em);
  for(const line of bits){
    const meta=document.createElement("p");
    meta.className="who-meta";
    meta.textContent=line;
    box.appendChild(meta);
  }
  const missing=[].concat(stepProblems("about", flow, answers), stepProblems("emergency", flow, answers));
  const note=document.createElement("p");
  note.className="mut";
  if(!missing.length && (dob||phone)) note.textContent=L==="es"?"Estos datos ya están en cada formulario. No hace falta escribirlos otra vez.":"These details are already on every form. You do not need to type them again.";
  else if(missing.length) note.textContent=L==="es"?"Falta un dato de este buzo.":"A detail for this diver is still missing.";
  if(note.textContent) box.appendChild(note);
  if(missing.length){
    const b=document.createElement("button");
    b.type="button"; b.className="ghost";
    b.textContent=L==="es"?"Completar datos":"Fill in missing details";
    b.onclick=()=>{
      const id=missing[0]&&missing[0].id||"";
      go(String(id).indexOf("emergency")===0?"emergency":"about");
    };
    box.appendChild(b);
  }
  return box;
}
function trimmedSignature(canvas){
  try{
    const ctx=canvas.getContext("2d");
    const w=canvas.width, h=canvas.height;
    const img=ctx.getImageData(0,0,w,h).data;
    let minX=w, minY=h, maxX=0, maxY=0, found=false;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const i=(y*w+x)*4;
        if(img[i+3]>16 && (img[i]<248||img[i+1]<248||img[i+2]<248)){
          found=true;
          if(x<minX) minX=x; if(y<minY) minY=y; if(x>maxX) maxX=x; if(y>maxY) maxY=y;
        }
      }
    }
    if(!found) return "";
    const padPx=14;
    minX=Math.max(0,minX-padPx); minY=Math.max(0,minY-padPx);
    maxX=Math.min(w-1,maxX+padPx); maxY=Math.min(h-1,maxY+padPx);
    const c=document.createElement("canvas");
    c.width=Math.max(1,maxX-minX+1); c.height=Math.max(1,maxY-minY+1);
    c.getContext("2d").drawImage(canvas, minX, minY, c.width, c.height, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  }catch(e){ return canvas.toDataURL("image/png"); }
}
function scheduleSave(){
  clearTimeout(scheduleSave._t);
  const seen=answers.__ui&&answers.__ui.medicalSeen===true;
  answers.__ui={ step: stepId, docIndex };
  if(seen) answers.__ui.medicalSeen=true;
  scheduleSave._t=setTimeout(async()=>{
    try{
      const r=await fetch("/api/forms/public/"+TOKEN,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save",answers,step:stepId})});
      if($("saved")) $("saved").textContent=r.ok?(L==="es"?"Guardado":"Saved"):(L==="es"?"No se guardó":"Not saved");
      if(r.ok && window.parent!==window){ try{ window.parent.postMessage({type:"bnb_embed_saved"}, location.origin); }catch(e){} }
      if(!r.ok) showRetry(L==="es"?"No se guardó. Tus datos siguen en esta página.":"Not saved. Your answers are still on this page.");
    }catch(e){
      if($("saved")) $("saved").textContent=L==="es"?"Sin conexión":"Offline";
      showRetry(L==="es"?"Sin conexión. Tus datos siguen en esta página.":"Offline. Your answers are still on this page.");
    }
  },400);
}
function showRetry(message){
  const box=$("retry");
  if(!box) return;
  box.classList.remove("hide");
  box.innerHTML="";
  const p=document.createElement("p");
  p.textContent=message;
  const b=document.createElement("button");
  b.type="button"; b.className="ghost"; b.textContent=L==="es"?"Reintentar":"Retry";
  b.onclick=()=>{ box.classList.add("hide"); scheduleSave(); };
  box.append(p,b);
}
function ensureYouthTemplate(){
  if(!payload) return;
  const age=ageYears(answers&&answers.dob);
  if(age==null || age>=18) return;
  const list=Array.isArray(payload.templates)?payload.templates:[];
  if(list.some((t)=>t&&t.key==="youth_addendum")) return;
  const en="I am the parent or legal guardian of the participant named in this packet. I have read the agreements in this packet. I consent to this minor taking part in the dive activity. The shop will keep the official SSI Youth Addendum with this registration before the dive.";
  const es="Soy el padre, la madre o el tutor legal del participante de este paquete. Leí los acuerdos de este paquete. Autorizo a este menor a participar en la actividad de buceo. La tienda guardará el anexo juvenil oficial de SSI con este registro antes del buceo.";
  payload.templates=list.concat([{ key:"youth_addendum", name:L==="es"?"Consentimiento del tutor":"Guardian consent", version:"shop-1", schema:{ key:"youth_addendum", sections:[] }, legal:en, legalEs:es }]);
}
function rebuild(){
  ensureYouthTemplate();
  flow=buildFlow(payload&&payload.templates||[], answers);
}
function statusOf(id){
  if(id===stepId) return "current";
  if(id==="finish") return doneOut?"complete":"notstarted";
  const block=earlierBlock(id, flow, answers);
  if(block) return "locked";
  const probs=stepProblems(id, flow, answers);
  if(probs.length && (answers.__visited||[]).includes(id)) return "attention";
  if(probs.length) return "notstarted";
  if((answers.__visited||[]).includes(id) || id==="about") return probs.length?"attention":"complete";
  return "notstarted";
}
function statusWord(st){
  const en={current:"In progress",locked:"Locked",attention:"Needs attention",complete:"Complete",notstarted:"Not started"};
  const es={current:"En curso",locked:"Bloqueado",attention:"Revisar",complete:"Listo",notstarted:"Sin empezar"};
  return (L==="es"?es:en)[st]||st;
}
function paintStepper(){
  const nav=$("stepper");
  if(!nav||!flow) return;
  nav.innerHTML="";
  for(const s of flow.steps){
    if(s.id==="finish" && !doneOut) continue;
    if(embedMode && (s.id==="about"||s.id==="emergency"||s.id==="guardian") && !stepProblems(s.id, flow, answers).length) continue;
    const st=statusOf(s.id);
    const b=document.createElement("button");
    b.type="button";
    b.className="stepbtn "+st;
    b.dataset.step=s.id;
    if (s.id === stepId) b.setAttribute("aria-current", "step");
    const nm=document.createElement("span");
    nm.className="nm";
    nm.textContent=stepLabel(s.id, L);
    const ss=document.createElement("span");
    ss.className="ss";
    ss.textContent=statusWord(st);
    b.append(nm, ss);
    b.onclick=()=>onStepClick(s.id);
    nav.appendChild(b);
  }
}
function onStepClick(id){
  if(id===stepId) return;
  const block=earlierBlock(id, flow, answers);
  if(block && id!=="finish"){
    $("err").textContent=(L==="es"?"Termina primero: ":"Finish ")+stepLabel(block.stepId, L)+(L==="es"?"":" first");
    return;
  }
  if(flow.steps.findIndex(s=>s.id===id) < flow.steps.findIndex(s=>s.id===stepId)) returnTo=returnTo||stepId;
  go(id, id==="documents"?docIndex:0);
}
function go(id, nextDoc, opts){
  opts=opts||{};
  pendingNotice="";
  if(!flow.steps.some(s=>s.id===id)) id="about";
  const requested=id;
  const block=earlierBlock(id, flow, answers);
  if(block && !opts.force){
    if(requested!==block.stepId){
      const first=block.problems&&block.problems[0];
      pendingNotice=(L==="es"?"Termina primero: ":"Finish ")+(first&&first.label?first.label:stepLabel(block.stepId, L));
    }
    id=block.stepId;
    nextDoc=id==="documents"?firstOpenDocument(flow, answers):0;
  }
  stepId=id;
  if(id==="documents"){
    const max=Math.max((flow.docs||[]).length-1, 0);
    docIndex=Math.min(Math.max(Number(nextDoc)||0, 0), max);
  }
  answers.__visited=Array.from(new Set([...(answers.__visited||[]), stepId]));
  const seen=answers.__ui&&answers.__ui.medicalSeen===true;
  answers.__ui={ step: stepId, docIndex };
  if(seen) answers.__ui.medicalSeen=true;
  const url=location.pathname+location.search+hashFor(stepId, docIndex);
  if(opts.replace) history.replaceState({ stepId, docIndex }, "", url);
  else history.pushState({ stepId, docIndex }, "", url);
  scheduleSave();
  render();
  if(pendingNotice && $("err")) $("err").textContent=pendingNotice;
}
function leaveForward(){
  const probs=stepProblems(stepId, flow, answers);
  if(probs.length){
    pendingFocus=probs[0].id;
    showMissing(probs.map(p=>({ ...p, stepId })));
    render();
    return;
  }
  if(stepId==="medical") answers.__ui=Object.assign({}, answers.__ui, { medicalSeen:true, step:"medical" });
  if(returnTo && returnTo!==stepId && !earlierBlock(returnTo, flow, answers)){
    const back=returnTo; returnTo="";
    go(back, back==="documents"?docIndex:0);
    return;
  }
  returnTo="";
  const ids=flow.steps.map(s=>s.id);
  const i=ids.indexOf(stepId);
  const next=ids[i+1]||"review";
  if(next==="finish"){ go("review"); return; }
  go(next, 0);
}
function showMissing(items){
  const box=$("missing");
  if(!box) return;
  box.classList.remove("hide");
  box.innerHTML="";
  const p=document.createElement("p");
  p.textContent=(items.length===1?(L==="es"?"1 dato pendiente: ":"1 item needs attention: "):(items.length+" "+(L==="es"?"datos pendientes: ":"items need attention: ")))+items.map(i=>i.label).join(", ");
  box.appendChild(p);
  for(const item of items){
    const b=document.createElement("button");
    b.type="button"; b.className="miss";
    b.textContent=(L==="es"?"Ir a ":"Go to ")+item.label;
    b.onclick=()=>{
      pendingFocus=item.id; returnTo=stepId;
      const target=item.stepId||stepId;
      const docIdx=target==="documents"?firstOpenDocument(flow, answers):0;
      go(target, docIdx);
    };
    box.appendChild(b);
  }
}
function clearMissing(){ if($("missing")){ $("missing").classList.add("hide"); $("missing").innerHTML=""; } }
function fieldHtml(f){
  const v=answers[f.key]??"";
  if(f.type==="note"){
    const cls=f.variant==="warn"?"notice":f.variant==="heading"?"boxhead":"note";
    return '<div class="'+cls+'">'+esc(lab(f))+'</div>';
  }
  if(f.type==="checkbox"){
    const on=v===true||v==="yes"||v===1;
    return '<label class="chk"><input type="checkbox" id="f_'+f.key+'" '+(on?"checked":"")+'> <span>'+esc(lab(f))+'</span></label>';
  }
  let html='<label for="f_'+f.key+'">'+esc(lab(f))+(f.required?" *":"")+'</label>';
  if(f.type==="yes_no"){
    const yn=v==="yes"||v==="no"?v:"";
    html+='<div class="yesno" id="f_'+f.key+'" role="radiogroup" aria-required="'+(f.required?"true":"false")+'">';
    html+='<label class="'+(yn==="yes"?"picked":"")+'"><input type="radio" name="'+f.key+'" value="yes" autocomplete="off"'+(yn==="yes"?' checked':'')+'> '+(L==="es"?"Sí":"Yes")+'</label>';
    html+='<label class="'+(yn==="no"?"picked":"")+'"><input type="radio" name="'+f.key+'" value="no" autocomplete="off"'+(yn==="no"?' checked':'')+'> '+(L==="es"?"No":"No")+'</label>';
    html+='</div>';
    return html;
  }
  html+='<input id="f_'+f.key+'" value="'+esc(v)+'">';
  return html;
}
function readMedical(){
  for(const block of flow.medical||[]){
    if(!fieldVisible(block.section.show_if, answers)) continue;
    for(const f of block.section.fields||[]){
      if(!fieldVisible(f.show_if, answers) || f.type==="note") continue;
      if(f.type==="yes_no"){
        const el=document.querySelector('input[name="'+f.key+'"]:checked');
        answers[f.key]=el?el.value:"";
      } else if(f.type==="checkbox"){
        answers[f.key]=!!document.getElementById("f_"+f.key)?.checked;
      }
    }
  }
}
function wirePad(canvas, onMark){
  const ctx=canvas.getContext("2d");
  let drawing=false, dirty=false;
  ctx.fillStyle="#fff"; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle="#08315c"; ctx.lineWidth=3; ctx.lineCap="round";
  const pos=e=>{ const r=canvas.getBoundingClientRect(); return { x:(e.clientX-r.left)*canvas.width/r.width, y:(e.clientY-r.top)*canvas.height/r.height }; };
  canvas.onpointerdown=e=>{ e.preventDefault(); drawing=true; dirty=true; try{ canvas.setPointerCapture(e.pointerId); }catch(_){} const p=pos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); };
  canvas.onpointermove=e=>{ if(!drawing) return; e.preventDefault(); const p=pos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); };
  canvas.onpointerup=()=>{ if(!drawing) return; drawing=false; if(dirty) onMark(canvas.toDataURL("image/png")); };
  canvas.onpointercancel=()=>{ drawing=false; };
  return { clear(){ dirty=false; ctx.fillStyle="#fff"; ctx.fillRect(0,0,canvas.width,canvas.height); } };
}
function heading(text){
  const h=document.createElement("h2");
  h.id="stepHeading";
  h.dataset.step=stepId;
  h.textContent=text;
  return h;
}
function actions(onBack, onNext, nextLabel, opts){
  opts=opts||{};
  const row=document.createElement("div");
  row.className="actions"+(opts.sticky?" sticky":"");
  if(onBack){
    const back=document.createElement("button");
    back.type="button"; back.className="ghost"; back.textContent=L==="es"?"Atrás":"Back";
    back.onclick=onBack;
    row.appendChild(back);
  }
  const next=document.createElement("button");
  next.type="button"; next.id="nextBtn"; next.textContent=nextLabel||(L==="es"?"Continuar":"Continue");
  next.onclick=onNext;
  row.appendChild(next);
  return row;
}
function enableAgree(agree, hint, why){
  if(!agree) return;
  agree.disabled=false;
  if(hint) hint.textContent="";
  if(why) why.textContent=L==="es"?"Ya puedes marcar que leíste el documento.":"You can now check that you read this document.";
}
function focusPending(){
  if(!pendingFocus) return;
  const el=document.getElementById("f_"+pendingFocus) || document.querySelector('[name="'+pendingFocus+'"]');
  if(el){ el.classList.add("bad"); el.scrollIntoView({ block:"center" }); }
  pendingFocus="";
}
function renderAbout(){
  const card=document.createElement("div");
  card.className="card";
  card.appendChild(heading(stepLabel("about", L)));
  const note=document.createElement("p");
  note.className="mut";
  const known=!!(answers.first_name&&answers.dob);
  note.textContent=known
    ?(L==="es"?"Tomamos estos datos de tu registro. Cámbialos solo si hay un error.":"We filled these in from your registration. Change them only if something is wrong.")
    :(L==="es"?"Estos datos se escriben en cada formulario.":"These details are written onto every form.");
  card.appendChild(note);
  const fields=[
    ["first_name", L==="es"?"Nombre *":"First name *"],
    ["last_name", L==="es"?"Apellido *":"Last name *"],
    ["dob", L==="es"?"Fecha de nacimiento *":"Date of birth *"],
    ["cell_phone", (flow&&flow.minor)?(L==="es"?"Teléfono (el del tutor)":"Phone (parent or guardian)"):(L==="es"?"Celular":"Mobile phone")],
    ["email", "Email"],
    ["address", L==="es"?"Dirección":"Street address"],
    ["city", L==="es"?"Ciudad *":"City *"],
    ["state", L==="es"?"Estado *":"State *"],
    ["zip", "ZIP *"],
  ];
  for(const [key, label] of fields){
    const labEl=document.createElement("label");
    labEl.htmlFor="f_"+key; labEl.textContent=label;
    const input=document.createElement("input");
    input.id="f_"+key;
    input.value=answers[key]||"";
    if(key==="dob"){ input.type="date"; input.max=new Date().toISOString().slice(0,10); }
    if(key==="email") input.type="email";
    if(key==="cell_phone") input.type="tel";
    card.append(labEl, input);
  }
  card.appendChild(actions(()=>go("about"), ()=>{
    for(const [key] of fields) answers[key]=(document.getElementById("f_"+key).value||"").trim();
    answers.full_name_print=((answers.first_name||"")+" "+(answers.last_name||"")).trim();
    if(!answers.address) answers.address=[answers.city, answers.state, answers.zip].filter(Boolean).join(", ");
    rebuild();
    leaveForward();
  }));
  return card;
}
function renderEmergency(){
  const card=document.createElement("div");
  card.className="card";
  card.appendChild(heading(stepLabel("emergency", L)));
  const fields=[
    ["emergency_contact_name", L==="es"?"Nombre *":"Name *"],
    ["emergency_contact_relationship", L==="es"?"Parentesco":"Relationship"],
    ["emergency_contact_email", "Email"],
    ["emergency_contact_phone", L==="es"?"Teléfono *":"Phone *"],
  ];
  for(const [key, label] of fields){
    const labEl=document.createElement("label");
    labEl.htmlFor="f_"+key; labEl.textContent=label;
    const input=document.createElement("input");
    input.id="f_"+key; input.value=answers[key]||"";
    if(key.endsWith("email")) input.type="email";
    if(key.endsWith("phone")) input.type="tel";
    card.append(labEl, input);
  }
  card.appendChild(actions(()=>{ const i=flow.steps.findIndex(s=>s.id==="emergency"); go(flow.steps[Math.max(i-1,0)].id); }, ()=>{
    for(const [key] of fields) answers[key]=(document.getElementById("f_"+key).value||"").trim();
    leaveForward();
  }));
  return card;
}
function renderGuardian(){
  const card=document.createElement("div");
  card.className="card";
  card.appendChild(heading(stepLabel("guardian", L)));
  const p=document.createElement("p");
  p.className="mut";
  p.textContent=L==="es"?"El participante es menor de 18. El tutor firma el consentimiento de la tienda. El anexo juvenil oficial de SSI se archiva antes del buceo.":"The participant is under 18. The guardian signs the shop consent. The official SSI Youth Addendum is filed before the dive.";
  card.appendChild(p);
  for(const [key, label] of [["guardian_name", L==="es"?"Nombre del tutor *":"Guardian name *"],["guardian_relationship", L==="es"?"Parentesco":"Relationship"]]){
    const labEl=document.createElement("label"); labEl.textContent=label; labEl.htmlFor="f_"+key;
    const input=document.createElement("input"); input.id="f_"+key; input.value=answers[key]||"";
    card.append(labEl, input);
  }
  card.appendChild(actions(()=>go("emergency"), ()=>{
    answers.guardian_name=document.getElementById("f_guardian_name").value.trim();
    answers.guardian_relationship=document.getElementById("f_guardian_relationship").value.trim();
    leaveForward();
  }));
  return card;
}
function visibleMedicalKeys(){
  const keys=[];
  for(const block of flow.medical||[]){
    if(!fieldVisible(block.section.show_if, answers)) continue;
    for(const f of block.section.fields||[]){
      if(!fieldVisible(f.show_if, answers) || f.type==="note") continue;
      keys.push(f.key);
    }
  }
  return keys;
}
function scrubMedicalDefaults(){
  for(const block of flow.medical||[]){
    for(const f of block.section.fields||[]){
      if(f.type!=="yes_no") continue;
      if(answers[f.key]!=="yes" && answers[f.key]!=="no") delete answers[f.key];
    }
  }
}
function renderMedical(){
  scrubMedicalDefaults();
  const card=document.createElement("div");
  card.className="card";
  card.appendChild(heading(stepLabel("medical", L)));
  const intro=document.createElement("p");
  intro.className="mut";
  intro.textContent=L==="es"?"Responde con tus datos de hoy. Nada viene marcado: elige Sí o No en cada pregunta. Si respondes Sí, las casillas de esa pregunta se abren aquí.":"Answer for today. Nothing is pre-selected — choose Yes or No on each question. If you answer Yes, that question's boxes open on this page.";
  card.appendChild(intro);
  card.appendChild(identityBanner());
  let any=false;
  for(const block of flow.medical||[]){
    if(!fieldVisible(block.section.show_if, answers)) continue;
    const title=typeof block.section.title==="string"?block.section.title:(block.section.title&&(block.section.title[L]||block.section.title.en))||block.templateName;
    const h=document.createElement("h3"); h.textContent=title; card.appendChild(h);
    for(const f of block.section.fields||[]){
      if(!fieldVisible(f.show_if, answers)) continue;
      any=true;
      const wrap=document.createElement("div");
      wrap.id="wrap_"+f.key;
      if(f.type==="yes_no"||f.type==="checkbox") wrap.className="qcard";
      wrap.innerHTML=fieldHtml(f);
      card.appendChild(wrap);
    }
  }
  if(!any){
    const p=document.createElement("p");
    p.textContent=L==="es"?"Este paquete no tiene preguntas médicas.":"This packet has no medical questions.";
    card.appendChild(p);
  }
  const opened=medicalAnchor;
  medicalAnchor="";
  card.querySelectorAll('input[type="radio"]').forEach((el)=>{
    el.addEventListener("change", ()=>{
      const before=visibleMedicalKeys().join("|");
      readMedical();
      const after=visibleMedicalKeys();
      if(before===after.join("|")) return;
      medicalAnchor=after.find((k)=>before.split("|").indexOf(k)<0)||el.name;
      go("medical", 0, { replace:true });
    });
  });
  card.appendChild(actions(()=>{
    readMedical();
    const i=flow.steps.findIndex(s=>s.id==="medical");
    go(flow.steps[Math.max(i-1,0)].id);
  }, ()=>{
    const before=visibleMedicalKeys().join("|");
    readMedical();
    const after=visibleMedicalKeys();
    if(before!==after.join("|")){
      medicalAnchor=after.find((k)=>before.split("|").indexOf(k)<0)||"";
      go("medical", 0, { replace:true });
      return;
    }
    leaveForward();
  }));
  if(opened){
    const target=card.querySelector("#wrap_"+opened);
    if(target) setTimeout(()=>{ target.scrollIntoView({ block:"center" }); }, 0);
  }
  return card;
}
function renderDocuments(){
  const docs=flow.docs||[];
  const doc=docs[docIndex]||{ key:"", name:"", legal:"", missing:true };
  const card=document.createElement("div");
  card.className="card";
  card.appendChild(heading(stepLabel("documents", L)));
  const pos=document.createElement("p");
  pos.className="docpos";
  pos.id="docPos";
  pos.textContent=(L==="es"?"Documento ":"Document ")+(docIndex+1)+" "+(L==="es"?"de ":"of ")+Math.max(docs.length,1)+": "+(doc.name||"");
  card.appendChild(pos);
  if(flow) card.appendChild(identityBanner());
  if(!docs.length){
    const empty=document.createElement("p");
    empty.className="err";
    empty.textContent=L==="es"?"No hay documentos en este paquete.":"No documents in this packet.";
    card.appendChild(empty);
    card.appendChild(actions(()=>go("medical"), ()=>go("review"), L==="es"?"Continuar":"Continue", { sticky: !embedMode }));
    return card;
  }
  const list=document.createElement("ol");
  list.className="docpills";
  docs.forEach((d, i)=>{
    const li=document.createElement("li");
    const b=document.createElement("button");
    b.type="button";
    const agreed=answers.__agreements&&answers.__agreements[d.key]&&answers.__agreements[d.key].accepted;
    b.textContent=(agreed?"✓ ":"")+(d.name||d.key)+(i===docIndex?(L==="es"?" (actual)":" (current)"):"");
    b.onclick=()=>{
      if(i>docIndex){
        const prev=docs[docIndex];
        const prevSig=answers.__signatures&&(answers.__signatures[prev.key]||(!answers.__signatures._reuseOff&&answers.__signatures._reuse));
        const ok=answers.__agreements&&answers.__agreements[prev.key]&&answers.__agreements[prev.key].accepted&&String(prevSig||"").startsWith("data:image/png");
        if(!ok){ $("err").textContent=(L==="es"?"Termina primero: ":"Finish ")+(prev.name||"")+(L==="es"?"":" first"); return; }
      }
      go("documents", i, { replace:true });
    };
    li.appendChild(b);
    list.appendChild(li);
  });
  card.appendChild(list);
  const usePdf=["try_scuba_reg","intro_code","fit_to_dive","privacy","rec_waiver","diver_medical"].includes(doc.key);
  const legal=(L==="es"&&doc.legalEs)?doc.legalEs:doc.legal;
  if(!usePdf && (doc.missing || !legal)){
    const warn=document.createElement("p");
    warn.className="err";
    warn.textContent=L==="es"?"No se cargó el texto de este documento.":"This document's text did not load.";
    const retry=document.createElement("button");
    retry.type="button"; retry.className="ghost"; retry.textContent=L==="es"?"Reintentar":"Retry";
    retry.onclick=()=>location.reload();
    card.append(warn, retry);
    card.appendChild(actions(()=>{
      if(docIndex>0) go("documents", docIndex-1);
      else go("medical");
    }, ()=>go("documents", docIndex, { replace:true }), L==="es"?"Reintentar":"Retry", { sticky: !embedMode }));
    return card;
  }
  const minor=!!flow.minor;
  const dateText=new Intl.DateTimeFormat("en-US",{month:"2-digit",day:"2-digit",year:"numeric"}).format(new Date());
  const hint=document.createElement("p");
  hint.className="mut"; hint.id="scrollHint";
  hint.textContent=L==="es"?"Lee el formulario. Tu nombre, fecha de nacimiento y teléfono ya están escritos. Luego marca que aceptas y firma.":"Read the form. Your name, date of birth, and phone are already on it. Then check that you agree and sign.";
  const agreeLab=document.createElement("label");
  agreeLab.className="chk";
  const agree=document.createElement("input");
  agree.type="checkbox"; agree.id="agree"; agree.disabled=true;
  const agreeSpan=document.createElement("span");
  agreeSpan.textContent=L==="es"?"He leído y acepto este documento":"I have read and agree to this document";
  agreeLab.append(agree, agreeSpan);
  const why=document.createElement("p");
  why.className="mut"; why.id="agreeWhy";
  why.textContent=L==="es"?"El recuadro se activa al final del texto o al ampliarlo.":"The checkbox turns on at the end of the text, or after you enlarge and finish it.";
  const markRead=document.createElement("button");
  markRead.type="button"; markRead.className="ghost"; markRead.id="markReadBtn";
  markRead.style.width="100%";
  markRead.style.marginTop="8px";
  markRead.textContent=L==="es"?"Ya leí este documento — activar casilla":"I read this document — enable checkbox";
  markRead.onclick=()=>{
    enableAgree(agree, hint, why);
    agree.checked=true;
    if($("err")) $("err").textContent="";
  };
  const paper=document.createElement("div");
  paper.className="doc paper";
  paper.id="doc";
  if(!usePdf){
    try{
      paper.innerHTML=renderDocumentHtml(String(legal||""), answers, { minor, shopName:(payload&&payload.shopName)||"", dateText })+'<div data-doc-end="1" id="docEnd" style="height:32px"></div>';
    }catch(e){
      paper.textContent=String(legal||"");
      const end=document.createElement("div");
      end.id="docEnd"; end.setAttribute("data-doc-end","1"); end.style.height="32px";
      paper.appendChild(end);
    }
  } else {
    const wait=document.createElement("p");
    wait.className="mut";
    wait.textContent=L==="es"?"Cargando el formulario oficial…":"Loading the official form…";
    paper.appendChild(wait);
  }
  card.appendChild(paper);
  const enlarge=document.createElement("button");
  enlarge.type="button"; enlarge.className="doc-enlarge"; enlarge.id="docEnlarge";
  enlarge.textContent=L==="es"?"Ampliar documento (recomendado en el teléfono)":"Enlarge document (recommended on phone)";
  enlarge.onclick=(ev)=>{ ev.preventDefault(); openDocLightbox(paper, { onRead:()=>enableAgree(agree, hint, why) }); };
  paper.addEventListener("click",(ev)=>{
    if(ev.target.closest("button,a,input,label")) return;
    openDocLightbox(paper, { onRead:()=>enableAgree(agree, hint, why) });
  });
  card.appendChild(enlarge);
  const stored=answers.__signatures||{};
  const reuseOff=stored._reuseOff===true;
  const hasReuse=String(stored._reuse||"").startsWith("data:image/png");
  const showPad=reuseOff||!hasReuse;
  const sigCard=document.createElement("div");
  sigCard.className="sigcard";
  const sigTitle=document.createElement("h3");
  sigTitle.textContent=L==="es"?"Firma del buzo":"Diver signature";
  const sigHelp=document.createElement("p");
  sigHelp.className="mut";
  sigHelp.textContent=L==="es"?"Firma una vez. Puedes usar esa misma firma en cada línea que este buzo tenga que firmar.":"Sign once. You can use that same signature on every line this diver needs to sign.";
  const reuseLab=document.createElement("label");
  reuseLab.className="chk";
  const reuse=document.createElement("input");
  reuse.type="checkbox"; reuse.id="reuse";
  reuse.checked=!reuseOff;
  const reuseSpan=document.createElement("span");
  reuseSpan.textContent=L==="es"?"Usar esta firma en cada línea de firma":"Use this signature on every signature line";
  reuseLab.append(reuse, reuseSpan);
  const sigLab=document.createElement("label");
  sigLab.textContent=L==="es"?"Firma aquí":"Sign here";
  const pad=document.createElement("canvas");
  pad.id="pad"; pad.className="sigpad"; pad.width=900; pad.height=220;
  const clear=document.createElement("button");
  clear.type="button"; clear.className="ghost"; clear.style.marginTop="8px";
  clear.textContent=L==="es"?"Borrar firma":"Clear signature";
  const redraw=document.createElement("button");
  redraw.type="button"; redraw.className="ghost"; redraw.style.marginTop="8px";
  redraw.textContent=L==="es"?"Dibujar otra firma":"Draw a different signature";
  sigCard.append(sigTitle, sigHelp, reuseLab);
  if(!showPad){
    const preview=document.createElement("img");
    preview.className="sigpreview";
    preview.alt=L==="es"?"Firma guardada":"Saved signature";
    preview.src=stored._reuse;
    const using=document.createElement("p");
    using.className="mut";
    using.textContent=L==="es"?"Esta firma se coloca en este formulario y en los demás.":"This signature is placed on this form and the others.";
    sigCard.append(preview, using, redraw);
    sigLab.style.display="none";
    pad.style.display="none";
    clear.style.display="none";
    redraw.onclick=()=>{ preview.style.display="none"; using.style.display="none"; redraw.style.display="none"; sigLab.style.display="block"; pad.style.display="block"; clear.style.display="inline-flex"; };
  }
  sigCard.append(sigLab, pad, clear);
  card.append(hint, agreeLab, why, markRead, sigCard);
  let gpad=null;
  const guardianSaved=String(stored.guardian||"").startsWith("data:image/png");
  const needGuardian=minor && (!guardianSaved || docIndex===0);
  if(needGuardian){
    const gcard=document.createElement("div");
    gcard.className="sigcard";
    const gl=document.createElement("h3");
    gl.textContent=L==="es"?"Firma del tutor":"Guardian signature";
    const gh=document.createElement("p");
    gh.className="mut";
    gh.textContent=L==="es"?"Esta firma del tutor se usa en cada línea de tutor.":"This guardian signature is used on every guardian line.";
    gcard.append(gl, gh);
    if(guardianSaved && docIndex!==0){
      const gimg=document.createElement("img");
      gimg.className="sigpreview"; gimg.alt=""; gimg.src=stored.guardian;
      gcard.appendChild(gimg);
    } else {
      gpad=document.createElement("canvas");
      gpad.id="gpad"; gpad.className="sigpad"; gpad.width=900; gpad.height=200;
      gcard.appendChild(gpad);
      if(guardianSaved){
        const gnote=document.createElement("p");
        gnote.className="mut";
        gnote.textContent=L==="es"?"La firma del tutor ya está guardada. Dibujar de nuevo la reemplaza en todos los formularios.":"The guardian signature is saved. Drawing again replaces it on every form.";
        gcard.appendChild(gnote);
      }
    }
    card.appendChild(gcard);
  }
  const saved=showPad&&answers.__signatures&&(answers.__signatures[doc.key]||answers.__signatures._reuse);
  card.appendChild(actions(()=>{
    if(docIndex>0) go("documents", docIndex-1);
    else {
      const i=flow.steps.findIndex(s=>s.id==="documents");
      go(flow.steps[Math.max(i-1,0)].id);
    }
  }, ()=>{
    if(agree.disabled){
      enableAgree(agree, hint, why);
      $("err").textContent=L==="es"?"Marca que aceptas y firma, luego pulsa otra vez.":"Check that you agree and sign, then tap again.";
      try{ agreeLab.scrollIntoView({ block:"center" }); }catch(e){}
      return;
    }
    if(docIndex>=docs.length-1) finishLastDocument(doc, agree, pad, gpad, reuse);
    else acceptDoc(doc, agree, pad, gpad, reuse);
  }, docIndex>=docs.length-1?(L==="es"?"Listo":"Done"):(L==="es"?"Siguiente documento":"Next document"), { sticky: !embedMode }));
  const arm=()=>{
    const end=document.getElementById("docEnd")||paper.querySelector("[data-doc-end]");
    if(!end){
      // Still loading — keep a short fallback so phones are never stuck.
      setTimeout(()=>{ if(agree.disabled) enableAgree(agree, hint, why); }, 2500);
      return;
    }
    const overflow=paper.scrollHeight-paper.clientHeight>12;
    const enable=()=>enableAgree(agree, hint, why);
    if(!overflow || documentCanAgree({ overflow:false, sentinelVisible:true })){ enable(); return; }
    const watch=(root)=>{
      try{
        const io=new IntersectionObserver((entries)=>{
          if(entries.some(e=>e.isIntersecting && e.intersectionRatio>0)) enable();
        }, { root, threshold:[0, 0.01, 1] });
        io.observe(end);
      }catch(e){ enable(); }
    };
    watch(paper);
    watch(null);
    // Phone fallback: if nested scroll never fires, unlock after a beat.
    setTimeout(()=>{ if(agree.disabled) enable(); }, 4000);
  };
  setTimeout(arm, 0);
  if(usePdf){
    const sigNow=answers.__signatures||{};
    const sigUrl=String(sigNow[doc.key]||(!sigNow._reuseOff&&sigNow._reuse)||"");
    fetch("/api/forms/public/"+TOKEN,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"preview",templateKey:doc.key,answers,language:L,signatureDataUrl:sigUrl.indexOf("data:image/png")===0?sigUrl:"",guardianSignatureDataUrl:String(sigNow.guardian||"").indexOf("data:image/png")===0?sigNow.guardian:""})})
      .then((r)=>{ if(!r.ok) throw new Error("preview"); return r.arrayBuffer(); })
      .then((buf)=>paintPdf(paper, buf))
      .then(()=>arm())
      .catch(()=>{
        paper.innerHTML="";
        const p=document.createElement("p");
        p.className="err";
        p.textContent=L==="es"?"No se pudo mostrar el formulario oficial. Puedes continuar marcando la casilla.":"The official form could not be shown. You can still check the box and continue.";
        const retry=document.createElement("button");
        retry.type="button"; retry.className="ghost";
        retry.textContent=L==="es"?"Reintentar":"Retry";
        retry.onclick=()=>go("documents", docIndex, { replace:true });
        const end=document.createElement("div");
        end.id="docEnd"; end.setAttribute("data-doc-end","1"); end.style.height="8px";
        paper.append(p, retry, end);
        enableAgree(agree, hint, why);
      });
  }
  const draw=wirePad(pad, (url)=>{
    const ink=trimmedSignature(pad)||url;
    const rec=recordSignature(answers.__signatures, doc.key, ink);
    if(!rec.ok){ $("err").textContent=rec.error; return; }
    answers.__signatures=rec.map;
    if(reuse.checked){
      answers.__signatures._reuse=ink;
      delete answers.__signatures._reuseOff;
      answers.__signatures=applyReuseSignature(answers.__signatures, (flow.docs||[]).map(function(d){ return d.key; }));
    }
    saveSigs();
  });
  if(saved){
    const img=new Image();
    img.onload=()=>{ pad.getContext("2d").drawImage(img,0,0,pad.width,pad.height); };
    img.src=saved;
  }
  clear.onclick=()=>{
    draw.clear();
    if(answers.__signatures){
      delete answers.__signatures[doc.key];
      if(reuse.checked) delete answers.__signatures._reuse;
    }
    saveSigs();
  };
  reuse.addEventListener("change", ()=>{
    answers.__signatures=answers.__signatures||{};
    if(reuse.checked){
      delete answers.__signatures._reuseOff;
      const current=String(answers.__signatures[doc.key]||answers.__signatures._reuse||"");
      if(current.indexOf("data:image/png")===0){
        answers.__signatures._reuse=current;
        answers.__signatures=applyReuseSignature(answers.__signatures, (flow.docs||[]).map(function(d){ return d.key; }));
      }
    } else {
      answers.__signatures._reuseOff=true;
      delete answers.__signatures._reuse;
    }
    saveSigs();
  });
  if(gpad){
    wirePad(gpad, (url)=>{
      const ink=trimmedSignature(gpad)||url;
      const rec=recordSignature(answers.__signatures, "guardian", ink);
      if(!rec.ok){ $("err").textContent=rec.error; return; }
      answers.__signatures=rec.map;
      answers.__guardian_signed=true;
      saveSigs();
    });
    const gsaved=answers.__signatures&&answers.__signatures.guardian;
    if(gsaved){
      const img=new Image();
      img.onload=()=>{ gpad.getContext("2d").drawImage(img,0,0,gpad.width,gpad.height); };
      img.src=gsaved;
    }
  }
  return card;
}
function finishLastDocument(doc, agree, pad, gpad, reuse){
  if(!acceptDoc(doc, agree, pad, gpad, reuse, { nav:false })) return;
  // Always land on Review after the last signature so Done/Turnstile never race a mid-render submit.
  go("review");
}
function ensureTurnstile(){
  if(!payload||!payload.turnstileSiteKey) return Promise.resolve();
  if(window.turnstile) return Promise.resolve();
  return new Promise((resolve)=>{
    const existing=document.querySelector('script[data-bnb-turnstile]');
    if(existing){ existing.addEventListener("load", ()=>resolve()); return; }
    const s=document.createElement("script");
    s.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async=true;
    s.dataset.bnbTurnstile="1";
    s.onload=()=>resolve();
    s.onerror=()=>resolve();
    document.head.appendChild(s);
  });
}
function acceptDoc(doc, agree, pad, gpad, reuse, opts){
  opts=opts||{};
  if(agree.disabled || !agree.checked){
    $("err").textContent=L==="es"?"Llega al final y marca que aceptas.":"Reach the end and check that you agree.";
    return false;
  }
  answers.__signatures=answers.__signatures||{};
  const reuseOn=!!(reuse&&reuse.checked);
  if(reuseOn){
    const ink=String(answers.__signatures[doc.key]||answers.__signatures._reuse||"");
    if(ink.indexOf("data:image/png;base64,")===0){
      answers.__signatures._reuse=ink;
      delete answers.__signatures._reuseOff;
      answers.__signatures=applyReuseSignature(answers.__signatures, (flow.docs||[]).map(function(d){ return d.key; }));
    }
  } else if(reuse){
    answers.__signatures._reuseOff=true;
    delete answers.__signatures._reuse;
  }
  if(!String(answers.__signatures[doc.key]||"").startsWith("data:image/png;base64,")){
    $("err").textContent=L==="es"?"Firma el documento.":"Sign this document.";
    return false;
  }
  if(flow.minor && !String(answers.__signatures.guardian||"").startsWith("data:image/png;base64,")){
    if($("err")) $("err").textContent=L==="es"?"El tutor debe firmar.":"Guardian signature is required.";
    return false;
  }
  if(flow.minor){
    answers.__guardian_signed=true;
    answers.guardian_signature="signed";
    // Keep youth consent in sync with the guardian pad so Review is never blocked after signing.
    if(String(answers.__signatures.guardian||"").startsWith("data:image/png;base64,")){
      if(!String(answers.__signatures.youth_addendum||"").startsWith("data:image/png;base64,")){
        answers.__signatures.youth_addendum=answers.__signatures.guardian;
      }
      answers.__agreements=answers.__agreements||{};
      if(!answers.__agreements.youth_addendum||answers.__agreements.youth_addendum.accepted!==true){
        answers.__agreements.youth_addendum={ accepted:true, at:Date.now(), text:"Guardian consent" };
      }
    }
  }
  answers.__agreements=answers.__agreements||{};
  answers.__agreements[doc.key]={ accepted:true, at:Date.now(), text:"I have read and agree to this document" };
  if(doc.key==="privacy") answers.guardian_privacy_consent=true;
  answers.__consent_accepted=true;
  saveSigs();
  if(opts.nav===false) return true;
  if(docIndex < (flow.docs||[]).length-1) go("documents", docIndex+1);
  else go("review");
  return true;
}
function renderReview(){
  const card=document.createElement("div");
  card.className="card";
  card.appendChild(heading(stepLabel("review", L)));
  card.appendChild(identityBanner());
  const items=missingItems(flow, answers, L);
  if(items.length){
    const note=document.createElement("p");
    note.className="err";
    note.textContent=items.length+" "+(L==="es"?"datos pendientes":"items need attention");
    card.appendChild(note);
    showMissing(items);
  }
  for(const [k,v] of [["Name", answers.full_name_print],["DOB", answers.dob],["Email", answers.email],["Phone", answers.cell_phone],["City", answers.city]]){
    const p=document.createElement("p");
    const b=document.createElement("b"); b.textContent=k+" ";
    p.append(b, document.createTextNode(v||"—"));
    card.appendChild(p);
  }
  if(payload&&payload.turnstileSiteKey){
    const cf=document.createElement("div");
    cf.id="cf"; cf.className="cf-turnstile"; cf.dataset.sitekey=payload.turnstileSiteKey;
    card.appendChild(cf);
  }
  const row=actions(()=>go("documents", Math.max((flow.docs||[]).length-1,0)), ()=>submitPacket(), L==="es"?"Listo":"Done");
  if(items.length){
    const why=document.createElement("p");
    why.className="err";
    why.id="finishWhy";
    why.textContent=(L==="es"?"Falta: ":"Still needed: ")+items.map(i=>i.label).join(", ");
    card.appendChild(why);
  }
  card.appendChild(row);
  if(payload&&payload.turnstileSiteKey){
    ensureTurnstile().then(()=>{
      try{
        if(window.turnstile && $("cf") && !$("cf").dataset.rendered){
          window.turnstile.render("#cf",{sitekey:payload.turnstileSiteKey});
          $("cf").dataset.rendered="1";
        }
      }catch(e){}
    });
  }
  return card;
}
async function submitPacket(){
  const items=missingItems(flow, answers, L);
  if(items.length){ showMissing(items); $("err").textContent=(L==="es"?"Falta: ":"Still needed: ")+items.map(i=>i.label).join(", "); return; }
  const btn=$("nextBtn");
  if(btn){ btn.disabled=true; btn.textContent="…"; }
  answers.__consent_accepted=true;
  answers.full_name_print=((answers.first_name||"")+" "+(answers.last_name||"")).trim();
  const first=(flow.docs&&flow.docs[0]&&flow.docs[0].key)||"";
  const sig=(answers.__signatures&&(answers.__signatures[first]||answers.__signatures._reuse))||"";
  if(payload&&payload.turnstileSiteKey) await ensureTurnstile();
  const turnstileToken=document.querySelector("[name=cf-turnstile-response]")?.value||"";
  if(payload&&payload.turnstileSiteKey && !turnstileToken){
    if(btn){ btn.disabled=false; btn.textContent=L==="es"?"Listo":"Done"; }
    $("err").textContent=L==="es"?"Completa la verificación de seguridad.":"Complete the security check, then tap Done.";
    go("review");
    return;
  }
  let r, out;
  try{
    r=await fetch("/api/forms/public/"+TOKEN,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      action:"submit", answers, signerName:answers.full_name_print, signatureDataUrl:sig, language:L, consentText:"I have read and agree to this document", turnstileToken
    })});
    out=await r.json().catch(()=>({}));
  }catch(e){
    if(btn){ btn.disabled=false; btn.textContent=L==="es"?"Listo":"Done"; }
    showRetry(L==="es"?"No se envió. Tus datos siguen aquí.":"Submit failed. Your answers are still here.");
    return;
  }
  if(!r.ok){
    if(btn){ btn.disabled=false; btn.textContent=L==="es"?"Listo":"Done"; }
    const view=submitFailureView(out);
    showRetry(view.message);
    if(view.items.length) showMissing(view.items.map(i=>({ ...i, stepId: stepForError(i.id) })));
    $("err").textContent=view.message;
    return;
  }
  doneOut=out;
  stepId="finish";
  try{ history.pushState({ stepId:"finish" }, "", location.pathname+location.search+"#finish"); }catch(e){}
  render();
}
function stepForError(key){
  if(!key) return "review";
  if(["first_name","last_name","dob","city","state","zip"].includes(key)) return "about";
  if(String(key).startsWith("emergency_")) return "emergency";
  if(String(key).startsWith("guardian")) return flow.minor?"guardian":"about";
  if(String(key).startsWith("agree_")||String(key).startsWith("sign_")||String(key).startsWith("doc_")) return "documents";
  if(String(key).startsWith("dm_")||String(key).startsWith("fit_")||key==="over_45") return "medical";
  return "review";
}
function loadPdfJs(){
  if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if(window.__bnbPdf) return window.__bnbPdf;
  window.__bnbPdf=new Promise((resolve, reject)=>{
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload=()=>{
      window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    s.onerror=()=>reject(new Error("pdf.js"));
    document.head.appendChild(s);
  });
  return window.__bnbPdf;
}
async function paintPdf(host, bytes){
  const pdfjs=await loadPdfJs();
  const pdf=await pdfjs.getDocument({ data: bytes }).promise;
  host.innerHTML="";
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);
    const cssWidth=Math.max((host&&host.clientWidth)||360, 320);
    const viewport=page.getViewport({ scale: Math.min(2.4, Math.max(1.7, (cssWidth/520))) });
    const canvas=document.createElement("canvas");
    canvas.className="pdfpage";
    canvas.width=viewport.width;
    canvas.height=viewport.height;
    canvas.style.width="100%";
    canvas.style.height="auto";
    canvas.style.display="block";
    canvas.style.margin="0 0 8px";
    canvas.style.touchAction="pan-y";
    host.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  }
  const end=document.createElement("div");
  end.id="docEnd";
  end.setAttribute("data-doc-end","1");
  end.style.height="32px";
  host.appendChild(end);
  postEmbedSize();
}
function closeDocLightbox(){
  const box=document.getElementById("docLightbox");
  if(!box) return;
  box.classList.remove("open");
  document.body.style.overflow="";
}
function openDocLightbox(sourcePaper, opts){
  opts=opts||{};
  if(!sourcePaper) return;
  let box=document.getElementById("docLightbox");
  if(!box){
    box=document.createElement("div");
    box.id="docLightbox";
    box.innerHTML='<div class="lbbar"><b></b><button type="button" class="ghost" id="docLightboxClose"></button></div><div class="lbscroll" id="docLightboxScroll"></div>';
    document.body.appendChild(box);
    box.querySelector("#docLightboxClose").onclick=closeDocLightbox;
    box.addEventListener("click",(ev)=>{ if(ev.target===box) closeDocLightbox(); });
  }
  box.querySelector(".lbbar b").textContent=L==="es"?"Documento ampliado — llega al final":"Enlarged document — scroll to the end";
  box.querySelector("#docLightboxClose").textContent=L==="es"?"Cerrar":"Close";
  const scroll=box.querySelector("#docLightboxScroll");
  scroll.innerHTML="";
  const canvases=sourcePaper.querySelectorAll("canvas.pdfpage, canvas");
  if(canvases.length){
    canvases.forEach((c)=>{
      if(c.id==="pad"||c.id==="gpad"||c.classList.contains("sigpad")) return;
      try{
        const img=document.createElement("img");
        img.src=c.toDataURL("image/png");
        img.alt="";
        scroll.appendChild(img);
      }catch(e){
        scroll.appendChild(c.cloneNode(true));
      }
    });
  } else {
    const clone=sourcePaper.cloneNode(true);
    clone.removeAttribute("id");
    clone.style.maxHeight="none";
    clone.style.overflow="visible";
    clone.style.cursor="default";
    scroll.appendChild(clone);
  }
  const end=document.createElement("div");
  end.setAttribute("data-lb-end","1");
  end.style.height="64px";
  scroll.appendChild(end);
  const done=document.createElement("button");
  done.type="button"; done.className="ban"; done.style.width="100%"; done.style.marginTop="8px";
  done.textContent=L==="es"?"Listo — volver y continuar":"Done — return and continue";
  done.onclick=()=>{ if(typeof opts.onRead==="function") opts.onRead(); closeDocLightbox(); };
  scroll.appendChild(done);
  const markRead=()=>{ if(typeof opts.onRead==="function") opts.onRead(); };
  const onScroll=()=>{
    if(scroll.scrollTop+scroll.clientHeight >= scroll.scrollHeight-80) markRead();
  };
  scroll.onscroll=onScroll;
  box.classList.add("open");
  document.body.style.overflow="hidden";
  try{ scroll.scrollTop=0; }catch(e){}
  // If content fits, unlock immediately.
  setTimeout(()=>{ if(scroll.scrollHeight<=scroll.clientHeight+20) markRead(); }, 100);
}
function pdfFileName(key){
  const clean=(s)=>String(s||"Form").replace(/[^\\p{L}\\p{N}._-]+/gu,"_").replace(/_+/g,"_").slice(0,40);
  const day=new Date().toISOString().slice(0,10);
  return clean(answers.last_name)+"_"+clean(answers.first_name)+"_"+clean(key)+"_"+day+".pdf";
}
async function downloadPdf(key){
  const res=await fetch("/api/forms/public/"+TOKEN+"?file="+encodeURIComponent(key));
  if(!res.ok) throw new Error("download");
  const blob=await res.blob();
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=pdfFileName(key);
  document.body.appendChild(a);
  a.click();
  a.remove();
  return blob;
}
function showDone(out){
  out=out&&typeof out==="object"?out:{};
  closeDocLightbox();
  const app=$("app");
  if(!app) return;
  app.innerHTML="";
  const card=document.createElement("div");
  card.className="card";
  const h=heading(L==="es"?"Listo":"Finish");
  h.textContent=L==="es"?"Registro completo":"Registration complete";
  card.appendChild(h);
  const p=document.createElement("p");
  p.appendChild(document.createTextNode(L==="es"?"Registro #: ":"Registration #: "));
  const b=document.createElement("b");
  b.textContent=out.registrationNumber||"—";
  p.appendChild(b);
  card.appendChild(p);
  if(out.needsPhysician||out.needsStaffReview){
    const n=document.createElement("div");
    n.className="notice";
    n.textContent=out.staffReviewNotice||out.physicianNotice||(L==="es"?"El personal revisará tu cuestionario antes del buceo.":"Staff will review your questionnaire before the dive.");
    card.appendChild(n);
  } else {
    const ok=document.createElement("p");
    ok.className="ok";
    ok.textContent=L==="es"?"Tu formulario médico está en orden.":"Your medical form is clear.";
    card.appendChild(ok);
  }
  const files=Array.isArray(out.files)?out.files.filter((f)=>f&&typeof f==="object"):[];
  const all=files.find((f)=>f.key==="packet");
  if(all){
    const allBtn=document.createElement("button");
    allBtn.type="button"; allBtn.className="ban"; allBtn.style.width="100%"; allBtn.style.marginTop="8px";
    allBtn.textContent=L==="es"?"Descargar todo":"Download all";
    allBtn.onclick=()=>downloadPdf("packet").catch(()=>showRetry(L==="es"?"No se pudo descargar":"Download failed"));
    card.appendChild(allBtn);
  }
  for(const f of files){
    if(f.key==="packet") continue;
    const btn=document.createElement("button");
    btn.type="button"; btn.className="ghost"; btn.style.width="100%"; btn.style.marginTop="8px";
    btn.textContent=(L==="es"?"Descargar ":"Download ")+(f.key||"pdf");
    btn.onclick=()=>downloadPdf(f.key).catch(()=>showRetry(L==="es"?"No se pudo descargar":"Download failed"));
    card.appendChild(btn);
    if(!f.reference){
      const host=document.createElement("div");
      host.className="doc paper";
      host.style.marginTop="8px";
      host.textContent=L==="es"?"Cargando vista previa…":"Loading preview…";
      card.appendChild(host);
      fetch("/api/forms/public/"+TOKEN+"?file="+encodeURIComponent(f.key))
        .then((r)=>{ if(!r.ok) throw new Error("file"); return r.arrayBuffer(); })
        .then((buf)=>paintPdf(host, buf))
        .catch(()=>{ host.textContent=L==="es"?"No se pudo mostrar el PDF.":"The PDF could not be shown."; });
    }
  }
  const email=document.createElement("button");
  email.type="button"; email.className="ghost"; email.style.width="100%"; email.style.marginTop="8px";
  email.textContent=L==="es"?"Copiar enlace seguro":"Copy a secure link";
  const note=document.createElement("p"); note.className="mut"; note.id="emailNote";
  email.onclick=async()=>{
    const res=await fetch("/api/forms/public/"+TOKEN,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"email-copy",language:L})});
    const j=await res.json().catch(()=>({}));
    note.textContent=j.note||"";
    if(j.link){
      const inp=document.createElement("input");
      inp.readOnly=true; inp.value=j.link;
      const copy=document.createElement("button");
      copy.type="button"; copy.className="ghost"; copy.textContent=L==="es"?"Copiar":"Copy";
      copy.onclick=()=>{ navigator.clipboard.writeText(j.link).then(()=>{ copy.textContent=L==="es"?"Copiado":"Copied"; }).catch(()=>{}); };
      note.after(inp, copy);
    }
  };
  const back=document.createElement("button");
  back.type="button"; back.className="ban"; back.style.width="100%"; back.style.marginTop="8px";
  back.textContent=L==="es"?"Volver al registro":"Back to registration";
  back.onclick=()=>goBackAfterPacket(out);
  card.append(email, note, back);
  app.appendChild(card);
  paintStepper();
  // Brief pause so "Done" / downloads are visible, then return to registration.
  setTimeout(()=>goBackAfterPacket(out, { auto: true }), 1800);
}
function packetReturnUrl(){
  try{
    const ret=new URLSearchParams(location.search).get("return");
    if(!ret) return "";
    const u=new URL(ret, location.origin);
    if(u.origin!==location.origin) return "";
    if(!u.searchParams.has("fromPacket")) u.searchParams.set("fromPacket","1");
    if(!u.searchParams.has("packetDone")) u.searchParams.set("packetDone","1");
    return u.pathname+u.search+u.hash;
  }catch(e){ return ""; }
}
function goBackAfterPacket(out, opts){
  opts=opts||{};
  const msg={type:"bnb_packet_done",registrationNumber:out&&out.registrationNumber||"",needsPhysician:!!(out&&(out.needsPhysician||out.needsStaffReview)),needsStaffReview:!!(out&&(out.needsPhysician||out.needsStaffReview)),staffReviewStatus:(out&&out.staffReviewStatus)||""};
  const ret=packetReturnUrl();
  try{
    if(window.parent&&window.parent!==window){
      window.parent.postMessage(msg, location.origin);
      if(opts.auto) return;
    }
  }catch(e){}
  if(ret){ location.href=ret; return; }
  if(opts.auto) return;
  location.href="/register.html?fromPacket=1&packetDone=1";
}
function render(){
  syncLangBtn();
  applyTheme();
  closeDocLightbox();
  paintStepper();
  if($("err")) $("err").textContent="";
  clearMissing();
  document.body.style.overflow="";
  try{ window.scrollTo(0, 0); }catch(e){}
  const app=$("app");
  if(!app) return;
  if(stepId==="finish" && doneOut){
    try{ showDone(doneOut); }catch(e){ try{ console.error(e); }catch(_){} }
    return;
  }
  app.innerHTML="";
  let card=null;
  try{
    if(stepId==="about") card=renderAbout();
    else if(stepId==="emergency") card=renderEmergency();
    else if(stepId==="guardian") card=renderGuardian();
    else if(stepId==="medical") card=renderMedical();
    else if(stepId==="documents") card=renderDocuments();
    else if(stepId==="review") card=renderReview();
    else card=renderAbout();
  }catch(e){
    const fail=document.createElement("div");
    fail.className="card";
    const p=document.createElement("p");
    p.className="err";
    p.textContent=L==="es"?"No se pudo mostrar este paso. Reintenta.":"This step could not be shown. Please retry.";
    const b=document.createElement("button");
    b.type="button"; b.className="ban"; b.style.width="100%";
    b.textContent=L==="es"?"Reintentar":"Retry";
    b.onclick=()=>render();
    fail.append(p, b);
    card=fail;
    try{ console.error(e); }catch(_){}
  }
  if(card) app.appendChild(card);
  focusPending();
  postEmbedSize();
  setTimeout(postEmbedSize, 80);
  setTimeout(postEmbedSize, 500);
  if(!flow) return;
  const probs=stepProblems(stepId, flow, answers);
  if(probs.length && stepId!=="review" && stepId!=="documents" && stepId!=="finish"){
    const why=document.createElement("p");
    why.className="mut";
    why.textContent=(L==="es"?"Para continuar: ":"To continue: ")+probs.map(p=>p.label).slice(0,3).join(", ");
    app.appendChild(why);
  }
}
window.addEventListener("popstate", ()=>{
  const parsed=parseHash(location.hash, flow)||{ stepId:"about", docIndex:0 };
  const block=earlierBlock(parsed.stepId, flow, answers);
  stepId=block?block.stepId:parsed.stepId;
  docIndex=parsed.docIndex||0;
  if(block) $("err").textContent=(L==="es"?"Termina primero: ":"Finish ")+stepLabel(block.stepId, L)+(L==="es"?"":" first");
  render();
});
function setLang(next, opts){
  opts=opts||{};
  if(next!=="en" && next!=="es") return;
  const changed=L!==next;
  L=next;
  try{localStorage.setItem("bnb_lang",L)}catch(e){}
  syncLangBtn();
  if(changed && flow && !opts.skipRender) render();
}
$("langBtn").onclick=()=>setLang(L==="en"?"es":"en");
window.addEventListener("message",(ev)=>{
  if(!ev.data) return;
  if(ev.data.type==="bnb_set_lang") setLang(ev.data.lang);
  if(ev.data.type==="bnb_focus" && flow){
    const key=ev.data.docKey||"";
    const i=(flow.docs||[]).findIndex(function(d){ return d.key===key; });
    if(i>=0 && stepId==="documents") go("documents", i, { replace:true });
  }
});
window.addEventListener("storage",(ev)=>{
  if(ev.key!=="bnb_lang") return;
  if(ev.newValue==="en"||ev.newValue==="es") setLang(ev.newValue);
});
try{
  const q=new URLSearchParams(location.search).get("lang");
  if(q==="en"||q==="es") setLang(q,{skipRender:true});
}catch(e){}
if(/[?&]kiosk=1(?:&|$)/.test(location.search)){
  let idle, locked=false;
  const clearKiosk=()=>{ try{ sessionStorage.removeItem(sigKey()); localStorage.removeItem("bnb_reg_draft"); }catch(e){} location.href="/register.html?kiosk=1"; };
  const showLock=()=>{
    const need=String(answers.dob||"").slice(0,10);
    if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(need)){ clearKiosk(); return; }
    locked=true;
    let box=$("kioskDobLock");
    if(!box){
      box=document.createElement("div"); box.id="kioskDobLock";
      box.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px";
      const h=L==="es"?"¿Quién continúa?":"Who is continuing?";
      const p=L==="es"?"Ingresa tu fecha de nacimiento para seguir.":"Enter your date of birth to continue.";
      const go=L==="es"?"Continuar":"Continue";
      box.innerHTML="<div style=\\"background:#fff;color:#111;border-radius:16px;padding:24px;max-width:360px;width:100%;text-align:center\\"><h2 style=\\"margin:0 0 8px;font-size:1.2rem\\">"+h+"</h2><p style=\\"margin:0 0 12px;color:#444\\">"+p+"</p><input id=\\"kioskDobIn\\" type=\\"date\\" style=\\"width:100%;padding:12px;font-size:16px;margin-bottom:8px\\"><p id=\\"kioskDobErr\\" style=\\"color:#b00020;min-height:1.2em\\"></p><button type=\\"button\\" id=\\"kioskDobGo\\" style=\\"width:100%;padding:14px;font-size:16px;border:0;border-radius:12px;background:#0a6;color:#fff\\">"+go+"</button></div>";
      document.body.appendChild(box);
      $("kioskDobGo").onclick=()=>{
        if(($("kioskDobIn").value||"")!==need){ $("kioskDobErr").textContent=L==="es"?"No coincide.":"Does not match."; return; }
        locked=false; box.remove(); bump();
      };
    }
  };
  const bump=()=>{ if(locked) return; clearTimeout(idle); idle=setTimeout(showLock, 420000); };
  ["pointerdown","keydown"].forEach(ev=>document.addEventListener(ev, bump, {passive:true}));
  bump();
}
(async()=>{
  if(embedMode) document.body.classList.add("embed");
  applyTheme();
  syncLangBtn();
  $("title").textContent=L==="es"?"Cargando…":"Loading…";
  const r=await fetch("/api/forms/public/"+TOKEN);
  const out=await r.json().catch(()=>({}));
  if(!r.ok){ $("title").textContent=out.error||"Error"; showRetry(out.error||(L==="es"?"No se pudo abrir":"Could not open")); return; }
  payload=out;
  answers=out.answers||{};
  delete answers.__signatures;
  loadSigs();
  if(!answers.cell_phone && answers.phone) answers.cell_phone=answers.phone;
  if(!answers.phone && answers.cell_phone) answers.phone=answers.cell_phone;
  if(!answers.full_name_print) answers.full_name_print=((answers.first_name||"")+" "+(answers.last_name||"")).trim();
  if(!answers.__visited) answers.__visited=[];
  rebuild();
  $("title").textContent=(out.packet&&out.packet.name)||out.shopName||"Forms";
  const fromHash=parseHash(location.hash, flow);
  const resume=fromHash||resumeTarget(flow, answers);
  stepId=resume.stepId;
  docIndex=resume.docIndex||0;
  if((stepId==="about"||stepId==="emergency"||stepId==="guardian") && !stepProblems(stepId, flow, answers).length){
    const again=resumeTarget(flow, Object.assign({}, answers, {__ui:null}));
    stepId=again.stepId;
    docIndex=again.docIndex||0;
  }
  const block=earlierBlock(stepId, flow, answers);
  if(block) stepId=block.stepId;
  history.replaceState({ stepId, docIndex }, "", location.pathname+location.search+hashFor(stepId, docIndex));
  render();
})();
`;
}
