import type { NextRequest } from "next/server";
import { detectIdentifier } from "@/lib/engine/identifier";
import { runInvestigation } from "@/lib/engine/orchestrator";
import { runWithSearchKeys } from "@/lib/engine/searchctx";
import { saveInvestigation } from "@/lib/engine/store";
import { clientKey, rateLimit } from "@/lib/ratelimit";
import { reserveInvestigation } from "@/lib/usage";
import { newSid, sidCookie, sidFromRequest } from "@/lib/session";
import type { StreamEvent } from "@/lib/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUERY_LEN = 200;

// Server-wide backstop against socket/memory exhaustion if per-client limits are evaded.
const MAX_CONCURRENT = Number(process.env.GRAPHLINE_MAX_CONCURRENT ?? 4);
let inFlight = 0;

// EventSource can't read a non-200 body, so deliver limit errors in-stream.
function sseError(message: string): Response {
  const body = `data: ${JSON.stringify({ type: "error", message })}\n\n`;
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(`inv:${clientKey(req)}`, 15, 60_000);
  if (!rl.ok) {
    return sseError(
      `You're sending requests too quickly. Try again in ${rl.retryAfter}s.`
    );
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return new Response("Missing query", { status: 400 });
  }
  if (q.length > MAX_QUERY_LEN) {
    return new Response("Query too long", { status: 400 });
  }
  const identifier = detectIdentifier(q);

  // A visitor may supply their own Serper key (header, or ?k= for EventSource)
  // so they don't draw on the owner's daily budget.
  const ownKeyRaw =
    req.headers.get("x-serper-key")?.trim() ||
    req.nextUrl.searchParams.get("k")?.trim() ||
    "";
  const hasOwnKey = /^[A-Za-z0-9]{20,80}$/.test(ownKeyRaw);

  if (inFlight >= MAX_CONCURRENT) {
    return sseError("The server is busy right now. Please try again in a moment.");
  }

  // Enforce the daily budget: spend the owner's key only while budget remains,
  // then fall back to keyless.
  const decision = await reserveInvestigation(clientKey(req), hasOwnKey);
  if (!decision.allowed) {
    return sseError(decision.reason ?? "Daily limit reached.");
  }
  const searchKeys = {
    serper: hasOwnKey
      ? ownKeyRaw
      : decision.useOwnerKey
      ? process.env.SERPER_API_KEY
      : undefined,
    brave: decision.useOwnerKey ? process.env.BRAVE_API_KEY : undefined,
  };

  inFlight++;

  // Scope the saved case to an anonymous session (httpOnly cookie).
  let sid = sidFromRequest(req);
  const setCookie = sid ? undefined : sidCookie((sid = newSid()));

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      // Keep-alive so proxies don't buffer/close the stream.
      const ping = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {
            closed = true;
          }
        }
      }, 15000);

      req.signal.addEventListener("abort", () => {
        closed = true;
      });

      try {
        const investigation = await runWithSearchKeys(searchKeys, () =>
          runInvestigation(identifier, send)
        );
        await saveInvestigation(investigation, sid);
        send({ type: "status", message: "Investigation saved." });
      } catch (err) {
        // Never surface internal error detail to the client.
        console.error("[investigate] failed:", err);
        send({
          type: "error",
          message: "The investigation failed unexpectedly. Please try again.",
        });
      } finally {
        inFlight = Math.max(0, inFlight - 1);
        clearInterval(ping);
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      ...(setCookie ? { "set-cookie": setCookie } : {}),
    },
  });
}
