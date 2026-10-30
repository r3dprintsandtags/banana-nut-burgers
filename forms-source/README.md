# SSI PDF source files

Drop the official SSI PDFs here (filenames can match these):

| File | Template key |
|---|---|
| `TR-REGISTRATION-BD.pdf` | `try_scuba_reg` |
| `TR-INTRO-CODE.pdf` | `intro_code` |
| `TR-INTRO-FIT.pdf` | `fit_to_dive` |
| `TR-PRIVACY.pdf` | `privacy` |
| `TR-WAIVER.pdf` | `rec_waiver` |
| `Diver-Medical.pdf` | `diver_medical` |
| `Diving-Medical-Guidance.pdf` | reference only (attach when `needs_physician`) |
| Youth Addendum (later) | `youth_addendum` stub |

Then run:

```bash
npm i
npm run inspect:pdfs
```

Upload fillable PDFs to R2 under `shops/bnb/templates/` and set `form_templates.pdf_r2_key` + `pdf_mode` (`acroform` if fields exist, else `overlay`). Paste legal text from the PDF into `schema_json` consent blocks — do not rewrite SSI wording.

**Physician sections stay blank.** Instructor / facility lines are filled from shop profile at booking time (TODO admin picker for `instructor_name`).
