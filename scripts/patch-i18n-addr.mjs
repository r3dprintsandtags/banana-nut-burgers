import fs from "fs";
const p = "register.html";
let s = fs.readFileSync(p, "utf8");

const addEn =
  'addr:"Street address",city:"City *",state:"State / Province *",zip:"ZIP / Postal *",packetSignNote:"SSI packet complete",packetSignSkip:"Waivers and medical from your forms are done. Confirm accuracy, sign once for the shop, then review and submit.",needAddr:"City, state, and ZIP are required",dSubPacket:"SSI forms are done — sign for the shop to finish check-in.",';
const addEs =
  'addr:"Dirección",city:"Ciudad *",state:"Estado / Provincia *",zip:"ZIP / Código postal *",packetSignNote:"Paquete SSI completo",packetSignSkip:"Exenciones y médico del paquete listos. Confirma exactitud, firma una vez para la tienda, revisa y envía.",needAddr:"Ciudad, estado y ZIP son requeridos",dSubPacket:"Formularios SSI listos — firma para la tienda y termina el check-in.",';

function injectAfter(needle, add) {
  if (!s.includes(needle)) return false;
  // Avoid double-inject
  const at = s.indexOf(needle);
  const after = s.slice(at, at + needle.length + 40);
  if (after.includes("packetSignNote:")) return true;
  s = s.replace(needle, needle + add);
  return true;
}

const okEn = injectAfter('needDob:"Date of birth is required.",', addEn);
const okEs = injectAfter('needDob:"La fecha de nacimiento es requerida.",', addEs);
fs.writeFileSync(p, s);
console.log({ okEn, okEs, packetSignNote: (s.match(/packetSignNote:/g) || []).length, city: (s.match(/city:"City/g) || []).length });
