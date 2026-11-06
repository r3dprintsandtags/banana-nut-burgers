/**
 * Registration progress for the live register.html stepper.
 * Returned as `status` on /api/register/participants.
 */

function ageFromDob(dob) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dob || ""))) return null;
  const [y, m, d] = String(dob).split("-").map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

function aboutComplete(data) {
  const d = data || {};
  if (!d.activity) return false;
  if (!d.plannedDate || !d.plannedTime) return false;
  if (!d.firstName || !d.lastName) return false;
  if (String(d.phone || "").replace(/\D/g, "").length < 8) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.dob || ""))) return false;
  if (!d.city) return false;
  if (!d.ownGear) return false;
  if (d.ownGear === "no" && !d.gearSize) return false;
  if (String(d.emergencyName || "").length < 2) return false;
  if (String(d.emergencyPhone || "").replace(/\D/g, "").length < 7) return false;
  if (!d.accuracyDeclaration) return false;
  if (!d.privacyAck) return false;
  return true;
}

function minorDetailsDone(p) {
  if (!p.firstName || !p.lastName || !p.dob) return false;
  if (!p.ownGear) return false;
  if (p.ownGear === "no" && !p.gearSize) return false;
  return true;
}

function packetWord(p) {
  const st = String(p.status || "");
  if (st === "complete" || st === "needs_medical_review" || st === "waiting_youth_addendum") return "done";
  if (st === "in_progress") return "in_progress";
  return "not_started";
}

function stepState(status, locked, blockedBy) {
  const out = { status, locked: !!locked };
  if (blockedBy) out.blockedBy = blockedBy;
  return out;
}

/**
 * @param {object} reg registration row
 * @param {object[]} participants public participant rows from partyDashboard
 * @param {{ formTasksByParticipant?: Map<number, object[]> }} [opts]
 */
export function getRegistrationStatus(reg, participants, opts = {}) {
  let data = {};
  try { data = JSON.parse(reg.data || "{}"); } catch { data = {}; }

  const submitted = reg.status && reg.status !== "draft";
  const aboutDone = aboutComplete(data);
  const guests = (participants || []).filter((p) => p.role !== "primary");
  const primary = (participants || []).find((p) => p.role === "primary") || null;
  // Children already on the roster count as Yes even if the draft flag lagged behind.
  const hasMinors = guests.length > 0
    ? true
    : (data.hasMinors === true ? true : (data.hasMinors === false ? false : null));

  const people = (participants || []).map((p) => {
    const self = p.role === "primary";
    const docsWord = packetWord(p);
    const healthWord = docsWord === "done" ? "done" : docsWord;
    const detailsWord = self
      ? (aboutDone ? "done" : "not_started")
      : (minorDetailsDone(p) ? "done" : (p.firstName || p.lastName || p.dob ? "in_progress" : "not_started"));
    const formTasks = (opts.formTasksByParticipant && opts.formTasksByParticipant.get(p.id)) || [];
    const tasks = [
      { id: "health", kind: "health", status: healthWord, left: healthWord === "done" ? 0 : Math.max(1, formTasks.healthLeft || 1) },
      ...formTasks.filter((t) => t.kind === "doc"),
    ];
    if (!formTasks.some((t) => t.kind === "doc") && docsWord !== "done") {
      tasks.push({ id: "sign", kind: "doc", name: "Documents", status: docsWord === "in_progress" ? "read" : "not_started", docKey: "" });
    }
    return {
      id: p.id,
      firstName: p.firstName || "",
      lastName: p.lastName || "",
      age: p.age != null ? p.age : ageFromDob(p.dob),
      self,
      registrationNumber: p.registrationNumber || "",
      details: detailsWord,
      health: healthWord,
      documents: docsWord === "done" && p.status === "needs_medical_review" ? "waiting_shop" : docsWord,
      submitted: docsWord === "done" || submitted,
      tasks,
    };
  });

  let nextRequiredTask = null;
  if (!aboutDone) {
    nextRequiredTask = { step: "about" };
  } else if (hasMinors === null) {
    nextRequiredTask = { step: "minors" };
  } else if (hasMinors === true && !guests.length) {
    nextRequiredTask = { step: "minors" };
  } else if (hasMinors === true) {
    const incomplete = people.find((p) => !p.self && p.details !== "done");
    if (incomplete) nextRequiredTask = { step: "minors", personId: incomplete.id };
  }

  if (!nextRequiredTask) {
    const needHealth = people.find((p) => p.health !== "done");
    if (needHealth) nextRequiredTask = { step: "health", personId: needHealth.id, taskId: "health" };
  }
  if (!nextRequiredTask) {
    const needSign = people.find((p) => p.documents !== "done" && p.documents !== "waiting_shop");
    if (needSign) {
      const doc = (needSign.tasks || []).find((t) => t.kind === "doc" && t.status !== "signed" && t.status !== "done")
        || (needSign.tasks || []).find((t) => t.kind === "doc");
      nextRequiredTask = { step: "sign", personId: needSign.id, taskId: doc?.id || "sign", docKey: doc?.docKey || "" };
    }
  }

  const minorsDone = hasMinors === false || (hasMinors === true && guests.length > 0 && people.every((p) => p.self || p.details === "done"));
  const healthDone = people.length > 0 && people.every((p) => p.health === "done");
  const signDone = people.length > 0 && people.every((p) => p.documents === "done" || p.documents === "waiting_shop");
  const customerFinished = aboutDone && minorsDone && healthDone && signDone;
  const waitingShop = people.some((p) => p.documents === "waiting_shop");
  const overall = submitted
    ? (waitingShop ? "waiting_on_shop" : "complete")
    : (customerFinished ? "waiting_on_shop" : "in_progress");

  const steps = {
    about: stepState(aboutDone ? "done" : "in_progress", false),
    minors: stepState(
      !aboutDone ? "not_started" : (minorsDone ? "done" : (hasMinors === null ? "not_started" : "in_progress")),
      !aboutDone,
      aboutDone ? null : "about"
    ),
    health: stepState(
      !minorsDone ? "not_started" : (healthDone ? "done" : "in_progress"),
      !minorsDone,
      !aboutDone ? "about" : (!minorsDone ? "minors" : null)
    ),
    sign: stepState(
      !healthDone ? "not_started" : (signDone ? "done" : "in_progress"),
      !healthDone,
      !aboutDone ? "about" : (!minorsDone ? "minors" : (!healthDone ? "health" : null))
    ),
    done: stepState(
      customerFinished || submitted ? (waitingShop ? "waiting_on_shop" : "done") : "not_started",
      !(customerFinished || submitted),
      customerFinished || submitted ? null : (nextRequiredTask?.step || "about")
    ),
  };

  return {
    submitted: !!submitted,
    customerFinished: !!customerFinished,
    overall,
    nextRequiredTask,
    steps,
    people,
    primaryId: primary?.id || null,
  };
}
