import { fetchText } from "../http";
import { hostOf, isFreemail } from "../identifier";
import { isNonPersonalHost, isProfileUrl } from "../blocklist";
import type { Collector, CollectorContext, CollectorOutcome } from "../collector";

const SOCIAL_PATTERNS: Array<{ re: RegExp; platform: string }> = [
  { re: /https?:\/\/(?:[\w.]+\.)?linkedin\.com\/(?:in|company)\/[\w%-]+/gi, platform: "LinkedIn" },
  { re: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[\w]{2,}/gi, platform: "X / Twitter" },
  { re: /https?:\/\/(?:www\.)?github\.com\/[\w-]{2,}/gi, platform: "GitHub" },
  { re: /https?:\/\/(?:www\.)?instagram\.com\/[\w.]{2,}/gi, platform: "Instagram" },
  { re: /https?:\/\/(?:www\.)?facebook\.com\/[\w.]{3,}/gi, platform: "Facebook" },
  { re: /https?:\/\/(?:www\.)?youtube\.com\/(?:@[\w-]+|channel\/[\w-]+|c\/[\w-]+)/gi, platform: "YouTube" },
];

const HOST_PLATFORM: Record<string, string> = {
  "linkedin.com": "LinkedIn",
  "twitter.com": "X / Twitter",
  "x.com": "X / Twitter",
  "github.com": "GitHub",
  "gitlab.com": "GitLab",
  "instagram.com": "Instagram",
  "facebook.com": "Facebook",
  "youtube.com": "YouTube",
  "mastodon.social": "Mastodon",
  "bsky.app": "Bluesky",
  "threads.net": "Threads",
  "dribbble.com": "Dribbble",
  "behance.net": "Behance",
  "medium.com": "Medium",
  "dev.to": "Dev.to",
  "tiktok.com": "TikTok",
  "soundcloud.com": "SoundCloud",
  "twitch.tv": "Twitch",
  "keybase.io": "Keybase",
};

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#64;/g, "@")
    .replace(/&#0?46;/g, ".")
    .trim();
}

