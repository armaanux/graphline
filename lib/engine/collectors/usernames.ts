import { fetchJSON, probe } from "../http";
import { isGenericHandle } from "../blocklist";
import type { Collector, CollectorContext, CollectorOutcome } from "../collector";

interface Hit {
  platform: string;
  url: string;
  exists: boolean;
}

// Only platforms with a clear yes/no API. Login-walled sites (Instagram, X,
// TikTok, Telegram, Steam) soft-200 every request — excluded.
const JSON_CHECKS: Array<(u: string) => Promise<Hit>> = [
  async (u) => {
    const r = await fetchJSON<{ data?: { name?: string } }>(
      `https://www.reddit.com/user/${u}/about.json`,
      { headers: { "user-agent": "GraphlineBot/0.1" } }
    );
    return { platform: "Reddit", url: `https://www.reddit.com/user/${u}`, exists: !!r && r.status === 200 && !!r.data?.data?.name };
  },
  async (u) => {
    const r = await fetchJSON<{ id?: string } | null>(`https://hacker-news.firebaseio.com/v0/user/${u}.json`);
    return { platform: "Hacker News", url: `https://news.ycombinator.com/user?id=${u}`, exists: !!r && r.status === 200 && !!r.data && !!r.data.id };
  },
  async (u) => {
    const r = await fetchJSON<{ _id?: string }>(`https://registry.npmjs.org/-/user/org.couchdb.user:${u}`);
    return { platform: "npm", url: `https://www.npmjs.com/~${u}`, exists: !!r && r.status === 200 && !!r.data?._id };
  },
  async (u) => {
    const r = await fetchJSON<{ id?: number }>(`https://dev.to/api/users/by_username?url=${u}`);
    return { platform: "Dev.to", url: `https://dev.to/${u}`, exists: !!r && r.status === 200 && !!r.data?.id };
  },
  async (u) => {
    const r = await fetchJSON<{ id?: string }>(`https://mastodon.social/api/v1/accounts/lookup?acct=${u}`);
    return { platform: "Mastodon", url: `https://mastodon.social/@${u}`, exists: !!r && r.status === 200 && !!r.data?.id };
  },
  async (u) => {
    const r = await fetchJSON<{ username?: string }>(`https://lobste.rs/u/${u}.json`);
    return { platform: "Lobsters", url: `https://lobste.rs/u/${u}`, exists: !!r && r.status === 200 && !!r.data?.username };
  },
];

// Sites with a clean 404 for missing users (200 => exists).
// PyPI soft-200s every handle — excluded.
const PROBE_CHECKS: Array<{ platform: string; url: (u: string) => string }> = [
  { platform: "Patreon", url: (u) => `https://www.patreon.com/${u}` },
  { platform: "Behance", url: (u) => `https://www.behance.net/${u}` },
  { platform: "Dribbble", url: (u) => `https://dribbble.com/${u}` },
  { platform: "Chess.com", url: (u) => `https://www.chess.com/member/${u}` },
  { platform: "Hugging Face", url: (u) => `https://huggingface.co/${u}` },
  { platform: "About.me", url: (u) => `https://about.me/${u}` },
  { platform: "Linktree", url: (u) => `https://linktr.ee/${u}` },
  { platform: "Kaggle", url: (u) => `https://www.kaggle.com/${u}` },
  { platform: "Docker Hub", url: (u) => `https://hub.docker.com/u/${u}` },
  { platform: "Gumroad", url: (u) => `https://${u}.gumroad.com/` },
  { platform: "itch.io", url: (u) => `https://${u}.itch.io/` },
  { platform: "SoundCloud", url: (u) => `https://soundcloud.com/${u}` },
  { platform: "Vimeo", url: (u) => `https://vimeo.com/${u}` },
  { platform: "Wattpad", url: (u) => `https://www.wattpad.com/user/${u}` },
  { platform: "Flickr", url: (u) => `https://www.flickr.com/people/${u}` },
  { platform: "Tumblr", url: (u) => `https://${u}.tumblr.com` },
  { platform: "Roblox", url: (u) => `https://www.roblox.com/user.aspx?username=${u}` },
  { platform: "Venmo", url: (u) => `https://account.venmo.com/u/${u}` },
];

export const usernameCollector: Collector = {
  id: "handles",
  label: "Account sweep",
  description: "Checks where the handle is registered across public platforms",
  appliesTo: (id) => id.type === "username" || id.type === "email",

  async run(ctx: CollectorContext): Promise<CollectorOutcome> {
    const { graph, seedId, identifier } = ctx;
    const handle =
      identifier.type === "username" ? identifier.value : identifier.parts?.local;
    if (!handle || handle.length < 2) return { count: 0, note: "n/a" };
    // Role/shared handles ("support", "info") match unrelated orgs everywhere — skip.
    if (isGenericHandle(handle)) return { count: 0, note: "generic handle" };
    const derived = identifier.type === "email";

    const results = await Promise.all([
      ...JSON_CHECKS.map((c) => c(handle).catch(() => null)),
      ...PROBE_CHECKS.map(async (c) => {
        const r = await probe(c.url(handle)).catch(() => null);
        return { platform: c.platform, url: c.url(handle), exists: !!r && r.status === 200 } as Hit;
      }),
    ]);
    const hits = results.filter((h): h is Hit => !!h && h.exists);
    if (hits.length === 0) return { count: 0, note: "no matches" };

    for (const h of hits) {
      const ev = graph.addEvidence({
        sourceId: "handles",
        sourceLabel: h.platform,
        title: `Account "${handle}" on ${h.platform}`,
        detail: derived
          ? `An account with the handle "${handle}" (from the email's local part) exists on ${h.platform}. Whether it belongs to the same person is unconfirmed.`
          : `An account with the username "${handle}" exists on ${h.platform}.`,
        url: h.url,
        weight: derived ? 0.34 : 0.46,
      });
      const pid = graph.upsertEntity({
        type: "social_profile",
        label: `${h.platform.toLowerCase().replace(/[^a-z]/g, "")}/${handle}`,
        sub: h.platform,
        attributes: { Platform: h.platform, Handle: handle, URL: h.url },
        evidenceIds: [ev],
        sources: ["handles"],
      });
      graph.addRelationship({
        from: seedId,
        to: pid,
        kind: "handle_seen_on",
        label: `The handle "${handle}" is registered on ${h.platform}`,
        evidenceIds: [ev],
      });
    }

    // A handle derived from an email that exists on multiple sites is likely reused.
    if (derived && hits.length >= 2) {
      const uEv = graph.addEvidence({
        sourceId: "handles",
        sourceLabel: "Account sweep",
        title: `Reused handle: ${handle}`,
        detail: `The email's local part "${handle}" is an active username on ${hits.length} platforms, suggesting the owner reuses it as a handle.`,
        weight: 0.4,
      });
      const uid = graph.upsertEntity({
        type: "username",
        label: handle,
        sub: "Derived from email",
        evidenceIds: [uEv],
        sources: ["handles"],
      });
      graph.addRelationship({
        from: seedId,
        to: uid,
        kind: "uses_handle",
        label: "The email owner appears to use this as a username",
        evidenceIds: [uEv],
      });
    }

    graph.note(
      hits.length >= 3 ? "infer" : "observe",
      `The handle "${handle}" is registered on ${hits.length} platform${
        hits.length === 1 ? "" : "s"
      }: ${hits.map((h) => h.platform).join(", ")}.${
        hits.length >= 3
          ? " Consistent reuse across several sites raises the odds these belong to one person."
          : ""
      }`
    );
    return { count: hits.length, note: `${hits.length} accounts` };
  },
};
