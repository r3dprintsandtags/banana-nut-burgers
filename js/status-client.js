const STATUS_WORDS={"en":{"not_started":"Not started","in_progress":"In progress","done":"Done","needs_resign":"Needs re-sign","waiting_shop":"Waiting on the shop","not_read":"Not read","read":"Read","signed":"Signed"},"es":{"not_started":"Sin empezar","in_progress":"En progreso","done":"Listo","needs_resign":"Firmar de nuevo","waiting_shop":"Esperando a la tienda","not_read":"Sin leer","read":"Leído","signed":"Firmado"}};
const STATUS_ICONS={"not_started":"○","in_progress":"◐","done":"✓","needs_resign":"↻","waiting_shop":"⏳","not_read":"○","read":"◐","signed":"✓"};
const CHIP_COLORS={"light":{"not_started":["#33434f","#eef2f5"],"in_progress":["#6b4200","#fff1d6"],"done":["#0b5c34","#e3f5ea"],"needs_resign":["#8f1a1a","#fde4e4"],"waiting_shop":["#33377f","#e8e9fb"]},"dark":{"not_started":["#d5e4ee","#1d3442"],"in_progress":["#ffd58a","#3a2c10"],"done":["#8be3b0","#12352a"],"needs_resign":["#ffb4b4","#3d1717"],"waiting_shop":["#c7c9ff","#23264d"]}};
const CHIP_CSS={"light":".st-not_started{color:#33434f!important;background:#eef2f5;border-color:#33434f}.st-in_progress{color:#6b4200!important;background:#fff1d6;border-color:#6b4200}.st-done{color:#0b5c34!important;background:#e3f5ea;border-color:#0b5c34}.st-needs_resign{color:#8f1a1a!important;background:#fde4e4;border-color:#8f1a1a}.st-waiting_shop{color:#33377f!important;background:#e8e9fb;border-color:#33377f}","dark":".st-not_started{color:#d5e4ee!important;background:#1d3442;border-color:#d5e4ee}.st-in_progress{color:#ffd58a!important;background:#3a2c10;border-color:#ffd58a}.st-done{color:#8be3b0!important;background:#12352a;border-color:#8be3b0}.st-needs_resign{color:#ffb4b4!important;background:#3d1717;border-color:#ffb4b4}.st-waiting_shop{color:#c7c9ff!important;background:#23264d;border-color:#c7c9ff}"};
function possessive(person, lang) {
  if (!person || person.self) return lang === "es" ? "Tus" : "Your";
  return lang === "es" ? "de " + person.firstName : person.firstName + "'s";
}
function taskLabel(task, status, lang) {
  const es = lang === "es";
  if (!task) return es ? "Terminar" : "Finish";
  const person = (status.people || []).find((p) => p.id === task.personId) || null;
  const own = possessive(person, lang);
  if (task.step === "about") return es ? "Sobre ti" : "About you";
  if (task.step === "minors") {
    if (task.personId && person) return es ? "Datos de " + person.firstName : person.firstName + "'s details";
    return es ? "Qui\xE9n viene" : "Who's coming";
  }
  if (task.step === "health") {
    if (!person || person.self) return es ? "Tus preguntas de salud" : "Your health questions";
    return es ? "Preguntas de salud " + own : own + " health questions";
  }
  if (task.step === "sign") {
    if (!person || person.self) return es ? "Tus documentos" : "Your documents";
    return es ? "Documentos " + own : own + " documents";
  }
  return es ? "Terminar" : "Finish";
}
function primaryAction(status, ctx) {
  const c = ctx || {};
  const lang = c.lang === "es" ? "es" : "en";
  const es = lang === "es";
  if (status.customerFinished) {
    if (status.submitted && c.step === "done") return { kind: "none", label: "" };
    return { kind: "finish", label: es ? "Terminar" : "Finish", target: { step: "done" } };
  }
  const next = status.nextRequiredTask;
  const here = next && next.step === c.step && (next.personId == null || c.personId == null || next.personId === c.personId);
  const person = (status.people || []).find((p) => p.id === (next && next.personId)) || null;
  if (here && next.step === "health" && person) {
    const left = (person.tasks.find((t2) => t2.id === "health") || {}).left || 0;
    const name5 = person.self ? es ? "tus" : "your" : es ? "de " + person.firstName : person.firstName + "'s";
    return {
      kind: "focus",
      label: es ? "Responde " + left + " pregunta" + (left === 1 ? "" : "s") + " m\xE1s (" + (person.self ? "t\xFA" : person.firstName) + ")" : "Answer " + left + " more question" + (left === 1 ? "" : "s") + " (" + (person.self ? "you" : person.firstName) + ")",
      target: next,
      ownerLabel: name5
    };
  }
  if (here && next.step === "sign" && person) {
    const t2 = person.tasks.find((x) => x.id === next.taskId);
    const docName = t2 ? t2.name : "";
    return {
      kind: "focus",
      label: t2 && t2.status === "needs_resign" ? es ? "Firmar de nuevo: " + docName : "Re-sign: " + docName : es ? "Siguiente: " + docName : "Next: " + docName,
      target: next
    };
  }
  if (here && next.step === "about") return { kind: "save", label: es ? "Siguiente: Qui\xE9n viene" : "Next: Who's coming", target: next };
  if (here && next.step === "minors") {
    return { kind: "focus", label: next.personId && person ? es ? "Completa los datos de " + person.firstName : "Finish " + person.firstName + "'s details" : es ? "Responde: \xBFviene alg\xFAn menor?" : "Answer: is anyone under 18 coming?", target: next };
  }
  return { kind: "go", label: (es ? "Siguiente: " : "Next: ") + taskLabel(next, status, lang), target: next };
}