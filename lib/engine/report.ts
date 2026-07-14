import { bandLabel, pct } from "./confidence";
import type {
  Entity,
  Evidence,
  Identifier,
  InvestigatorNote,
  Relationship,
  Report,
  RiskLevel,
  TimelineItem,
  VerificationTier,
} from "./types";

export interface ReportInput {
  identifier: Identifier;
  entities: Entity[];
  relationships: Relationship[];
  evidence: Evidence[];
  notes: InvestigatorNote[];
  timeline: TimelineItem[];
}

const TYPE_NOUN: Record<string, string> = {
  email: "email address",
  phone: "phone number",
  username: "username",
  domain: "domain",
  url: "website",
};

/**
 * Deterministic report built from the assembled graph, no model in the loop.
 * This is the source of truth; the AI layer only rewrites prose fields on top.
 */
export function buildReport(input: ReportInput): Report {
  const { identifier, entities, relationships, evidence, notes } = input;

  const degree = new Map<string, number>();
  for (const r of relationships) {
    degree.set(r.from, (degree.get(r.from) ?? 0) + 1);
    degree.set(r.to, (degree.get(r.to) ?? 0) + 1);
  }
  const byType = (t: Entity["type"]) => entities.filter((e) => e.type === t);

  const persons = byType("person").sort(
    (a, b) =>
      b.confidence + (degree.get(b.id) ?? 0) / 10 -
      (a.confidence + (degree.get(a.id) ?? 0) / 10)
  );
  const usernames = new Set<string>();
  byType("username").forEach((u) => usernames.add(u.label));
  const socials = byType("social_profile");
  // accounts tied to the subject vs same-handle guesses
  const ownedSocials = socials.filter((s) => s.verification !== "unverified");
  const confirmedCount = socials.filter((s) => s.verification === "confirmed").length;
  const websites = [...byType("website"), ...byType("domain")];
  const orgs = byType("organization");
  const emails = byType("email");
  const phones = byType("phone");
  const repos = byType("repository");

  const topPerson = persons[0];
  const noun = TYPE_NOUN[identifier.type] ?? "identifier";
  let mostLikelyIdentity: string;
  let identityConfidence: number;
  if (topPerson) {
    mostLikelyIdentity = topPerson.label;
    identityConfidence = topPerson.confidence;
  } else if (orgs.length) {
    mostLikelyIdentity = `${orgs[0].label} (organization, not an individual)`;
    identityConfidence = orgs[0].confidence;
  } else if (websites.length) {
    mostLikelyIdentity = `Unattributed — the ${noun} resolves to ${websites[0].label}, but no named individual could be confirmed`;
    identityConfidence = websites[0].confidence * 0.7;
  } else {
    mostLikelyIdentity = `Inconclusive — not enough public evidence to attribute this ${noun} to a specific person`;
    identityConfidence = 0.2;
  }

  const digitalFootprint: string[] = [];
  const platforms = new Set(socials.map((s) => s.sub ?? s.label));
  if (platforms.size)
    digitalFootprint.push(
      `Present on ${platforms.size} platform${
        platforms.size === 1 ? "" : "s"
      }: ${[...platforms].slice(0, 8).join(", ")}.${
        confirmedCount
          ? ` ${confirmedCount} confirmed as the same owner${
              socials.length - confirmedCount > 0
                ? `; the rest share the handle but are unverified`
                : ""
            }.`
          : socials.length
          ? " These share the handle but ownership is unverified."
          : ""
      }`
    );
  if (repos.length)
    digitalFootprint.push(
      `Publishes code — ${repos.length} public ${
        repos.length === 1 ? "repository" : "repositories"
      } discovered.`
    );
  if (websites.length)
    digitalFootprint.push(
      `Associated with ${websites.length} website/domain${
        websites.length === 1 ? "" : "s"
      }: ${websites.slice(0, 4).map((w) => w.label).join(", ")}.`
    );
  if (emails.length)
    digitalFootprint.push(
      `${emails.length} email address${
        emails.length === 1 ? "" : "es"
      } surfaced in public sources.`
    );
  if (phones.length)
    digitalFootprint.push(`${phones.length} phone number(s) referenced publicly.`);
  if (!digitalFootprint.length)
    digitalFootprint.push(
      "Minimal public footprint — few or no corroborating sources were found."
    );

  const tierRank: Record<VerificationTier, number> = {
    confirmed: 0,
    likely: 1,
    unverified: 2,
  };
  const knownAccounts = socials
    .map((s) => ({
      platform: s.sub ?? "Profile",
      url: s.attributes.URL || urlFromEvidence(s, evidence) || "",
      verification: (s.verification ?? "unverified") as VerificationTier,
    }))
    .filter((a) => a.url)
    .sort((a, b) => tierRank[a.verification] - tierRank[b.verification]);

  // neutral caveats worth double-checking, not danger flags
  const cautionNotes = notes.filter((n) => n.level === "caution");
  const scamIndicators: string[] = [];
  cautionNotes.forEach((n) => scamIndicators.push(n.message));

  const footprint = platforms.size + websites.length + emails.length + repos.length;
  const distinctSourcesEarly = new Set(
    evidence.filter((e) => e.sourceId !== "seed").map((e) => e.sourceId)
  ).size;
  // riskLevel repurposed as a corroboration signal: clear = well corroborated,
  // low = thin footprint
  let riskLevel: RiskLevel;
  if (footprint <= 1 || distinctSourcesEarly <= 1) riskLevel = "low";
  else riskLevel = "clear";

  const strong = [...evidence]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6)
    .map((e) => `${e.title} — ${e.sourceLabel}.`);

  const conflicting: string[] = [];
  if (persons.length > 1) {
    conflicting.push(
      `Multiple candidate names appeared (${persons
        .slice(0, 3)
        .map((p) => p.label)
        .join(
          ", "
        )}). They may be the same person under different spellings, or unrelated accounts that merely share an identifier.`
    );
  }
  cautionNotes
    .filter((n) => /guess|unconfirmed|not proof|weak|cannot confirm/i.test(n.message))
    .forEach((n) => conflicting.push(n.message));
  if (!conflicting.length)
    conflicting.push("No directly contradictory evidence was found.");

  const distinctSources = new Set(evidence.map((e) => e.sourceId)).size;
  const corroborated = relationships.filter(
    (r) => new Set(r.evidenceIds.map((id) => evById(evidence, id)?.sourceId)).size > 1
  ).length;
  const confidenceExplanation = buildConfidenceExplanation(
    distinctSources,
    corroborated,
    identityConfidence,
    topPerson ? topPerson.label : null
  );

  const nextSteps = buildNextSteps(input, {
    hasPerson: !!topPerson,
    thin: digitalFootprint.length === 1,
  });

  // exposure counts accounts tied to the subject, not same-handle hits, so the
  // score isn't inflated
  const ownedPlatforms = new Set(ownedSocials.map((s) => s.sub ?? s.label));
  const exposure = computeExposure({
    socials: ownedSocials.length,
    platforms: ownedPlatforms.size,
    emails: emails.length,
    phones: phones.length,
    websites: websites.length,
    repos: repos.length,
    hasName: !!topPerson && topPerson.confidence >= 0.5,
    linked: topPerson ? degree.get(topPerson.id) ?? 0 : 0,
  });

  const executiveSummary = buildExecSummary({
    noun,
    value: identifier.raw,
    mostLikelyIdentity,
    identityConfidence,
    distinctSources,
    entityCount: entities.length,
    riskLevel,
    platforms: platforms.size,
  });

  return {
    executiveSummary,
    mostLikelyIdentity,
    identityConfidence,
    exposureScore: exposure.score,
    exposureBand: exposure.band,
    exposureFactors: exposure.factors,
    digitalFootprint,
    associatedUsernames: [...usernames],
    associatedWebsites: websites.map((w) => w.label),
    possibleOrganizations: orgs.map((o) => o.label),
    knownAccounts,
    riskLevel,
    scamIndicators,
    supportingEvidence: strong,
    conflictingEvidence: conflicting,
    confidenceExplanation,
    nextSteps,
    aiGenerated: false,
  };
}

