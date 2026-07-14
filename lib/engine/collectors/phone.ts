import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { Collector, CollectorContext, CollectorOutcome } from "../collector";

const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

export const phoneCollector: Collector = {
  id: "phone",
  label: "Phone metadata",
  description: "Validates the number and derives country, region and line type",
  appliesTo: (id) => id.type === "phone",

  async run(ctx: CollectorContext): Promise<CollectorOutcome> {
    const { graph, identifier } = ctx;
    const raw = identifier.raw;
    const parsed = parsePhoneNumberFromString(
      raw.startsWith("+") ? raw : `+${identifier.value}`
    );

    if (!parsed) {
      graph.note(
        "caution",
        `"${raw}" could not be parsed as a valid international phone number. Without a country code, reliable analysis isn't possible.`
      );
      const ev = graph.addEvidence({
        sourceId: "phone",
        sourceLabel: "Phone metadata",
        title: "Unparseable number",
        detail: `The value "${raw}" does not form a valid phone number in E.164 format. Provide a country code (e.g. +1) for analysis.`,
        weight: 0.4,
      });
      graph.upsertEntity({
        type: "phone",
        label: identifier.value,
        attributes: { Status: "Invalid / incomplete" },
        evidenceIds: [ev],
        sources: ["phone"],
      });
      return { count: 1, note: "invalid" };
    }

    const country = parsed.country;
    const countryName = country
      ? COUNTRY_NAMES.of(country) ?? country
      : "unknown region";
    const type = parsed.getType();
    const valid = parsed.isValid();

    const ev = graph.addEvidence({
      sourceId: "phone",
      sourceLabel: "Phone metadata",
      title: valid ? "Valid phone number" : "Structurally plausible number",
      detail: `${parsed.formatInternational()} is a ${
        valid ? "valid" : "possibly valid"
      } number assigned to ${countryName}${
        type ? `, line type: ${humanType(type)}` : ""
      }.`,
      weight: valid ? 0.75 : 0.5,
    });
    graph.upsertEntity({
      type: "phone",
      label: identifier.value,
      sub: `${parsed.formatInternational()} · ${countryName}`,
      attributes: pruneAttrs({
        Formatted: parsed.formatInternational(),
        "E.164": parsed.number,
        Country: countryName,
        "Country code": country ? `+${parsed.countryCallingCode}` : "",
        "Line type": type ? humanType(type) : "unknown",
        Valid: valid ? "Yes" : "Uncertain",
      }),
      evidenceIds: [ev],
      sources: ["phone"],
    });

    graph.note(
      "observe",
      `The number is ${
        valid ? "valid" : "structurally plausible"
      } and registered to ${countryName}${
        type ? ` as a ${humanType(type)} line` : ""
      }.`
    );
    graph.note(
      "caution",
      "Free sources cannot confirm the current owner or carrier of a phone number. Treat ownership as unverified and cross-check against the platform where you received it."
    );

    return {
      count: 1,
      note: valid ? `${countryName}` : "uncertain",
    };
  },
};

function humanType(t: string): string {
  const map: Record<string, string> = {
    MOBILE: "mobile",
    FIXED_LINE: "landline",
    FIXED_LINE_OR_MOBILE: "landline or mobile",
    VOIP: "VoIP",
    TOLL_FREE: "toll-free",
    PREMIUM_RATE: "premium-rate",
    PERSONAL_NUMBER: "personal",
    PAGER: "pager",
    UAN: "corporate (UAN)",
  };
  return map[t] ?? t.toLowerCase().replace(/_/g, " ");
}

function pruneAttrs(a: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(a).filter(([, v]) => v && v.trim()));
}
