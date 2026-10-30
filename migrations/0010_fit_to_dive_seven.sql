UPDATE form_templates
SET schema_json = '{"key":"fit_to_dive","consent":{"required":true,"version":"ssi-fit-v2","text":{"en":"I explicitly agree to accept full responsibility for failing to disclose any past or current health condition that affects my safety while diving.","es":"Acepto la responsabilidad de no revelar cualquier condición de salud que afecte mi seguridad al bucear."}},"sections":[{"id":"fit","title":{"en":"Fit to Dive","es":"Apto para bucear"},"fields":[
{"key":"fit_q1","type":"yes_no","required":true,"sensitive":true,"label":{"en":"1. Are you currently being treated or under the care of a medical professional for a medical, mental or physical condition?","es":"1. ¿Está en tratamiento o bajo cuidado médico por una condición médica, mental o física?"}},
{"key":"fit_q2","type":"yes_no","required":true,"sensitive":true,"label":{"en":"2. Do you take prescription medication(s) (not including birth control)?","es":"2. ¿Toma medicamentos con receta (sin incluir anticonceptivos)?"}},
{"key":"fit_q3","type":"yes_no","required":true,"sensitive":true,"label":{"en":"3. A heart, circulatory, blood, blood pressure, or bleeding abnormality?","es":"3. ¿Anomalía del corazón, circulación, sangre, presión o sangrado?"}},
{"key":"fit_q4","type":"yes_no","required":true,"sensitive":true,"label":{"en":"4. A stroke, seizure, head injury, loss of consciousness, behavioral, or neurologic condition?","es":"4. ¿Derrame, convulsión, lesión en la cabeza, pérdida de conocimiento, o condición conductual o neurológica?"}},
{"key":"fit_q5","type":"yes_no","required":true,"sensitive":true,"label":{"en":"5. An ear, sinus, mouth, throat, or lung disorder — including asthma?","es":"5. ¿Trastorno de oído, senos, boca, garganta o pulmón, incluido asma?"}},
{"key":"fit_q6","type":"yes_no","required":true,"sensitive":true,"label":{"en":"6. Diabetes, severe allergies, obesity, stomach or intestinal disorders?","es":"6. ¿Diabetes, alergias graves, obesidad, o trastornos de estómago o intestino?"}},
{"key":"fit_q7","type":"yes_no","required":true,"sensitive":true,"label":{"en":"7. Musculoskeletal, stamina, strength, or mobility disorders that affect your ability to swim?","es":"7. ¿Trastornos musculoesqueléticos, de resistencia, fuerza o movilidad que afecten su capacidad de nadar?"}}
]}]}',
    version = '2',
    updated_at = strftime('%s','now') * 1000
WHERE key = 'fit_to_dive';
