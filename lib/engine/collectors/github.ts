import { fetchJSON } from "../http";
import type { Collector, CollectorContext, CollectorOutcome } from "../collector";

interface GhUser {
  login: string;
  name: string | null;
  company: string | null;
  blog: string | null;
  location: string | null;
  email: string | null;
  bio: string | null;
  twitter_username: string | null;
  public_repos: number;
  followers: number;
  html_url: string;
  created_at: string;
  updated_at: string;
  avatar_url: string;
}

interface GhRepo {
  name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  fork: boolean;
  created_at: string;
  pushed_at: string;
}

interface GhEvent {
  type: string;
  payload?: {
    commits?: Array<{ author?: { email?: string; name?: string } }>;
  };
}

function ghHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return token ? { authorization: `Bearer ${token}` } : {};
}

function candidates(ctx: CollectorContext): string[] {
  const id = ctx.identifier;
  if (id.type === "username") return [id.value];
  if (id.type === "email" && id.parts?.local) return [id.parts.local];
  return [];
}

export const githubCollector: Collector = {
  id: "github",
  label: "GitHub",
  description: "Public developer profiles, repositories and linked identities",
  appliesTo: (id) => id.type === "username" || id.type === "email",

  async run(ctx: CollectorContext): Promise<CollectorOutcome> {
    const { graph, seedId, identifier } = ctx;
    let found = 0;

    for (const handle of candidates(ctx)) {
      const res = await fetchJSON<GhUser>(
        `https://api.github.com/users/${encodeURIComponent(handle)}`,
        { headers: ghHeaders(), timeoutMs: 8000 }
      );
      if (!res || res.status !== 200 || !res.data?.login) continue;
      const u = res.data;
      const guessed = identifier.type === "email";

      const profileEv = graph.addEvidence({
        sourceId: "github",
        sourceLabel: "GitHub API",
        title: "Public GitHub profile",
        detail: guessed
          ? `A GitHub account "${u.login}" exists whose handle matches the email's local part. This is a plausible but unconfirmed match.`
          : `GitHub account "${u.login}" exists${
              u.name ? `, registered to the name "${u.name}"` : ""
            }. ${u.public_repos} public repos, ${u.followers} followers.`,
        url: u.html_url,
        observedAt: u.created_at,
        weight: guessed ? 0.45 : 0.85,
      });
      found++;

      const profileId = graph.upsertEntity({
        type: "social_profile",
        label: `github.com/${u.login}`,
        sub: "GitHub",
        attributes: pruneAttrs({
          Handle: u.login,
          Name: u.name ?? "",
          Bio: u.bio ?? "",
          Location: u.location ?? "",
          Followers: String(u.followers),
          "Public repos": String(u.public_repos),
          Created: u.created_at.slice(0, 10),
        }),
        evidenceIds: [profileEv],
        sources: ["github"],
        firstSeen: u.created_at,
      });

      graph.addRelationship({
        from: seedId,
        to: profileId,
        kind: "has_account",
        label: guessed
          ? "Email's local part matches this GitHub handle"
          : "This username resolves to a public GitHub account",
        evidenceIds: [profileEv],
      });

      graph.addTimeline({
        at: u.created_at,
        label: "GitHub account created",
        detail: `@${u.login} joined GitHub`,
        entityId: profileId,
        evidenceIds: [profileEv],
      });
      graph.note(
        guessed ? "infer" : "observe",
        guessed
          ? `Found a GitHub user @${u.login} matching the email handle — treating as a lead, not a confirmed link.`
          : `GitHub confirms @${u.login} is a real account${
              u.name ? ` for ${u.name}` : ""
            }.`
      );

      if (u.name) {
        const nameEv = graph.addEvidence({
          sourceId: "github",
          sourceLabel: "GitHub API",
          title: "Name on GitHub profile",
          detail: `The GitHub profile publicly displays the name "${u.name}".`,
          url: u.html_url,
          weight: guessed ? 0.4 : 0.6,
        });
        const personId = graph.upsertEntity({
          type: "person",
          label: u.name,
          sub: "Individual",
          attributes: pruneAttrs({ Location: u.location ?? "" }),
          evidenceIds: [nameEv],
          sources: ["github"],
        });
        graph.addRelationship({
          from: profileId,
          to: personId,
          kind: "identifies",
          label: "GitHub profile is registered to this name",
          evidenceIds: [nameEv],
        });
        found++;
      }

      if (u.email) {
        const emEv = graph.addEvidence({
          sourceId: "github",
          sourceLabel: "GitHub API",
          title: "Email listed on GitHub",
          detail: `The GitHub profile publicly lists the email ${u.email}.`,
          url: u.html_url,
          weight: 0.75,
        });
        const emId = graph.upsertEntity({
          type: "email",
          label: u.email.toLowerCase(),
          evidenceIds: [emEv],
          sources: ["github"],
        });
        graph.addRelationship({
          from: profileId,
          to: emId,
          kind: "lists",
          label: "GitHub profile publicly lists this email",
          evidenceIds: [emEv],
        });
        found++;
      }

      if (u.blog && /\./.test(u.blog)) {
        const url = u.blog.startsWith("http") ? u.blog : `https://${u.blog}`;
        const wEv = graph.addEvidence({
          sourceId: "github",
          sourceLabel: "GitHub API",
          title: "Website linked from GitHub",
          detail: `The GitHub profile links to ${url}.`,
          url,
          weight: 0.55,
        });
        let host = url;
        try {
          host = new URL(url).hostname;
        } catch {}
        const wId = graph.upsertEntity({
          type: "website",
          label: host,
          sub: "Linked from GitHub",
          attributes: { URL: url },
          evidenceIds: [wEv],
          sources: ["github"],
        });
        graph.addRelationship({
          from: profileId,
          to: wId,
          kind: "links_to",
          label: "GitHub profile links to this website",
          evidenceIds: [wEv],
        });
        found++;
      }

      if (u.company) {
        const org = u.company.replace(/^@/, "").trim();
        // The company field often just repeats the person's name; don't duplicate them as an org.
        const sameAsPerson =
          u.name && org.toLowerCase() === u.name.trim().toLowerCase();
        if (org && !sameAsPerson) {
        const cEv = graph.addEvidence({
          sourceId: "github",
          sourceLabel: "GitHub API",
          title: "Company on GitHub profile",
          detail: `The profile lists an affiliation with "${org}".`,
          url: u.html_url,
          weight: 0.5,
        });
        const cId = graph.upsertEntity({
          type: "organization",
          label: org,
          evidenceIds: [cEv],
          sources: ["github"],
        });
        graph.addRelationship({
          from: profileId,
          to: cId,
          kind: "affiliated",
          label: "GitHub profile lists this organization",
          evidenceIds: [cEv],
        });
        found++;
        }
      }

      if (u.twitter_username) {
        const tEv = graph.addEvidence({
          sourceId: "github",
          sourceLabel: "GitHub API",
          title: "X/Twitter handle on GitHub",
          detail: `The profile links the X/Twitter handle @${u.twitter_username}.`,
          url: `https://x.com/${u.twitter_username}`,
          weight: 0.5,
        });
        const tId = graph.upsertEntity({
          type: "social_profile",
          label: `x.com/${u.twitter_username}`,
          sub: "X / Twitter",
          attributes: { Handle: `@${u.twitter_username}` },
          evidenceIds: [tEv],
          sources: ["github"],
        });
        graph.addRelationship({
          from: profileId,
          to: tId,
          kind: "links_to",
          label: "GitHub profile links this X/Twitter account",
          evidenceIds: [tEv],
        });
        found++;
      }

      const repos = await fetchJSON<GhRepo[]>(
        `https://api.github.com/users/${encodeURIComponent(
          u.login
        )}/repos?per_page=100&sort=pushed`,
        { headers: ghHeaders(), timeoutMs: 8000 }
      );
      if (repos && Array.isArray(repos.data)) {
        const top = repos.data
          .filter((r) => !r.fork)
          .sort((a, b) => b.stargazers_count - a.stargazers_count)
          .slice(0, 4);
        for (const r of top) {
          const rEv = graph.addEvidence({
            sourceId: "github",
            sourceLabel: "GitHub API",
            title: `Repository: ${r.name}`,
            detail: `${r.description ?? "No description"}${
              r.language ? ` — ${r.language}` : ""
            }, ${r.stargazers_count}★.`,
            url: r.html_url,
            observedAt: r.created_at,
            weight: 0.5,
          });
          const rId = graph.upsertEntity({
            type: "repository",
            label: r.name,
            sub: r.language ?? "Repository",
            attributes: pruneAttrs({
              Stars: String(r.stargazers_count),
              Language: r.language ?? "",
              Created: r.created_at.slice(0, 10),
            }),
            evidenceIds: [rEv],
            sources: ["github"],
            firstSeen: r.created_at,
          });
          graph.addRelationship({
            from: profileId,
            to: rId,
            kind: "owns",
            label: "Repository owned by this GitHub account",
            evidenceIds: [rEv],
          });
          found++;
        }
      }

      // Author emails from public commits — a strong handle↔email link.
      const events = await fetchJSON<GhEvent[]>(
        `https://api.github.com/users/${encodeURIComponent(
          u.login
        )}/events/public?per_page=100`,
        { headers: ghHeaders(), timeoutMs: 8000 }
      );
      if (events && Array.isArray(events.data)) {
        const emails = new Map<string, string>();
        for (const evt of events.data) {
          if (evt.type !== "PushEvent") continue;
          for (const c of evt.payload?.commits ?? []) {
            const em = c.author?.email?.toLowerCase();
            if (!em || emails.has(em)) continue;
            // Masked noreply addresses aren't deliverable.
            if (/@users\.noreply\.github\.com$/.test(em)) continue;
            if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(em)) continue;
            emails.set(em, c.author?.name ?? "");
          }
        }
        for (const [em, nm] of [...emails].slice(0, 4)) {
          const cEv = graph.addEvidence({
            sourceId: "github",
            sourceLabel: "GitHub commits",
            title: `Email in commit history: ${em}`,
            detail: `Public commits pushed by @${u.login} are authored with the email ${em}${
              nm ? ` ("${nm}")` : ""
            }. A commit author email is a strong link between this handle and a real address.`,
            url: u.html_url,
            weight: 0.72,
          });
          const emId = graph.upsertEntity({
            type: "email",
            label: em,
            sub: "From commit history",
            evidenceIds: [cEv],
            sources: ["github"],
          });
          graph.addRelationship({
            from: profileId,
            to: emId,
            kind: "commits_as",
            label: "This GitHub account authors public commits with this email",
            evidenceIds: [cEv],
          });
          found++;
        }
        if (emails.size) {
          graph.note(
            "infer",
            `Mined ${emails.size} author email${
              emails.size === 1 ? "" : "s"
            } from @${u.login}'s public commits — a direct bridge from the handle to a real address.`
          );
        }
      }
    }

    return {
      count: found,
      note: found === 0 ? "no profile" : `${found} findings`,
    };
  },
};

function pruneAttrs(a: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(a).filter(([, v]) => v && v.trim()));
}