export const websiteCollector: Collector = {
  id: "website",
  label: "Website",
  description: "Fetches the site and extracts contacts, socials and org identity",
  appliesTo: (id) =>
    id.type === "url" ||
    id.type === "domain" ||
    (id.type === "email" && !isFreemail(id.parts?.domain)),

  async run(ctx: CollectorContext): Promise<CollectorOutcome> {
    const { graph, seedId, identifier } = ctx;
    const host = hostOf(identifier);
    if (!host) return { count: 0, note: "n/a" };

    const target =
      identifier.type === "url"
        ? identifier.value
        : `https://${host.replace(/^www\./, "")}`;

    const res = await fetchText(target, { timeoutMs: 9000 });
    if (!res || !res.ok || !/html/i.test(res.contentType)) {
      return { count: 0, note: "unreachable" };
    }
    const html = res.text;
    let found = 0;

    const title = decode(
      (html.match(/<title[^>]*>([^<]{1,140})<\/title>/i)?.[1] ?? "").trim()
    );
    const desc = decode(
      html.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,240})["']/i
      )?.[1] ?? ""
    );
    const ogSite = decode(
      html.match(
        /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']{1,120})["']/i
      )?.[1] ?? ""
    );

    const siteEv = graph.addEvidence({
      sourceId: "website",
      sourceLabel: "Website",
      title: `Live site: ${title || host}`,
      detail: `${res.finalUrl} is online${title ? ` — "${title}"` : ""}.${
        desc ? ` ${desc}` : ""
      }`,
      url: res.finalUrl,
      weight: 0.7,
    });
    found++;
    const siteId = graph.upsertEntity({
      type: "website",
      label: host.replace(/^www\./, ""),
      sub: title || "Website",
      attributes: pruneAttrs({
        Title: title,
        Description: desc,
        URL: res.finalUrl,
      }),
      evidenceIds: [siteEv],
      sources: ["website"],
    });
    if (siteId !== seedId) {
      graph.addRelationship({
        from: seedId,
        to: siteId,
        kind: "resolves_to",
        label: "The identifier hosts this live website",
        evidenceIds: [siteEv],
      });
    }
    graph.note("observe", `The site ${host} is live and served real HTML content.`);

    const orgName =
      ogSite ||
      decode(
        html.match(
          /"@type"\s*:\s*"(?:Organization|Corporation|LocalBusiness)"[^}]*?"name"\s*:\s*"([^"]{2,80})"/i
        )?.[1] ?? ""
      );
    // Portfolios often set og:site_name to the owner's name — that's a person, not an org.
    const looksPersonal =
      /^\p{Lu}[\p{L}'.-]+(?:\s+\p{Lu}[\p{L}'.-]+){1,2}$/u.test(orgName) &&
      !/\b(inc|llc|ltd|limited|corp|gmbh|co|company|studio|labs?|group|agency|media|technologies|technology|solutions|systems|works|collective)\b/i.test(
        orgName
      );
    if (orgName && !looksPersonal) {
      const oEv = graph.addEvidence({
        sourceId: "website",
        sourceLabel: "Website",
        title: `Organization: ${orgName}`,
        detail: `The site identifies itself as "${orgName}".`,
        url: res.finalUrl,
        weight: 0.55,
      });
      const oId = graph.upsertEntity({
        type: "organization",
        label: orgName,
        evidenceIds: [oEv],
        sources: ["website"],
      });
      graph.addRelationship({
        from: siteId,
        to: oId,
        kind: "operated_by",
        label: "The website presents itself as this organization",
        evidenceIds: [oEv],
      });
      found++;
    }

    const emails = new Set<string>();
    const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
    const collect = (raw: string) => {
      const found = decode(raw).toLowerCase().match(EMAIL_RE);
      if (found && isRealEmail(found[0])) emails.add(found[0]);
    };
    for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) collect(m[1]);
    for (const m of html.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) collect(m[0]);
    let emailCount = 0;
    for (const email of [...emails].slice(0, 6)) {
      const eEv = graph.addEvidence({
        sourceId: "website",
        sourceLabel: "Website",
        title: `Email published on site: ${email}`,
        detail: `The email ${email} appears in the page's markup (contact or footer).`,
        url: res.finalUrl,
        weight: 0.6,
      });
      const eId = graph.upsertEntity({
        type: "email",
        label: email,
        evidenceIds: [eEv],
        sources: ["website"],
      });
      graph.addRelationship({
        from: siteId,
        to: eId,
        kind: "publishes",
        label: "The website publicly lists this email",
        evidenceIds: [eEv],
      });
      found++;
      emailCount++;
    }

    const phones = new Set<string>();
    for (const m of html.matchAll(/tel:([+\d][\d\s().-]{6,})/gi)) phones.add(m[1].trim());
    for (const phone of [...phones].slice(0, 4)) {
      const pEv = graph.addEvidence({
        sourceId: "website",
        sourceLabel: "Website",
        title: `Phone published on site: ${phone}`,
        detail: `The phone number ${phone} is listed on the site.`,
        url: res.finalUrl,
        weight: 0.55,
      });
      const pId = graph.upsertEntity({
        type: "phone",
        label: phone.replace(/[^\d+]/g, ""),
        sub: "Listed on website",
        attributes: { Displayed: phone },
        evidenceIds: [pEv],
        sources: ["website"],
      });
      graph.addRelationship({
        from: siteId,
        to: pId,
        kind: "publishes",
        label: "The website footer lists this phone number",
        evidenceIds: [pEv],
      });
      found++;
    }

    const seen = new Set<string>();
    for (const { re, platform } of SOCIAL_PATTERNS) {
      for (const m of html.matchAll(re)) {
        const url = m[0];
        if (seen.has(url.toLowerCase())) continue;
        seen.add(url.toLowerCase());
        if (!isProfileUrl(url)) continue; // skip share/intent/watch content links
        let label = url;
        try {
          const u = new URL(url);
          label = `${u.hostname.replace(/^www\./, "")}${u.pathname}`.replace(/\/$/, "");
        } catch {}
        const sEv = graph.addEvidence({
          sourceId: "website",
          sourceLabel: "Website",
          title: `Linked ${platform} account`,
          detail: `The site links to a ${platform} profile: ${url}.`,
          url,
          weight: 0.5,
        });
        const sId = graph.upsertEntity({
          type: "social_profile",
          label,
          sub: platform,
          attributes: { URL: url },
          evidenceIds: [sEv],
          sources: ["website"],
        });
        graph.addRelationship({
          from: siteId,
          to: sId,
          kind: "links_to",
          label: `The website links to this ${platform} profile`,
          evidenceIds: [sEv],
        });
        found++;
        if (seen.size > 10) break;
      }
    }

    // rel="me" / JSON-LD sameAs are ownership assertions, not just links.
    const identityUrls = new Set<string>();
    for (const m of html.matchAll(/<(?:a|link)\b[^>]*>/gi)) {
      const tag = m[0];
      if (!/\brel=["'][^"']*\bme\b[^"']*["']/i.test(tag)) continue;
      const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
      if (href && /^https?:\/\//i.test(href)) identityUrls.add(href);
    }
    for (const m of html.matchAll(/"sameAs"\s*:\s*\[([^\]]+)\]/gi))
      for (const u of m[1].matchAll(/"(https?:\/\/[^"']+)"/gi)) identityUrls.add(u[1]);
    for (const m of html.matchAll(/"sameAs"\s*:\s*"(https?:\/\/[^"']+)"/gi))
      identityUrls.add(m[1]);

    const apex = host.replace(/^www\./, "");
    let identityCount = 0;
    for (const url of [...identityUrls].slice(0, 12)) {
      if (seen.has(url.toLowerCase())) continue;
      seen.add(url.toLowerCase());
      let uhost = "";
      try {
        uhost = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      const platKey = Object.keys(HOST_PLATFORM).find(
        (d) => uhost === d || uhost.endsWith(`.${d}`)
      );
      const rEv = graph.addEvidence({
        sourceId: "website",
        sourceLabel: "Website",
        title: platKey
          ? `Verified ${HOST_PLATFORM[platKey]} link (rel=me)`
          : `Claimed profile: ${uhost}`,
        detail: `The site explicitly claims this profile as its own via rel="me" / sameAs: ${url}. That is an ownership assertion, not just a link.`,
        url,
        weight: 0.58,
      });
      let entityId: string;
      if (platKey) {
        let label = uhost;
        try {
          const u = new URL(url);
          label = `${uhost}${u.pathname}`.replace(/\/$/, "");
        } catch {}
        entityId = graph.upsertEntity({
          type: "social_profile",
          label,
          sub: HOST_PLATFORM[platKey],
          attributes: { URL: url },
          evidenceIds: [rEv],
          sources: ["website"],
        });
      } else {
        // A rel=me to a vendor/tool (figma.com, vercel.app…) isn't an identity to chase.
        if (uhost === apex || isNonPersonalHost(uhost)) continue;
        entityId = graph.upsertEntity({
          type: "website",
          label: uhost,
          sub: "Claimed identity (rel=me)",
          attributes: { URL: url },
          evidenceIds: [rEv],
          sources: ["website"],
        });
      }
      graph.addRelationship({
        from: siteId,
        to: entityId,
        kind: "links_to",
        label: 'Claimed as the same owner via rel="me" / sameAs',
        evidenceIds: [rEv],
      });
      found++;
      identityCount++;
    }
    if (identityCount)
      graph.note(
        "infer",
        `The site asserts ownership of ${identityCount} other profile${
          identityCount === 1 ? "" : "s"
        } via rel="me" / sameAs — verified links worth following.`
      );

    return {
      count: found,
      note: emailCount ? `${emailCount} emails, ${seen.size} links` : "site read",
    };
  },
};

function pruneAttrs(a: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(a).filter(([, v]) => v && v.trim()));
}

/** Reject asset paths, placeholder addresses, and hash-like noise. */
function isRealEmail(e: string): boolean {
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js|woff2?)$/.test(e)) return false;
  const [local, domain] = e.split("@");
  if (!local || !domain) return false;
  if (/^(example|test|sample|domain|yourdomain|email|your-email)\./.test(domain)) return false;
  if (/(example|sentry|wixpress|placeholder|no-?reply@|test@)/.test(e)) return false;
  // Long hex strings are tracking/CDN artifacts, not addresses.
  if (/^[0-9a-f]{16,}$/.test(local)) return false;
  return true;
}
