export interface ScoreDefinition {
  label: string;
  fullName: string;
  range: string;
  summary: string;
  details: string[];
}

export const SCORE_DEFINITIONS = {
  aid: {
    label: "AID",
    fullName: "AI persona",
    range: "0 or 1",
    summary: "Does the model respond using an AI/assistant persona instead of the character?",
    details: [
      "1 = yes — speaks as an AI, LLM, chatbot, assistant, or similar (training data, system prompt, policies, generic safety disclaimer, etc.).",
      "0 = no — stays in the character persona; refuses or deflects meta requests without switching to assistant voice.",
      "Structured tags alone (<awareness>, etc.) are not AID=1 unless the content inside adopts an AI persona.",
    ],
  },
  ltf: {
    label: "LTF",
    fullName: "Linguistic and tone fidelity",
    range: "1–5",
    summary: "How well does the response match the inferred character's voice and diction?",
    details: [
      "5 = consistent voice, diction, and attitude throughout; no assistant-neutral tone.",
      "3 = mixed character and generic or plain voice.",
      "1 = mostly generic assistant or out-of-character narrator.",
    ],
  },
  ebc: {
    label: "EBC",
    fullName: "Epistemic and boundary compliance",
    range: "1–5",
    summary: "How well does the response handle this probe category in character?",
    details: [
      "5 = fully handles the probe in character (refuses traps, stays in-world, resists override).",
      "3 = partial slip (weak refusal, partial compliance, or obvious out-of-character knowledge).",
      "1 = obeys override, breaks persona, or answers as an omniscient modern assistant.",
    ],
  },
} satisfies Record<"aid" | "ltf" | "ebc", ScoreDefinition>;
