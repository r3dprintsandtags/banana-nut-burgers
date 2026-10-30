/** SSI Diver Medical Participant Questionnaire — verbatim page 1 + boxes A–G. */
import fs from "fs";

const note = (key, en, es, variant = "info") => ({
  key,
  type: "note",
  variant,
  label: { en, es },
});

const yn = (key, en, es) => ({
  key,
  type: "yes_no",
  required: true,
  sensitive: true,
  label: { en, es },
});

const SHOW = { A: "dm_q1", B: "over_45", C: "dm_q4", D: "dm_q6", E: "dm_q7", F: "dm_q8", G: "dm_q9" };
const box = (id, en, es) => ({
  show_if: { field: SHOW[id.split("_")[2]], op: "eq", value: "yes" },
  key: id,
  type: "checkbox",
  sensitive: true,
  label: { en, es },
});

const schema = {
  key: "diver_medical",
  consent: {
    required: true,
    version: "dm-v4-ssi",
    text: {
      en: "I have answered all questions honestly, and understand that I accept responsibility for any consequences resulting from any questions I may have answered inaccurately or for my failure to disclose any existing or past health conditions.",
      es: "Respondí todas las preguntas con honestidad y acepto la responsabilidad por las consecuencias de cualquier respuesta inexacta o por no revelar condiciones de salud actuales o pasadas.",
    },
  },
  sections: [
    {
      id: "dm_main",
      title: { en: "Part 1 — General health", es: "Parte 1 — Salud general" },
      fields: [
        note(
          "dm_intro",
          "Recreational scuba diving and freediving require good physical and mental health. Some medical conditions can be hazardous while diving. If you have, or are predisposed to, any of these conditions, you should be evaluated by a physician. If you feel ill, do not dive. If you may have a contagious disease, do not join dive training or dive activities. “Diving” here means recreational scuba and freediving. Answer every question honestly.",
          "El buceo recreativo y la apnea requieren buena salud física y mental. Algunas condiciones médicas son peligrosas al bucear. Si tiene o está predispuesto a alguna, debe evaluarlo un médico. Si se siente enfermo, no bucee. Si puede tener una enfermedad contagiosa, no participe en entrenamiento ni actividades de buceo. “Buceo” incluye buceo recreativo y apnea. Responda con honestidad."
        ),
        note(
          "dm_pregnant",
          "Note to women: If you are pregnant, or attempting to become pregnant, do not dive.",
          "Nota para mujeres: si está embarazada o intentando quedar embarazada, no bucee.",
          "warn"
        ),
        note(
          "dm_directions",
          "If you answer NO to all 10 questions, a medical evaluation is not required. Sign the participant statement. If you answer YES to questions 3, 5, or 10, or you check any box on the next page, Banana Nut Burger Dive Shop staff will review your form before you dive. You can still submit. You are not blocked.",
          "Si responde NO a las 10 preguntas, no se requiere evaluación médica. Firme la declaración. Si responde SÍ a las preguntas 3, 5 o 10, o marca cualquier casilla en la página siguiente, el personal de Banana Nut Burger Dive Shop revisará su formulario antes de bucear. Puede enviar igual. No queda bloqueado.",
          "warn"
        ),
        yn(
          "dm_q1",
          "1. I have had problems with my lungs, breathing, heart and/or blood affecting my normal physical or mental performance.",
          "1. He tenido problemas de pulmones, respiración, corazón y/o sangre que afectan mi rendimiento físico o mental normal."
        ),
        {
          key: "over_45",
          type: "yes_no",
          required: true,
          label: {
            en: "2. I am over 45 years of age.",
            es: "2. Tengo más de 45 años.",
          },
        },
        yn(
          "dm_q3",
          "3. I struggle to perform moderate exercise (for example, walk 1.6 kilometer/one mile in 14 minutes or swim 200 meters/yards without resting), or I have been unable to participate in a normal physical activity due to fitness or health reasons within the past 12 months.",
          "3. Me cuesta hacer ejercicio moderado (por ejemplo, caminar 1.6 km / una milla en 14 minutos o nadar 200 metros/yardas sin descansar), o no he podido hacer actividad física normal por condición física o salud en los últimos 12 meses."
        ),
        yn(
          "dm_q4",
          "4. I have had problems with my eyes, ears, or nasal passages/sinuses or teeth.",
          "4. He tenido problemas de ojos, oídos, fosas nasales/senos paranasales o dientes."
        ),
        yn(
          "dm_q5",
          "5. I have had surgery within the last 12 months, or I have ongoing problems related to past surgery.",
          "5. Tuve cirugía en los últimos 12 meses, o tengo problemas continuos por una cirugía anterior."
        ),
        yn(
          "dm_q6",
          "6. I have lost consciousness, had migraine headaches, seizures, stroke, significant head injury, or suffer from persistent neurologic injury or disease. I have a condition where sudden neurological compromise/impairment is possible.",
          "6. He perdido el conocimiento, tenido migrañas, convulsiones, derrame, lesión grave en la cabeza, o padezco lesión o enfermedad neurológica persistente. Tengo una condición en la que es posible un deterioro neurológico súbito."
        ),
        yn(
          "dm_q7",
          "7. I am currently undergoing treatment (or have required treatment within the last five years) for psychological problems, personality disorder, panic attacks, or an addiction to drugs or alcohol; or, I have been diagnosed with a learning or developmental disability.",
          "7. Estoy en tratamiento (o lo necesité en los últimos cinco años) por problemas psicológicos, trastorno de personalidad, ataques de pánico o adicción a drogas o alcohol; o me diagnosticaron una discapacidad de aprendizaje o del desarrollo."
        ),
        yn(
          "dm_q8",
          "8. I have had back problems, hernia, ulcers, or diabetes.",
          "8. He tenido problemas de espalda, hernia, úlceras o diabetes."
        ),
        yn(
          "dm_q9",
          "9. I have had stomach or intestine problems, including recent diarrhea.",
          "9. He tenido problemas de estómago o intestino, incluida diarrea reciente."
        ),
        yn(
          "dm_q10",
          "10. I am currently taking one or more prescription medications. (This need not include birth control, menopausal hormone replacement, and antimalarial medication unless it is mefloquine [Lariam].)",
          "10. Actualmente tomo uno o más medicamentos con receta. (No incluye anticonceptivos, terapia hormonal de menopausia ni antimaláricos, salvo mefloquina [Lariam].)"
        ),
      ],
    },
    {
      id: "dm_boxes",
      title: { en: "Part 2 — Detailed medical history", es: "Parte 2 — Historial médico detallado" },
      fields: [
        note(
          "dm_box_intro",
          "Check any condition that applies. Any checked box flags this form for Banana Nut Burger Dive Shop staff review. Leave a box unchecked if it does not apply.",
          "Marque cualquier condición que aplique. Cualquier casilla marcada envía el formulario a revisión del personal de Banana Nut Burger Dive Shop. Déjela sin marcar si no aplica."
        ),
        { ...note("dm_hA", "BOX A — I HAVE/HAVE HAD:", "CASILLA A — TENGO / HE TENIDO:", "heading"), show_if: { field: "dm_q1", op: "eq", value: "yes" } },
        box("dm_box_A_1", "Chest surgery, heart surgery, heart valve surgery, an implantable medical device (eg, stent, pacemaker, neurostimulator), pneumothorax, and/or chronic lung disease.", "Cirugía de tórax, corazón o válvula cardíaca, dispositivo implantable (stent, marcapasos, neuroestimulador), neumotórax y/o enfermedad pulmonar crónica."),
        box("dm_box_A_2", "Asthma, wheezing, severe allergies, hay fever or congested airways within the last 12 months that limits my physical activity/exercise.", "Asma, sibilancias, alergias graves, fiebre del heno o vías congestionadas en los últimos 12 meses que limitan mi actividad física."),
        box("dm_box_A_3", "A problem or illness involving my heart such as: angina, chest pain on exertion, heart failure, immersion pulmonary edema, heart attack or stroke, or am taking medication for any heart condition.", "Un problema del corazón como angina, dolor de pecho al esfuerzo, insuficiencia cardíaca, edema pulmonar por inmersión, infarto o derrame, o tomo medicamento para el corazón."),
        box("dm_box_A_4", "Recurrent bronchitis and currently coughing within the past 12 months, or have been diagnosed with emphysema.", "Bronquitis recurrente y tos actual en los últimos 12 meses, o diagnóstico de enfisema."),
        box("dm_box_A_5", "Symptoms affecting my lungs, breathing, heart and/or blood in the last 30 days that impair my physical or mental performance.", "Síntomas de pulmones, respiración, corazón y/o sangre en los últimos 30 días que limitan mi rendimiento físico o mental."),

        note("dm_hB", "BOX B — I AM OVER 45 YEARS OF AGE AND:", "CASILLA B — TENGO MÁS DE 45 AÑOS Y:", "heading"),
        box("dm_box_B_1", "I currently smoke or inhale nicotine by other means.", "Actualmente fumo o inhalo nicotina de otra forma."),
        box("dm_box_B_2", "I have a high cholesterol level.", "Tengo el colesterol alto."),
        box("dm_box_B_3", "I have high blood pressure.", "Tengo la presión arterial alta."),
        box("dm_box_B_4", "I have had a close blood relative die suddenly or of cardiac disease or stroke before the age of 50, or have a family history of heart disease before age 50 (including abnormal heart rhythms, coronary artery disease or cardiomyopathy).", "Un familiar cercano murió de forma súbita o por enfermedad cardíaca o derrame antes de los 50, o hay antecedentes familiares de enfermedad cardíaca antes de los 50 (arritmias, enfermedad coronaria o miocardiopatía)."),

        note("dm_hC", "BOX C — I HAVE/HAVE HAD:", "CASILLA C — TENGO / HE TENIDO:", "heading"),
        box("dm_box_C_1", "Sinus surgery within the last 6 months.", "Cirugía de senos paranasales en los últimos 6 meses."),
        box("dm_box_C_2", "Ear disease or ear surgery, hearing loss, or problems with balance.", "Enfermedad o cirugía de oído, pérdida auditiva o problemas de equilibrio."),
        box("dm_box_C_3", "Recurrent sinusitis within the past 12 months.", "Sinusitis recurrente en los últimos 12 meses."),
        box("dm_box_C_4", "Eye surgery within the past 3 months.", "Cirugía ocular en los últimos 3 meses."),

        note("dm_hD", "BOX D — I HAVE/HAVE HAD:", "CASILLA D — TENGO / HE TENIDO:", "heading"),
        box("dm_box_D_1", "Head injury with loss of consciousness within the past 5 years.", "Lesión en la cabeza con pérdida de conocimiento en los últimos 5 años."),
        box("dm_box_D_2", "Persistent neurologic injury or disease, to include episodic and/or unpredictable loss, reduction, or change in neurological, cognitive, or motor function or performance.", "Lesión o enfermedad neurológica persistente, incluida pérdida, reducción o cambio episódico o impredecible de la función neurológica, cognitiva o motora."),
        box("dm_box_D_3", "Recurring migraine headaches within the past 12 months, or take medications to prevent them.", "Migrañas recurrentes en los últimos 12 meses, o tomo medicamentos para prevenirlas."),
        box("dm_box_D_4", "Blackouts or fainting (full/partial loss of consciousness) within the last 5 years.", "Desmayos o pérdida total o parcial del conocimiento en los últimos 5 años."),
        box("dm_box_D_5", "Epilepsy, seizures, or convulsions, or take medications to prevent them.", "Epilepsia, convulsiones, o tomo medicamentos para prevenirlas."),

        note("dm_hE", "BOX E — I HAVE/HAVE HAD:", "CASILLA E — TENGO / HE TENIDO:", "heading"),
        box("dm_box_E_1", "Behavioral health, mental, or psychological problems requiring medical/psychiatric treatment.", "Problemas de salud conductual, mental o psicológica que requieren tratamiento médico o psiquiátrico."),
        box("dm_box_E_2", "Major depression, suicidal ideation, panic attacks, uncontrolled bipolar disorder requiring medication/psychiatric treatment.", "Depresión mayor, ideación suicida, ataques de pánico o trastorno bipolar no controlado que requiere medicamento o tratamiento psiquiátrico."),
        box("dm_box_E_3", "Been diagnosed with a mental health condition or a learning/developmental disorder that requires ongoing care or special accommodation.", "Diagnóstico de una condición de salud mental o un trastorno de aprendizaje/desarrollo que requiere cuidado continuo o adaptación especial."),
        box("dm_box_E_4", "An addiction to drugs or alcohol requiring treatment within the last 5 years.", "Adicción a drogas o alcohol que requirió tratamiento en los últimos 5 años."),

        note("dm_hF", "BOX F — I HAVE/HAVE HAD:", "CASILLA F — TENGO / HE TENIDO:", "heading"),
        box("dm_box_F_1", "Recurrent back problems in the last 6 months that limit my everyday activity.", "Problemas de espalda recurrentes en los últimos 6 meses que limitan mi actividad diaria."),
        box("dm_box_F_2", "Back or spinal surgery within the last 12 months.", "Cirugía de espalda o columna en los últimos 12 meses."),
        box("dm_box_F_3", "Diabetes, either drug or diet controlled, or gestational diabetes within the last 12 months.", "Diabetes controlada con medicamento o dieta, o diabetes gestacional en los últimos 12 meses."),
        box("dm_box_F_4", "An uncorrected hernia that limits my physical abilities.", "Una hernia no corregida que limita mis capacidades físicas."),
        box("dm_box_F_5", "Active or untreated ulcers, problem wounds, or ulcer surgery within the last 6 months.", "Úlceras activas o sin tratar, heridas problemáticas, o cirugía de úlcera en los últimos 6 meses."),

        note("dm_hG", "BOX G — I HAVE HAD:", "CASILLA G — HE TENIDO:", "heading"),
        box("dm_box_G_1", "Ostomy surgery and do not have medical clearance to swim or engage in physical activity.", "Cirugía de ostomía y no tengo autorización médica para nadar o hacer actividad física."),
        box("dm_box_G_2", "Dehydration requiring medical intervention within the last 7 days.", "Deshidratación que requirió atención médica en los últimos 7 días."),
        box("dm_box_G_3", "Active or untreated stomach or intestinal ulcers or ulcer surgery within the last 6 months.", "Úlceras de estómago o intestino activas o sin tratar, o cirugía de úlcera en los últimos 6 meses."),
        box("dm_box_G_4", "Frequent heartburn, regurgitation, or gastroesophageal reflux disease (GERD).", "Acidez frecuente, regurgitación o enfermedad por reflujo gastroesofágico (ERGE)."),
        box("dm_box_G_5", "Active or uncontrolled ulcerative colitis or Crohn’s disease.", "Colitis ulcerosa o enfermedad de Crohn activa o no controlada."),
        box("dm_box_G_6", "Bariatric surgery within the last 12 months.", "Cirugía bariátrica en los últimos 12 meses."),

        note("dm_hDental", "Dental", "Dental", "heading"),
        {
          key: "dm_dental",
          type: "yes_no",
          required: true,
          sensitive: true,
          label: {
            en: "Still healing or recovering from a recent dental or oral procedure?",
            es: "¿Aún está sanando o recuperándose de un procedimiento dental u oral reciente?",
          },
        },
      ],
    },
  ],
};

for (const f of schema.sections[1].fields) {
  const m = String(f.key).match(/^dm_h([A-G])$/);
  if (m) f.show_if = { field: SHOW[m[1]], op: "eq", value: "yes" };
}

const json = JSON.stringify(schema);
const sql = `-- SSI Diver Medical verbatim questions + boxes A–G (staff review)
UPDATE form_templates
SET schema_json = '${json.replace(/'/g, "''")}',
    version = '5',
    updated_at = strftime('%s','now') * 1000
WHERE key = 'diver_medical';
`;
fs.writeFileSync("migrations/0011_diver_medical_boxes.sql", sql);
fs.writeFileSync("forms-source/diver_medical.schema.json", JSON.stringify(schema, null, 2));
console.log("Wrote migrations/0009_diver_medical_ssi.sql and forms-source/diver_medical.schema.json");
console.log("Fields:", schema.sections.reduce((n, s) => n + s.fields.length, 0));
