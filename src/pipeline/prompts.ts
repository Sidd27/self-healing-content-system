export function buildExtractPrompt(
  topicName: string,
  description: string,
  sourceContent: string
): string {
  return `You are extracting verbatim content from a source document.

Topic: "${topicName}"
Topic description: "${description}"

Source document:
---
${sourceContent}
---

Extract ALL passages from the source that are directly relevant to this topic.
Copy the text VERBATIM — do not paraphrase, summarize, reorder, or add any words.
If a passage is relevant, copy it exactly as it appears.
If nothing in the source is relevant to this topic, return an empty string.

Return only the extracted passages, nothing else.`;
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

export function buildProposeTopicsPrompt(
  sourceContent: string,
  covered: { name: string; content: string }[]
): string {
  const coveredBlock =
    covered.length === 0
      ? 'None — this is the first run.'
      : covered.map((c) => `Topic: ${c.name}\n${c.content}`).join('\n\n---\n\n');

  return `You are identifying NEW learning topics from source content for a professional certification exam.

The following topics are already covered. Do NOT propose anything that overlaps with these:
===
${coveredBlock}
===

Full source content:
---
${sourceContent}
---

Find content in the source that is NOT covered by any of the topics above.
Return a JSON object with a single key "topics" whose value is an array of objects, each with:
- name: short topic name (3-6 words)
- description: one sentence describing what this topic covers
- extractedContent: verbatim passages from the source relevant to this topic

Only return genuinely new topics. If all content is already covered, return {"topics": []}.`;
}
