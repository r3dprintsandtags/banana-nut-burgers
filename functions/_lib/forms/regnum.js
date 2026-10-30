/**
 * Stable registration number per customer: {CODE}-{YY}{MM}-{SEQ4}
 * Assigned once; reused on every form/PDF for that customer.
 */

export async function getShopSetting(env, key, fallback = "") {
  try {
    const row = await env.DB.prepare("SELECT value FROM shop_settings WHERE key=?").bind(key).first();
    return row?.value || env[key.toUpperCase()] || fallback;
  } catch {
    return env[key.toUpperCase()] || fallback;
  }
}

export function formatRegNumber({ code, date = new Date(), seq, format }) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const seq4 = String(seq).padStart(4, "0");
  const fmt = format || "{CODE}-{YY}{MM}-{SEQ4}";
  return fmt
    .replace("{CODE}", code)
    .replace("{YY}", yy)
    .replace("{MM}", mm)
    .replace("{SEQ4}", seq4)
    .replace("{YYYY}", String(date.getFullYear()));
}

/** Ensure customer has registration_number; create if missing. Returns the number. */
export async function ensureRegistrationNumber(env, customerId) {
  const cust = await env.DB.prepare("SELECT id, registration_number FROM customers WHERE id=?").bind(customerId).first();
  if (!cust) throw new Error("customer not found");
  if (cust.registration_number) return cust.registration_number;

  const code = (await getShopSetting(env, "shop_code", env.SHOP_CODE || "BNB")).toUpperCase().slice(0, 8);
  const format = await getShopSetting(env, "reg_number_format", "{CODE}-{YY}{MM}-{SEQ4}");
  const now = new Date();
  const yymm = String(now.getFullYear()).slice(-2) + String(now.getMonth() + 1).padStart(2, "0");

  // Allocate sequence atomically-ish in D1
  let seq = 1;
  const existing = await env.DB.prepare("SELECT last_seq FROM reg_number_seq WHERE yymm=?").bind(yymm).first();
  if (existing) {
    seq = existing.last_seq + 1;
    await env.DB.prepare("UPDATE reg_number_seq SET last_seq=? WHERE yymm=?").bind(seq, yymm).run();
  } else {
    await env.DB.prepare("INSERT INTO reg_number_seq (yymm, last_seq) VALUES (?, ?)").bind(yymm, seq).run();
  }

  const num = formatRegNumber({ code, date: now, seq, format });
  await env.DB.prepare("UPDATE customers SET registration_number=?, updated_at=? WHERE id=? AND (registration_number IS NULL OR registration_number='')")
    .bind(num, Date.now(), customerId).run();

  // Re-read in case of race
  const again = await env.DB.prepare("SELECT registration_number FROM customers WHERE id=?").bind(customerId).first();
  return again.registration_number || num;
}