function buildExecSummary(a: {
  noun: string;
  value: string;
  mostLikelyIdentity: string;
  identityConfidence: number;
  distinctSources: number;
  entityCount: number;
  riskLevel: RiskLevel;
  platforms: number;
}): string {
  const conf = `${bandLabel(a.identityConfidence).toLowerCase()} confidence (${pct(
    a.identityConfidence
  )}%)`;
  const riskLine =
    a.riskLevel === "clear"
      ? "The footprint is corroborated across multiple independent sources."
      : "The public footprint is limited, so the attribution rests on fewer signals.";
  return `We investigated the ${a.noun} "${a.value}" across ${a.distinctSources} independent public source${
    a.distinctSources === 1 ? "" : "s"
  } and assembled ${a.entityCount} connected ${
    a.entityCount === 1 ? "entity" : "entities"
  }. Most likely attribution: ${a.mostLikelyIdentity} — ${conf}. ${riskLine}`;
}

function buildConfidenceExplanation(
  sources: number,
  corroborated: number,
  identityConfidence: number,
  person: string | null
): string {
  const parts: string[] = [];
  parts.push(
    `Findings were drawn from ${sources} independent source${
      sources === 1 ? "" : "s"
    }.`
  );
  if (corroborated > 0)
    parts.push(
      `${corroborated} relationship${
        corroborated === 1 ? " was" : "s were"
      } confirmed by more than one source, which raises confidence.`
    );
  else
    parts.push(
      "Most links rest on a single source; treat any that are not independently corroborated with caution."
    );
  if (person)
    parts.push(
      `Attribution to ${person} is rated ${bandLabel(
        identityConfidence
      ).toLowerCase()} (${pct(
        identityConfidence
      )}%). ${
        identityConfidence < 0.5
          ? "This is a lead, not a confirmation."
          : "Corroborating signals support this, but manual verification is still recommended."
      }`
    );
  else
    parts.push(
      "No individual could be attributed with meaningful confidence from public data alone."
    );
  return parts.join(" ");
}

