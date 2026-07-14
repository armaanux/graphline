import type { Collector } from "../collector";
import { githubCollector } from "./github";
import { gravatarCollector } from "./gravatar";
import { keybaseCollector } from "./keybase";
import { usernameCollector } from "./usernames";
import { rdapCollector } from "./rdap";
import { dnsCollector } from "./dns";
import { websiteCollector } from "./website";
import { phoneCollector } from "./phone";
import { websearchCollector } from "./websearch";
import { crtshCollector } from "./crtsh";
import { waybackCollector } from "./wayback";
import { hunterCollector } from "./hunter";
import { breachCollector } from "./breach";

/** Collector registry — add a source by implementing Collector and listing it here. */
export const COLLECTORS: Collector[] = [
  websearchCollector,
  githubCollector,
  gravatarCollector,
  keybaseCollector,
  usernameCollector,
  rdapCollector,
  dnsCollector,
  websiteCollector,
  crtshCollector,
  waybackCollector,
  hunterCollector,
  breachCollector,
  phoneCollector,
];

export function collectorsFor(identifierType: string): Collector[] {
  return COLLECTORS.filter((c) =>
    c.appliesTo({ type: identifierType, raw: "", value: "" } as never)
  );
}
