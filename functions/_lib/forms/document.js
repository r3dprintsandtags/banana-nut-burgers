/** Filled SSI document HTML. Legal sentences stay verbatim. Captions never replace values. */

/**
 * @param {string} text SSI wording extracted from the PDF
 * @param {object} answers
 * @param {{ minor?: boolean, shopName?: string, dateText?: string }} opts
 */
export function renderDocumentHtml(text, answers = {}, opts = {}) {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const chip = (value, caption) => {
    const v = String(value || "").trim();
    if (!v) return `<span class="blank" data-empty="1"></span> <span class="cap">${esc(caption)}</span>`;
    return `<span class="filled">${esc(v)}</span> <span class="cap">${esc(caption)}</span>`;
  };
  const guardianCaptions = /Parent\/Guardian \(Print\)|Parent\/Guardian Signature|Signature of Parent\/Guardian \(When Applicable\)|Print Name of Parent\/Guardian \(When Applicable\)/g;
  const minor = !!opts.minor;
  const name = String(answers.full_name_print || `${answers.first_name || ""} ${answers.last_name || ""}`).trim();
  const shop = String(answers.training_center_name || answers.facility_name || opts.shopName || "").trim();
  const dateText = String(opts.dateText || answers.signature_date_display || "").trim();
  let legal = String(text || "");
  legal = legal.replace(/By placing my name here, I agree to be responsible for the content of this page\.[\s\S]*$/i, "");
  legal = legal.replace(/Physician[’']s Impression[\s\S]*$/i, "");
  legal = legal.replace(/\| Physician[’']s Evaluation Form[\s\S]*$/i, "");
  if (!minor) legal = legal.replace(guardianCaptions, "");

  const chunks = [];
  legal = legal.replace(/\(print name of participant\)|\(print name of student\)|\(print name of training center\)/g, (m) => {
    const id = chunks.length;
    const caption = m.slice(1, -1);
    const value = /training center/.test(m) ? shop : name;
    chunks.push(chip(value, caption));
    return `@@${id}@@`;
  });

  let html = esc(legal).replace(/@@(\d+)@@/g, (_, i) => chunks[Number(i)] || "");
  html += `<div class="sigblock">
    <p class="filled">${esc(answers.first_name || "")} ${esc(answers.last_name || "")}</p>
    <p class="cap">First name · Last name</p>
    <p class="filled">${esc(name)}</p>
    <p class="cap">Participant name</p>
    <p class="filled">${esc(dateText)}</p>
    <p class="cap">Signing date (MM/DD/YYYY)</p>
    ${minor ? `<p class="filled">${esc(answers.guardian_name || "")}</p><p class="cap">Parent or guardian name</p>` : ""}
  </div>`;
  return html;
}

export const PLACEHOLDER_CAPTIONS = [
  "Participant's Name (Print)",
  "Participant’s Name (Print)",
  "Date (DD/MM/YY)",
  "Parent/Guardian Signature",
  "Parent/Guardian (Print)",
];

export function htmlUsesPlaceholderAsValue(html) {
  const text = String(html || "").replace(/<span class="cap">[\s\S]*?<\/span>/g, "");
  return PLACEHOLDER_CAPTIONS.filter((c) => text.includes(c));
}