function buildNextSteps(
  input: ReportInput,
  flags: { hasPerson: boolean; thin: boolean }
): string[] {
  const steps: string[] = [];
  const emails = input.entities.filter((e) => e.type === "email");
  const socials = input.entities.filter((e) => e.type === "social_profile");
  if (socials.length)
    steps.push(
      "Open the linked profiles and check whether their activity, photos and post history are consistent with the claimed identity."
    );
  if (emails.length)
    steps.push(
      "Verify email deliverability and check the address against a breach-notification service such as Have I Been Pwned."
    );
  if (input.identifier.type === "phone")
    steps.push(
      "Confirm the phone number through a return call or a trusted messaging channel, and search it verbatim in quotes on a web search engine."
    );
  if (flags.thin)
    steps.push(
      "The public footprint is limited. Ask the counterparty for an additional verifiable identifier (a work email, company domain, or profile link) and re-run the investigation."
    );
  steps.push(
    "Cross-check the strongest evidence links yourself using the source URLs provided with each finding."
  );
  return steps.slice(0, 5);
}

function computeExposure(x: {
  socials: number;
  platforms: number;
  emails: number;
  phones: number;
  websites: number;
  repos: number;
  hasName: boolean;
  linked: number;
}): { score: number; band: Report["exposureBand"]; factors: Report["exposureFactors"] } {
  const factors: Report["exposureFactors"] = [];
  let score = 0;

  const acct = Math.min(34, x.socials * 4);
  if (x.socials > 0) {
    score += acct;
    factors.push({
      label: `${x.socials} public account${x.socials === 1 ? "" : "s"} across ${x.platforms} platform${x.platforms === 1 ? "" : "s"}`,
      detail: "Each linked account adds a way to find and cross-reference this identity.",
      level: x.socials >= 6 ? "high" : x.socials >= 3 ? "med" : "low",
    });
  }
  if (x.hasName) {
    score += 15;
    factors.push({
      label: "Real name is publicly discoverable",
      detail: "The identifier can be tied to a person's name from public sources.",
      level: "high",
    });
  }
  if (x.emails > 0) {
    score += Math.min(22, x.emails * 12);
    factors.push({
      label: `${x.emails} email address${x.emails === 1 ? "" : "es"} exposed publicly`,
      detail: "Public emails invite spam, phishing, and account-recovery attacks.",
      level: "high",
    });
  }
  if (x.phones > 0) {
    score += Math.min(15, x.phones * 10);
    factors.push({
      label: `${x.phones} phone number${x.phones === 1 ? "" : "s"} referenced publicly`,
      detail: "Public phone numbers enable SIM-swap and social-engineering attempts.",
      level: "high",
    });
  }
  if (x.websites > 0) {
    score += Math.min(12, x.websites * 6);
    factors.push({
      label: `${x.websites} website${x.websites === 1 ? "" : "s"} / domain${x.websites === 1 ? "" : "s"} tied to this identity`,
      detail: "Personal sites often expose additional contact details and links.",
      level: x.websites >= 2 ? "med" : "low",
    });
  }
  if (x.linked >= 3) {
    score += 12;
    factors.push({
      label: "Accounts are easily linked to one identity",
      detail: "Multiple profiles connect to the same person, making the footprint easy to assemble.",
      level: "high",
    });
  }
  if (x.repos > 0) {
    score += Math.min(6, x.repos * 2);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const band: Report["exposureBand"] =
    score >= 70 ? "significant" : score >= 45 ? "high" : score >= 20 ? "moderate" : "minimal";
  if (!factors.length)
    factors.push({
      label: "Very little is publicly discoverable",
      detail: "Almost no public footprint was found for this identifier.",
      level: "low",
    });
  return { score, band, factors };
}

function evById(evidence: Evidence[], id: string): Evidence | undefined {
  return evidence.find((e) => e.id === id);
}
function urlFromEvidence(entity: Entity, evidence: Evidence[]): string | null {
  for (const id of entity.evidenceIds) {
    const e = evidence.find((x) => x.id === id);
    if (e?.url) return e.url;
  }
  return null;
}
