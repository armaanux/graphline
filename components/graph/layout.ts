import type { Entity, Relationship } from "@/lib/engine/types";

export interface Positioned {
  id: string;
  x: number;
  y: number;
}

/**
 * Subject-centred radial layout. The seed sits at the origin; its direct
 * connections split into a verified core ring and an outer halo of unverified
 * candidates. Deeper nodes fan out from their parent's angle rather than sharing
 * a ring, keeping branches readable and edges short.
 */
export function radialLayout(
  entities: Entity[],
  relationships: Relationship[],
  seedId: string
): Map<string, Positioned> {
  const pos = new Map<string, Positioned>();
  const entMap = new Map(entities.map((e) => [e.id, e]));
  const start = entMap.has(seedId) ? seedId : entities[0]?.id;
  if (!start) return pos;

  const ids = new Set(entities.map((e) => e.id));
  const adj = new Map<string, string[]>();
  for (const e of entities) adj.set(e.id, []);
  for (const r of relationships) {
    if (!ids.has(r.from) || !ids.has(r.to)) continue;
    adj.get(r.from)!.push(r.to);
    adj.get(r.to)!.push(r.from);
  }

  // BFS spanning tree, stable by id sort.
  const depth = new Map<string, number>([[start, 0]]);
  const parent = new Map<string, string | null>([[start, null]]);
  const children = new Map<string, string[]>();
  for (const e of entities) children.set(e.id, []);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nb of [...adj.get(cur)!].sort()) {
      if (!depth.has(nb)) {
        depth.set(nb, depth.get(cur)! + 1);
        parent.set(nb, cur);
        children.get(cur)!.push(nb);
        queue.push(nb);
      }
    }
  }
  // Disconnected nodes hang off the seed as depth-1.
  for (const e of entities)
    if (!depth.has(e.id)) {
      depth.set(e.id, 1);
      parent.set(e.id, start);
      children.get(start)!.push(e.id);
    }

  const isUnverified = (id: string) => entMap.get(id)?.verification === "unverified";
  const byTypeThenId = (a: string, b: string) => {
    const ta = entMap.get(a)?.type ?? "";
    const tb = entMap.get(b)?.type ?? "";
    return ta === tb ? (a < b ? -1 : 1) : ta < tb ? -1 : 1;
  };

  const angleOf = new Map<string, number>();
  pos.set(start, { id: start, x: 0, y: 0 });
  angleOf.set(start, -Math.PI / 2);

  // Deepest descendant depth per node, so an outer ring can clear inner branches.
  const subMax = new Map<string, number>();
  const computeMax = (id: string): number => {
    let m = depth.get(id)!;
    for (const c of children.get(id)!) m = Math.max(m, computeMax(c));
    subMax.set(id, m);
    return m;
  };
  computeMax(start);

  const RING_GAP = 240;

  // Ring 1/2: the seed's direct connections, split by verification.
  const direct = children.get(start)!;
  const core = direct.filter((id) => !isUnverified(id)).sort(byTypeThenId);
  const halo = direct.filter(isUnverified).sort(byTypeThenId);

  // Radius grows with node count so angular spacing stays roughly constant.
  const ringRadius = (count: number, min: number) =>
    Math.max(min, Math.round(27 * Math.max(count, 1)));
  const rCore = ringRadius(core.length, 300);
  // Push the halo beyond the deepest branch fanning out of the core ring.
  const coreExtraRings = core.length
    ? Math.max(0, ...core.map((id) => subMax.get(id)! - 1))
    : 0;
  const rHalo = Math.max(
    rCore + coreExtraRings * RING_GAP + 220,
    ringRadius(halo.length, 300)
  );

  const placeRing = (ring: string[], radius: number, offset: number) => {
    const n = ring.length;
    if (!n) return;
    ring.forEach((id, i) => {
      const angle = -Math.PI / 2 + offset + (i / n) * Math.PI * 2;
      angleOf.set(id, angle);
      pos.set(id, { id, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    });
  };
  placeRing(core, rCore, 0);
  // Offset the halo half a step so its nodes sit between the core spokes.
  placeRing(halo, rHalo, halo.length ? Math.PI / halo.length : 0);

  // Deeper nodes fan out within the parent's angular neighbourhood.
  const deeper = entities
    .map((e) => e.id)
    .filter((id) => (depth.get(id) ?? 0) >= 2)
    .sort((a, b) => depth.get(a)! - depth.get(b)!);

  const siblings = new Map<string, string[]>();
  for (const id of deeper) {
    const p = parent.get(id)!;
    if (!siblings.has(p)) siblings.set(p, []);
    siblings.get(p)!.push(id);
  }
  for (const arr of siblings.values()) arr.sort(byTypeThenId);

  for (const id of deeper) {
    const p = parent.get(id)!;
    const sibs = siblings.get(p)!;
    const idx = sibs.indexOf(id);
    const pAngle = angleOf.get(p) ?? 0;
    const spread = Math.min(Math.PI / 1.8, 0.34 * (sibs.length - 1));
    const angle =
      sibs.length > 1 ? pAngle - spread / 2 + (idx / (sibs.length - 1)) * spread : pAngle;
    angleOf.set(id, angle);
    const base = isUnverified(p) || (parent.get(p) && isUnverified(parent.get(p)!)) ? rHalo : rCore;
    const radius = base + (depth.get(id)! - 1) * RING_GAP;
    pos.set(id, { id, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }

  return pos;
}
