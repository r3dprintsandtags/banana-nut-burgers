/** Shop guardian consent until the official SSI Youth Addendum PDF is uploaded. Not SSI text. */
export const YOUTH_CONSENT = {
  en: "I am the parent or legal guardian of the participant named in this packet. I have read the agreements in this packet. I consent to this minor taking part in the dive activity. The shop will keep the official SSI Youth Addendum with this registration before the dive.",
  es: "Soy el padre, la madre o el tutor legal del participante de este paquete. Leí los acuerdos de este paquete. Autorizo a este menor a participar en la actividad de buceo. La tienda guardará el anexo juvenil oficial de SSI con este registro antes del buceo.",
};

export function youthTemplate(lang = "en") {
  return {
    id: 0,
    key: "youth_addendum",
    name: lang === "es" ? "Consentimiento del tutor" : "Guardian consent",
    version: "shop-1",
    pdf_mode: "overlay",
    pdf_r2_key: "",
    pdf_mapping_json: "{}",
    schema_json: "{}",
    schema: { key: "youth_addendum", sections: [] },
    legal: YOUTH_CONSENT[lang] || YOUTH_CONSENT.en,
  };
}
