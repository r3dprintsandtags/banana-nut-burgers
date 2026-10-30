import { OPS } from "pdfjs-dist/legacy/build/pdf.js";
const names = Object.entries(OPS).filter(([, v]) => typeof v === "number");
console.log(names.map(([k, v]) => v + " " + k).sort((a, b) => parseInt(a) - parseInt(b)).join("\n"));
