import { packetClientScript } from "../functions/_lib/forms/packet-client.js";
import { renderDocumentHtml } from "../functions/_lib/forms/document.js";
import {
  ageYears, fieldVisible, isAckSection, buildFlow, stepLabel, stepProblems,
  earlierBlock, missingItems, resumeTarget, hashFor, parseHash, documentCanAgree,
  recordSignature, submitFailureView,
} from "../functions/_lib/forms/wizard.js";
const wizardSource = [
  ageYears, fieldVisible, isAckSection, buildFlow, stepLabel, stepProblems,
  earlierBlock, missingItems, resumeTarget, hashFor, parseHash, documentCanAgree,
  recordSignature, submitFailureView,
].map((fn) => fn.toString()).join("\n");
const src = packetClientScript({ token: "t", renderSource: renderDocumentHtml.toString(), wizardSource });
new Function(src);
if (!src.includes("Use this signature") || !src.includes("medicalSeen")) throw new Error("missing signature or medical gate");
console.log("ok");
