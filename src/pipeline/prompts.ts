export function buildExtractPrompt(
  topics: { name: string; description: string; priorExtraction: string }[],
  newSource: string
): string {
  const topicList = topics
    .map(
      (t, i) =>
        `${i + 1}. ${t.name} — ${t.description}\n   Prior version content:\n   ${
          t.priorExtraction.trim() || '[no prior version]'
        }`
    )
    .join('\n\n');

  return `You are analyzing a source document against a set of known learning topics.

Known topics (referenced by number), each with its prior version content:
${topicList}

New source document:
---
${newSource}
---

Do two things:

1) For EACH known topic above, extract the passages from the NEW source relevant
   to it, VERBATIM (copy exactly — do not paraphrase). Set "drifted": true if the
   topic's content in the new source meaningfully differs from its prior version
   content shown above; set "drifted": false if it is essentially the same.

2) Identify any substantive content in the new source that does NOT belong to any
   of the known topics above. Return each such passage as an "unmatched" item.

Return a JSON object:
{
  "existing": [{ "index": <topic number>, "extractedContent": "<verbatim>", "drifted": <bool> }],
  "unmatched": [{ "content": "<verbatim passage not covered by any known topic>" }]
}

Include one "existing" entry per known topic, using its number as "index".
If nothing in the source is unmatched, return "unmatched": [].`;
}

export function buildDriftPrompt(
  topicName: string,
  oldContent: string,
  newContent: string
): string {
  return `You are analyzing how content about a specific topic has changed between two versions of a source document.

Topic: "${topicName}"

Previous version content:
---
${oldContent}
---

New version content:
---
${newContent}
---

Analyze the semantic difference. Return a JSON object with:
- changeType: one of "NO_CHANGE" | "MINOR_EDIT" | "SEMANTIC_CHANGE" | "MAJOR_RESTRUCTURE" | "CONTENT_REMOVED"
- driftScore: float 0.0 to 1.0 (0 = identical meaning, 1 = completely different)
- requiresRepair: boolean (true if learning content grounded in this topic needs updating)
- reason: one sentence explaining the most significant change`;
}

export function buildGeneratePrompt(
  topicName: string,
  description: string,
  extractedContent: string
): string {
  return `You are generating learning content for a professional certification exam.

Topic: "${topicName}"
Description: "${description}"

Source content:
---
${extractedContent}
---

Generate a JSON object with exactly these fields:
- lesson: a clear, concise explanation of the key concept a learner must understand (2-4 sentences)
- questions: an array of MCQ questions. Generate as many as the content depth warrants — more content means more questions, shallow content means fewer. Each question must have:
  - question: the question text
  - options: array of exactly 4 answer strings. The correct answer MUST be one of these 4 strings. The other 3 must be plausible but incorrect distractors.
  - correctIndex: zero-based index (0–3) pointing to the correct answer within the options array. Double-check that options[correctIndex] is indeed the correct answer before finalising.
  - rationale: one sentence explaining why that option is correct, grounded in the source

All content must come only from the provided source.`;
}

export function buildProposeTopicsPrompt(unmatched: string[]): string {
  const blocks = unmatched.map((c, i) => `Passage ${i + 1}:\n${c}`).join('\n\n---\n\n');

  return `The following passages were found in a source document and do NOT belong
to any existing learning topic. Structure them into new learning topics for a
professional certification exam.

Unmatched passages:
===
${blocks}
===

Return a JSON object with a single key "topics" whose value is an array of objects,
each with:
- name: short topic name (3-6 words)
- description: one sentence describing what this topic covers
- extractedContent: the verbatim passage(s) relevant to this topic

Merge passages that describe the same concept into one topic. Drop any passage too
thin to be a real topic. If none qualify, return {"topics": []}.`;
}
