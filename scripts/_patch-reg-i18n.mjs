import fs from "fs";
const p = "register.html";
let s = fs.readFileSync(p, "utf8");

function upsert(block, key, value) {
  const re = new RegExp(`${key}:"(?:\\\\.|[^"\\\\])*"`);
  const lit = `${key}:${JSON.stringify(value)}`;
  if (re.test(block)) return block.replace(re, lit);
  if (!block.includes("resumeBad:")) throw new Error("no resumeBad; keys sample=" + block.slice(-120));
  return block.replace("resumeBad:", `${lit},resumeBad:`);
}

const patches = {
  en: {
    packetCheck: "I finished the packet — check status",
    needPacket: "Open and complete the required form packet before continuing. Then tap check status.",
    packetDone: "Packet completed. You can continue.",
    packetPending: "Packet not finished yet. Open the link, complete and sign every form, then check status again.",
    packetNone: "Open the packet link to start your required forms.",
    sPend: "Medical screening",
    sP: "Answer every medical question. This is a screening for shop staff — it is not dive clearance. Any YES may require a physician review before you dive.",
    dob: "Date of birth *",
    medHeart: "Any heart or circulation problems? *",
    medLung: "Any lung or breathing problems? *",
    medOther: "Any other medical condition that may affect diving? *",
    medOtherDetail: "Please describe *",
    medOtherPh: "Brief details for staff",
    medPregnant: "I understand: do not dive if pregnant. *",
    medTruth: "I confirm these medical answers are true and complete. *",
    medFlag: "Based on your answers, staff may require a physician review before you dive.",
    needMed: "Complete date of birth, every Yes/No question, and both acknowledgements.",
    needMedDetail: "Please describe the medical condition.",
    trSafety: "Medical Information",
    stPend: "Pending",
  },
  es: {
    packetCheck: "Ya terminé el paquete — verificar estado",
    needPacket: "Abre y completa el paquete de formularios antes de continuar. Luego toca verificar estado.",
    packetDone: "Paquete completado. Puedes continuar.",
    packetPending: "El paquete aún no está terminado. Abre el enlace, completa y firma cada formulario, y vuelve a verificar.",
    packetNone: "Abre el enlace del paquete para empezar tus formularios.",
    sPend: "Evaluación médica",
    sP: "Responde todas las preguntas médicas. Esto es un filtro para el personal — no es autorización para bucear. Cualquier SÍ puede requerir revisión médica antes de bucear.",
    dob: "Fecha de nacimiento *",
    medHeart: "¿Problemas del corazón o circulación? *",
    medLung: "¿Problemas pulmonares o respiratorios? *",
    medOther: "¿Otra condición médica que pueda afectar el buceo? *",
    medOtherDetail: "Descríbela *",
    medOtherPh: "Detalles breves para el personal",
    medPregnant: "Entiendo: no bucear si está embarazada. *",
    medTruth: "Confirmo que estas respuestas médicas son verdaderas y completas. *",
    medFlag: "Según tus respuestas, el personal puede exigir revisión médica antes de bucear.",
    needMed: "Completa fecha de nacimiento, cada pregunta Sí/No y ambos reconocimientos.",
    needMedDetail: "Describe la condición médica.",
    trSafety: "Información médica",
    stPend: "Pendiente",
  },
};

const tStart = s.indexOf("const T = {");
if (tStart < 0) throw new Error("T missing");
const tSlice = s.slice(tStart);

for (const [lang, map] of Object.entries(patches)) {
  const startTok = `\n  ${lang}:{`;
  const rel = tSlice.indexOf(startTok);
  if (rel < 0) throw new Error("start " + lang);
  const abs = tStart + rel + startTok.length;
  const endTok = lang === "en" ? "},\n  es:{" : "}\n};";
  const endRel = s.indexOf(endTok, abs);
  if (endRel < 0) throw new Error("end " + lang);
  let block = s.slice(abs, endRel);
  for (const [k, v] of Object.entries(map)) block = upsert(block, k, v);
  s = s.slice(0, abs) + block + s.slice(endRel);
}

fs.writeFileSync(p, s);
console.log("ok", s.includes('packetCheck:"I finished'));
