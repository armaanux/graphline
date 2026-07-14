import type { Identifier, IdentifierType } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\//i;
const DOMAIN_RE =
  /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

/** Loose phone detector: 7+ digits, phone-ish characters only. */
function looksLikePhone(s: string): boolean {
  const cleaned = s.replace(/[\s().+-]/g, "");
  return /^\d{7,15}$/.test(cleaned) && /^[+\d][\d\s().+-]{6,}$/.test(s.trim());
}

/**
 * Classify a raw user string into a structured Identifier. Order matters:
 * unambiguous types are checked before the catch-all username case.
 */
export function detectIdentifier(input: string): Identifier {
  const raw = input.trim();
  const lower = raw.toLowerCase();

  if (EMAIL_RE.test(raw)) {
    const [local, domain] = raw.split("@");
    return {
      type: "email",
      raw,
      value: lower,
      parts: { local: local.toLowerCase(), domain: domain.toLowerCase() },
    };
  }

  if (URL_RE.test(raw)) {
    try {
      const u = new URL(raw);
      return {
        type: "url",
        raw,
        value: u.href,
        parts: { host: u.hostname.toLowerCase(), path: u.pathname },
      };
    } catch {
      /* fall through */
    }
  }

  if (looksLikePhone(raw)) {
    return {
      type: "phone",
      raw,
      value: raw.replace(/[^\d+]/g, ""),
    };
  }

  if (DOMAIN_RE.test(raw) && raw.includes(".")) {
    return { type: "domain", raw, value: lower };
  }

  if (/\s/.test(raw) && NAME_RE.test(raw)) {
    return { type: "name", raw, value: lower.replace(/\s+/g, " ") };
  }

  // SECURITY: value is interpolated into platform URLs, so strip anything that
  // could alter host/path and cap the length.
  return {
    type: "username",
    raw,
    value: lower
      .replace(/^@/, "")
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 40),
  };
}

const NAME_RE = /^\p{L}[\p{L}'.-]+(?:\s+\p{L}[\p{L}'.-]*){1,2}$/u;

const TYPE_LABEL: Record<IdentifierType, string> = {
  email: "Email address",
  phone: "Phone number",
  username: "Username",
  domain: "Domain",
  url: "Website",
  name: "Name",
};

export function identifierLabel(type: IdentifierType): string {
  return TYPE_LABEL[type];
}

const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "yahoo.com", "yahoo.co.uk", "ymail.com", "icloud.com", "me.com", "mac.com",
  "proton.me", "protonmail.com", "pm.me", "aol.com", "gmx.com", "zoho.com",
  "mail.com", "yandex.com", "fastmail.com", "hey.com", "tutanota.com",
]);

/** Freemail providers — their WHOIS/DNS says nothing about the person, so
 * domain-oriented collectors skip them for email identifiers. */
export function isFreemail(domain: string | null | undefined): boolean {
  return !!domain && FREEMAIL.has(domain.toLowerCase());
}

/** Pull the registrable-ish host out of a url/domain identifier. */
export function hostOf(id: Identifier): string | null {
  if (id.type === "domain") return id.value;
  if (id.type === "url") return id.parts?.host ?? null;
  if (id.type === "email") return id.parts?.domain ?? null;
  return null;
}
