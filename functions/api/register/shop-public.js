/**
 * GET /api/register/shop-public
 * Public, non-sensitive shop settings for customer / kiosk flow.
 */
import { json } from "../../_shared.js";
import { getShopSetting } from "../../_lib/forms/regnum.js";

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  const auto = await getShopSetting(env, "kiosk_auto_reset", "1");
  const idleRaw = await getShopSetting(env, "kiosk_done_idle_sec", "45");
  const multi = await getShopSetting(env, "allow_device_multi_reg", "1");
  let idleSec = parseInt(idleRaw, 10);
  if (!Number.isFinite(idleSec) || idleSec < 10) idleSec = 45;
  if (idleSec > 600) idleSec = 600;
  return json({
    ok: true,
    kioskAutoReset: auto !== "0" && auto !== "false" && auto !== "off",
    kioskDoneIdleSec: idleSec,
    allowDeviceMultiReg: multi !== "0" && multi !== "false" && multi !== "off",
  });
}
