/**
 * Coordinate map for flat SSI PDFs (no AcroForm fields).
 * PDF user space, origin bottom-left. Editable without changing fill code.
 * TODO: confirm with SSI that writing dates as MM/DD/YYYY (shop default) is acceptable.
 * The printed captions still say DD/MM/YY; we do not rewrite that preprinted text.
 */

const header = (page = 0) => ([
  { page, x: 210, y: 758, source: "first_name", size: 11 },
  { page, x: 430, y: 758, source: "last_name", size: 11 },
]);

const bottomAdult = (page = 0) => ([
  { page, x: 109, y: 90, source: "full_name_print", size: 10 },
  { page, x: 330, y: 92, type: "signature", w: 150, h: 32 },
  { page, x: 494, y: 90, source: "signature_date", size: 9 },
  { page, x: 70, y: 38, w: 500, h: 22, type: "cover", when: "adult" },
  { page, x: 112, y: 58, source: "guardian_name", size: 10, when: "minor" },
  { page, x: 330, y: 58, type: "signature", source: "guardian_signature", w: 140, h: 28, when: "minor" },
  { page, x: 494, y: 58, source: "signature_date", size: 9, when: "minor" },
]);

const yn = (page, y, source) => ({ page, y, yesX: 493, noX: 534, source, type: "yes_no" });
const box = (y, source) => ({ page: 1, y, yesX: 508, noX: 544, source, type: "yes_no_check" });

