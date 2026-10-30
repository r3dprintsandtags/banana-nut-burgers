/** Secure link only. Never include medical answers. */
export async function sendSecureLink(env, { to, name, link }) {
  const text = [
    `Hi ${name || "there"},`,
    "",
    "Here is your secure Banana Nut Burgers forms link.",
    "This email does not include medical answers.",
    "",
    link,
    "",
    "Banana Nut Burgers Dive Shop",
  ].join("\n");
  const from = env.FORMS_FROM_EMAIL || "banananutburgers@gmail.com";
  if (env.EMAIL && typeof env.EMAIL.send === "function") {
    await env.EMAIL.send({
      to,
      from,
      subject: "Your Banana Nut Burgers forms link",
      text,
    });
    return { ok: true, via: "email" };
  }
  return { ok: false, via: "copy" };
}
