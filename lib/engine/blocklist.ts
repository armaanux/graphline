/* Drift guards: a single wrong "owned" edge can drag the crawl off its subject
 * into a vendor's whole org. These blocklists keep it on the person, not the
 * tools and companies they merely reference. */

/** Role / shared-mailbox local-parts — never an individual's personal handle. */
export const ROLE_LOCALPARTS = new Set([
  "support", "info", "contact", "hello", "hi", "hey", "admin", "administrator",
  "sales", "help", "helpdesk", "team", "office", "mail", "email", "inbox",
  "careers", "jobs", "hr", "press", "media", "marketing", "newsletter", "news",
  "notifications", "notify", "noreply", "no-reply", "donotreply", "do-not-reply",
  "root", "webmaster", "postmaster", "abuse", "security", "privacy", "legal",
  "billing", "accounts", "account", "service", "services", "enquiries",
  "enquiry", "inquiry", "inquiries", "feedback", "general", "welcome", "default",
  "user", "users", "guest", "demo", "test", "example", "orders", "order",
  "shop", "store", "hola", "bonjour", "contacto", "kontakt", "all", "everyone",
]);

/** Is this email local-part a role mailbox rather than a person? */
export function isRoleEmailLocal(local?: string | null): boolean {
  return !!local && ROLE_LOCALPARTS.has(local.toLowerCase());
}

/** Is this handle too generic to represent one specific person? */
export function isGenericHandle(h?: string | null): boolean {
  if (!h) return true;
  const v = h.toLowerCase().replace(/^@/, "");
  if (v.length < 3) return true;
  return ROLE_LOCALPARTS.has(v);
}

/** Hosts never treated as the subject's own site — platforms, tools, big
 * companies, reference sites. A link to one isn't evidence of control. */
export const NON_PERSONAL_HOSTS = new Set([
  // social / identity platforms
  "github.com", "gitlab.com", "bitbucket.org", "linkedin.com", "twitter.com",
  "x.com", "instagram.com", "facebook.com", "youtube.com", "tiktok.com",
  "reddit.com", "medium.com", "keybase.io", "mastodon.social", "bsky.app",
  "threads.net", "npmjs.com", "pypi.org", "dev.to", "patreon.com",
  "behance.net", "dribbble.com", "chess.com", "huggingface.co", "about.me",
  "linktr.ee", "stackoverflow.com", "substack.com", "hashnode.dev",
  "producthunt.com", "pinterest.com", "snapchat.com", "twitch.tv",
  "soundcloud.com", "vimeo.com", "flickr.com", "tumblr.com",
  // design / build / hosting tools (portfolios link these constantly)
  "figma.com", "figma.en.softonic.com", "canva.com", "notion.so", "notion.site",
  "vercel.com", "vercel.app", "netlify.app", "netlify.com", "heroku.com",
  "herokuapp.com", "wordpress.com", "wordpress.org", "wix.com", "wixsite.com",
  "squarespace.com", "webflow.io", "webflow.com", "framer.website", "framer.com",
  "framer.app", "carrd.co", "github.io", "gitlab.io", "pages.dev", "render.com",
  "readme.io", "gitbook.io", "bubble.io", "glitch.me", "replit.com", "repl.co",
  "codepen.io", "codesandbox.io", "stackblitz.com", "observablehq.com",
  // reference / dictionaries / knowledge
  "wikipedia.org", "wikidata.org", "wikiwand.com", "britannica.com",
  "crunchbase.com", "merriam-webster.com", "dictionary.com", "thesaurus.com",
  "vocabulary.com", "cambridge.org", "collinsdictionary.com", "geeksforgeeks.org",
  "w3schools.com", "mdn.mozilla.org", "developer.mozilla.org", "quora.com",
  "softonic.com", "apps.apple.com", "play.google.com", "apple.com",
  // big companies / vendors
  "google.com", "gmail.com", "googleusercontent.com", "microsoft.com",
  "support.microsoft.com", "office.com", "live.com", "outlook.com", "bing.com",
  "amazon.com", "aws.amazon.com", "samsung.com", "dell.com", "dellstore.com",
  "hp.com", "support.hp.com", "lenovo.com", "support.lenovo.com", "asus.com",
  "adobe.com", "cloudflare.com", "gravatar.com", "gstatic.com", "shopify.com",
  "stripe.com", "paypal.com", "venmo.com", "cash.app", "roblox.com",
  "wattpad.com", "kaggle.com", "hub.docker.com", "docker.com", "gumroad.com",
  "itch.io", "discord.com", "discordapp.com", "discord.gg",
]);

/** First path-segments that are content/actions/chrome, never a profile
 * (youtube/watch, x.com/share, instagram.com/p/…). */
const NON_PROFILE_FIRST = new Set([
  "watch", "playlist", "shorts", "results", "feed", "explore", "search",
  "hashtag", "share", "sharer", "sharer.php", "intent", "home", "login",
  "signin", "signup", "register", "help", "status", "statuses", "i", "p",
  "reel", "reels", "stories", "story", "story.php", "permalink.php", "video",
  "videos", "photo", "photos", "media", "tagged", "tags", "pages", "groups",
  "events", "dialog", "tr", "messages", "notifications", "about", "privacy",
  "terms", "policies", "settings", "discover", "music", "tag", "embed",
  "hashtag", "l", "redirect", "sharing", "plugins",
]);

/** Does this URL point at an individual account/profile, not a content page? */
export function isProfileUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const segs = u.pathname.split("/").filter(Boolean);
  if (segs.length === 0) return false; // a homepage is not a profile
  const first = segs[0].toLowerCase();
  if (NON_PROFILE_FIRST.has(first)) return false;
  // these prefixes need the actual handle in the next segment
  if (["c", "user", "channel", "u", "in", "company", "profile"].includes(first))
    return segs.length >= 2;
  return true;
}

/** Should the crawler avoid expanding into this host as a "personal" site? */
export function isNonPersonalHost(host?: string | null): boolean {
  if (!host) return true;
  const h = host.toLowerCase().replace(/^www\./, "");
  if (NON_PERSONAL_HOSTS.has(h)) return true;
  // block subdomains of blocked apexes too
  return [...NON_PERSONAL_HOSTS].some((d) => h.endsWith(`.${d}`));
}
