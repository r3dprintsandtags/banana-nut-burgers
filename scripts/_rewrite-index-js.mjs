import fs from "fs";
const p = "index.html";
let html = fs.readFileSync(p, "utf8");
const start = html.indexOf("<script>");
const end = html.indexOf("</script>", start);
if (start < 0 || end < 0) throw new Error("script missing");

const script = `<script>
const IMG={gear:"img/backroll.jpg",crew:"img/shop-flag.jpg",boat:"img/dive-boat.png",snork:"img/reef-swim.jpg"};
const ACTS=["Scuba","Dives & courses","Island tours","Snorkel"];
const T={
en:{h1:"Dive. Laugh. <b>Repeat.</b>",sub:"Small-group diving, island tours and sunset bonfires at Tita's Pink Seahorse Bar on West End.",bookNow:"Book & check in",ciH:"Book your dive and check in — one flow",ciP:"Pick your activity and time, complete your forms and medical screening, and sign. One submit books your spot and registers you with the shop. No account needed.",ciStart:"Book & check in",ciResume:"Resume check-in",ciInfo:"View Dive Shop Information",ciContact:"Contact the Dive Shop",ciReq:"View Registration Requirements",ciPriv:"Privacy: your information and signed documents are stored privately and only visible to authorized Banana Nut Burger staff.",expH:"Pick your adventure",expS:"Tap one to book and check in.",s1:"fish species",s2:"coral species",s3:"per group",galH:"Roatán, up close",galS:"Real moments from our dives and tours.",bookH:"Book & check in",bookS:"Activity, date, forms, and signature — all in one go. We confirm by WhatsApp or email.",bookOne:"Your booking and registration happen together. Choose an adventure above or start below — you will pick a date and time, fill diver details, complete required forms, and sign once.",bookOneNote:"When you finish, your appointment shows in our Bookings inbox and your paperwork in Registrations.",findH:"Find us",findD:"West End, Roatán. At Tita's Pink Seahorse Bar, steps from the beach.",dir:"Get directions",pill:"WEST END · ROATÁN",svc:[["gear","Scuba","Never dived? Start here."],["crew","Dives & courses","Certification up to Divemaster."],["boat","Island tours","Cayos Cochinos, Pigeon Cay, Guanaja, Utila."],["snork","Snorkel","Reefs with a guide."]]},
es:{h1:"Bucea. Ríe. <b>Repite.</b>",sub:"Buceo en grupos pequeños, tours por la isla y fogatas al atardecer en Tita's Pink Seahorse Bar, West End.",bookNow:"Reservar y registrarse",ciH:"Reserva y check-in — todo junto",ciP:"Elige actividad y horario, completa formularios y screening médico, y firma. Un solo envío reserva tu lugar y te registra en la tienda. Sin crear cuenta.",ciStart:"Reservar y registrarse",ciResume:"Continuar check-in",ciInfo:"Ver información de la tienda",ciContact:"Contactar la tienda",ciReq:"Ver requisitos de registro",ciPriv:"Privacidad: tu información y documentos firmados se guardan de forma privada y solo los ve el personal autorizado de Banana Nut Burger.",expH:"Elige tu aventura",expS:"Toca una para reservar y registrarte.",s1:"especies de peces",s2:"especies de coral",s3:"por grupo",galH:"Roatán de cerca",galS:"Momentos reales de nuestros buceos y tours.",bookH:"Reservar y registrarse",bookS:"Actividad, fecha, formularios y firma — todo en un solo flujo. Confirmamos por WhatsApp o correo.",bookOne:"Tu reserva y registro van juntos. Elige una aventura arriba o empieza abajo: fecha y hora, datos del buzo, formularios y una firma.",bookOneNote:"Al terminar, tu cita aparece en Reservas y tu papeleo en Registros.",findH:"Encuéntranos",findD:"West End, Roatán. En Tita's Pink Seahorse Bar, a pasos de la playa.",dir:"Cómo llegar",pill:"WEST END · ROATÁN",svc:[["gear","Scuba","¿Nunca has buceado? Empieza aquí."],["crew","Buceos y cursos","Certificación hasta Divemaster."],["boat","Tours por la isla","Cayos Cochinos, Pigeon Cay, Guanaja, Utila."],["snork","Snorkel","Arrecifes con guía."]]}
};
let L=(navigator.language||"en").startsWith("es")?"es":"en";
const $=i=>document.getElementById(i),PH="50498763374";
try{const saved=localStorage.getItem("bnb_lang");if(saved==="en"||saved==="es")L=saved}catch(e){}
try{const th=localStorage.getItem("bnb_theme");if(th==="dark"||th==="light")document.documentElement.dataset.theme=th}catch(e){}
function goRegister(activity){
  const q=new URLSearchParams({start:"1"});
  if(activity)q.set("activity",activity);
  location.href="register.html?"+q.toString();
}
function render(){
  const t=T[L];
  document.documentElement.lang=L;
  $("lang").textContent=L==="en"?"ES":"EN";
  document.querySelectorAll("[data-i]").forEach(e=>{if(t[e.dataset.i]!==undefined)e.textContent=t[e.dataset.i]});
  document.querySelector("[data-h]").innerHTML=t.h1;
  $("svc").innerHTML="";
  t.svc.forEach((s,i)=>{
    const c=document.createElement("div");
    c.className="sv";
    c.innerHTML=\`<img alt=""><div><h3></h3><p></p></div>\`;
    c.querySelector("img").src=IMG[s[0]];
    c.querySelector("h3").textContent=s[1];
    c.querySelector("p").textContent=s[2];
    c.onclick=()=>goRegister(ACTS[i]);
    $("svc").append(c);
  });
  const u="https://wa.me/"+PH+"?text="+encodeURIComponent(L==="es"?"Hola Banana Nut Burgers, quiero información de buceo.":"Hi Banana Nut Burgers, I'd like info about diving.");
  $("wa").href=u;$("wa2").href=u;
  if($("bookGo")) $("bookGo").href="register.html?start=1";
}
$("lang").onclick=()=>{L=L==="en"?"es":"en";try{localStorage.setItem("bnb_lang",L)}catch(e){}render()};
$("theme").onclick=()=>{const r=document.documentElement;const next=r.dataset.theme==="dark"?"light":"dark";r.dataset.theme=next;try{localStorage.setItem("bnb_theme",next)}catch(e){}};
document.querySelectorAll(".mos img").forEach(i=>i.onclick=()=>{$("lb").firstElementChild.src=i.src;$("lb").style.display="flex"});
$("lb").onclick=()=>$("lb").style.display="none";
render();
if(location.hash==="#book")setTimeout(()=>$("book").scrollIntoView(),50);
</script>`;

html = html.slice(0, start) + script + html.slice(end + "</script>".length);
fs.writeFileSync(p, html);
console.log("index script rewritten");