export const PLACEMENTS = {
  try_scuba_reg: [
    { page: 0, x: 107, y: 648, source: "first_name", size: 11 },
    { page: 0, x: 281, y: 648, source: "last_name", size: 11 },
    { page: 0, x: 432, y: 648, source: "dob", size: 10 },
    { page: 0, x: 80, y: 586, source: "address", size: 10 },
    { page: 0, x: 80, y: 524, source: "email", size: 10 },
    { page: 0, x: 400, y: 524, source: "cell_phone", size: 10 },
    { page: 0, x: 80, y: 412, source: "emergency_contact_name", size: 10 },
    { page: 0, x: 400, y: 412, source: "emergency_contact_relationship", size: 10 },
    { page: 0, x: 80, y: 350, source: "emergency_contact_email", size: 9 },
    { page: 0, x: 400, y: 350, source: "emergency_contact_phone", size: 10 },
  ],
  intro_code: [
    ...header(0),
    { page: 0, x: 36, y: 624, source: "full_name_print", size: 8 },
    { page: 0, x: 36, y: 599, source: "training_center_name", size: 8 },
    ...bottomAdult(0),
  ],
  rec_waiver: [
    ...header(0),
    { page: 0, x: 36, y: 626, source: "full_name_print", size: 8 },
    { page: 0, x: 36, y: 600, source: "training_center_name", size: 8 },
    ...bottomAdult(0),
  ],
  privacy: [
    ...header(0), ...header(1), ...header(2),
    { page: 0, x: 170, y: 532, source: "training_center_name", size: 10 },
    { page: 0, x: 170, y: 512, source: "training_center_street", size: 9 },
    { page: 0, x: 170, y: 492, source: "training_center_zip_city", size: 9 },
    { page: 0, x: 170, y: 472, source: "training_center_state_country", size: 9 },
    { page: 2, x: 109, y: 90, source: "full_name_print", size: 10 },
    { page: 2, x: 330, y: 92, type: "signature", w: 150, h: 32 },
    { page: 2, x: 494, y: 90, source: "signature_date", size: 9 },
    { page: 2, x: 60, y: 36, w: 510, h: 22, type: "cover", when: "adult" },
    { page: 2, x: 72, y: 58, source: "guardian_name", size: 9, when: "minor" },
    { page: 2, x: 300, y: 58, type: "signature", source: "guardian_signature", w: 140, h: 28, when: "minor" },
    { page: 2, x: 494, y: 58, source: "signature_date", size: 9, when: "minor" },
  ],
  fit_to_dive: [
    ...header(0),
    { page: 0, y: 515, yesX: 472, noX: 504, source: "fit_q1", type: "yes_no" },
    { page: 0, y: 499, yesX: 472, noX: 504, source: "fit_q2", type: "yes_no" },
    { page: 0, y: 467, yesX: 472, noX: 504, source: "fit_q3", type: "yes_no" },
    { page: 0, y: 450, yesX: 472, noX: 504, source: "fit_q4", type: "yes_no" },
    { page: 0, y: 434, yesX: 472, noX: 504, source: "fit_q5", type: "yes_no" },
    { page: 0, y: 417, yesX: 472, noX: 504, source: "fit_q6", type: "yes_no" },
    { page: 0, y: 401, yesX: 472, noX: 504, source: "fit_q7", type: "yes_no" },
    { page: 0, x: 133, y: 270, type: "signature", w: 160, h: 32 },
    { page: 0, x: 139, y: 242, source: "signature_date", size: 9 },
    { page: 0, x: 340, y: 210, w: 240, h: 60, type: "cover", when: "adult" },
    { page: 0, x: 355, y: 270, type: "signature", source: "guardian_signature", w: 150, h: 28, when: "minor" },
    { page: 0, x: 400, y: 242, source: "signature_date", size: 9, when: "minor" },
  ],
  diver_medical: [
    yn(0, 570, "dm_q1"),
    yn(0, 542, "over_45"),
    yn(0, 514, "dm_q3"),
    yn(0, 487, "dm_q4"),
    yn(0, 459, "dm_q5"),
    yn(0, 431, "dm_q6"),
    yn(0, 404, "dm_q7"),
    yn(0, 376, "dm_q8"),
    yn(0, 348, "dm_q9"),
    yn(0, 321, "dm_q10"),
    { page: 0, x: 165, y: 180, source: "full_name_print", size: 10 },
    { page: 0, x: 426, y: 180, source: "dob", size: 10 },
    { page: 0, x: 80, y: 210, type: "signature", w: 180, h: 28 },
    { page: 0, x: 431, y: 210, source: "signature_date", size: 9 },
    { page: 0, x: 166, y: 148, source: "instructor_name", size: 10 },
    { page: 0, x: 429, y: 148, source: "facility_name", size: 9 },
    { page: 1, x: 130, y: 804, source: "full_name_print", size: 10 },
    { page: 1, x: 360, y: 804, source: "dob", size: 10 },
    { page: 2, x: 130, y: 804, source: "full_name_print", size: 10 },
    { page: 2, x: 360, y: 804, source: "dob", size: 10 },
    box(716, "dm_box_A_1"), box(698, "dm_box_A_2"), box(676, "dm_box_A_3"), box(659, "dm_box_A_4"), box(645, "dm_box_A_5"),
    box(610, "dm_box_B_1"), box(597, "dm_box_B_2"), box(582, "dm_box_B_3"), box(561, "dm_box_B_4"),
    box(520, "dm_box_C_1"), box(506, "dm_box_C_2"), box(491, "dm_box_C_3"), box(477, "dm_box_C_4"),
    box(442, "dm_box_D_1"), box(428, "dm_box_D_2"), box(414, "dm_box_D_3"), box(400, "dm_box_D_4"), box(386, "dm_box_D_5"),
    box(350, "dm_box_E_1"), box(336, "dm_box_E_2"), box(322, "dm_box_E_3"), box(308, "dm_box_E_4"),
    box(273, "dm_box_F_1"), box(259, "dm_box_F_2"), box(244, "dm_box_F_3"), box(230, "dm_box_F_4"), box(216, "dm_box_F_5"),
    box(180, "dm_box_G_1"), box(166, "dm_box_G_2"), box(152, "dm_box_G_3"), box(138, "dm_box_G_4"), box(124, "dm_box_G_5"), box(110, "dm_box_G_6"),
  ],
};

export function placementsFor(templateKey, mapping = {}) {
  const fromDb = Array.isArray(mapping.placements) ? mapping.placements : [];
  if (fromDb.length) return fromDb;
  return PLACEMENTS[templateKey] || [];
}
