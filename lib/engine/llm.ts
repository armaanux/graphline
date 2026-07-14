import Anthropic from "@anthropic-ai/sdk";
import type {
  Entity,
  Evidence,
  Identifier,
  Relationship,
  Report,
} from "./types";

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const MODEL = process.env.GRAPHLINE_MODEL || "claude-sonnet-4-6";

interface EnrichInput {
  identifier: Identifier;
  entities: Entity[];
  relationships: Relationship[];
  evidence: Evidence[];
  base: Report;
}

/**
 * Rewrite the narrative sections from the collected facts only; the prompt
 * forbids inventing anything. Returns null on any failure (no key, network,
 * parse) so the caller keeps the deterministic report.
 */
export async function enrichReportWithAI(
  input: EnrichInput
): Promise<Partial<Report> | null> {
  if (!aiAvailable()) return null;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const facts = {
    searched: { type: input.identifier.type, value: input.identifier.raw },
    entities: input.entities.map((e) => ({
      id: e.id,
      type: e.type,
      label: e.label,
      sub: e.sub,
      confidence: Math.round(e.confidence * 100),
      sources: e.sources,
      attributes: e.attributes,
    })),
    relationships: input.relationships.map((r) => ({
      from: r.from,
      to: r.to,
      why: r.label,
      confidence: Math.round(r.confidence * 100),
    })),
    evidence: input.evidence.map((e) => ({
      source: e.sourceLabel,
      title: e.title,
      detail: e.detail,
      weight: Math.round(e.weight * 100),
    })),
    deterministicFindings: {
      mostLikelyIdentity: input.base.mostLikelyIdentity,
      corroboration: input.base.riskLevel === "clear" ? "well corroborated" : "limited footprint",
      signalsToVerify: input.base.scamIndicators,
    },
  };

  const system = `You are a senior OSINT analyst writing the narrative of an investigation report. The goal is to establish whether an online identity is real and who is likely behind it — NOT to judge whether someone is a scammer. Do not use the words "scam", "fraud", "risk", or "danger"; frame everything as identity corroboration and things worth verifying.
STRICT RULES:
- Use ONLY the facts in the provided JSON. Never introduce a name, account, company, location, or claim that is not present in the facts.
- If evidence is weak or single-sourced, say so plainly. Prefer "suggests" / "is consistent with" over "proves".
- Handle reuse or a matching name is a lead, not proof of a shared owner. Reflect that.
- Be concise, factual, and calm. No hype, no filler, no markdown headers.
- Confidence must track the evidence: weak inputs => cautious language.
Respond with ONLY a JSON object, no prose around it.`;

  const user = `Facts:
${JSON.stringify(facts, null, 2)}

Write a JSON object with exactly these keys:
{
  "executiveSummary": "3-4 sentence plain-English summary of who/what this identifier appears to belong to and how sure we are",
  "mostLikelyIdentity": "one line, refined from the deterministic guess; may say 'inconclusive'",
  "confidenceExplanation": "2-3 sentences explaining why the confidence is what it is, referencing corroboration or its absence",
  "scamIndicators": ["neutral caveats worth double-checking, grounded in the facts (e.g. single-sourced links, a guessed match, a young domain); empty array if none. Never framed as accusations."],
  "nextSteps": ["3-5 concrete verification actions the user should take"]
}`;

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<Report>;
    return {
      executiveSummary: parsed.executiveSummary,
      mostLikelyIdentity: parsed.mostLikelyIdentity,
      confidenceExplanation: parsed.confidenceExplanation,
      scamIndicators: Array.isArray(parsed.scamIndicators)
        ? parsed.scamIndicators
        : undefined,
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : undefined,
      aiGenerated: true,
    };
  } catch {
    return null;
  }
}
