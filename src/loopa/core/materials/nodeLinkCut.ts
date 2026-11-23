export interface Point2D {
  x: number;
  y: number;
}

export interface LinkHitResult {
  hit: boolean;
  hitPoint?: Point2D;
}

export function getLinkCurveOffset(start: Point2D, end: Point2D): number {
  return Math.max(48, Math.abs(end.x - start.x) * 0.45);
}

export function sampleCubicBezierLink(
  start: Point2D,
  end: Point2D,
  steps = 24,
): Point2D[] {
  const curve = getLinkCurveOffset(start, end);
  const cp1: Point2D = { x: start.x + curve, y: start.y };
  const cp2: Point2D = { x: end.x - curve, y: end.y };
  const points: Point2D[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    const a = mt2 * mt;
    const b = 3 * mt2 * t;
    const c = 3 * mt * t2;
    const d = t2 * t;

    points.push({
      x: a * start.x + b * cp1.x + c * cp2.x + d * end.x,
      y: a * start.y + b * cp1.y + c * cp2.y + d * end.y,
    });
  }

  return points;
}

export function pointToSegmentDistance(
  point: Point2D,
  segStart: Point2D,
  segEnd: Point2D,
): { distance: number; closest: Point2D } {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq <= 1e-8) {
    return {
      distance: Math.hypot(point.x - segStart.x, point.y - segStart.y),
      closest: { ...segStart },
    };
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lenSq,
    ),
  );
  const closest = {
    x: segStart.x + t * dx,
    y: segStart.y + t * dy,
  };
  return {
    distance: Math.hypot(point.x - closest.x, point.y - closest.y),
    closest,
  };
}

function getSegmentsIntersectionPoint(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D,
): Point2D | null {
  const rX = a2.x - a1.x;
  const rY = a2.y - a1.y;
  const sX = b2.x - b1.x;
  const sY = b2.y - b1.y;

  const denom = rX * sY - rY * sX;
  const qpx = b1.x - a1.x;
  const qpy = b1.y - a1.y;

  if (Math.abs(denom) <= 1e-8) {
    return null;
  }

  const t = (qpx * sY - qpy * sX) / denom;
  const u = (qpx * rY - qpy * rX) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: a1.x + t * rX,
      y: a1.y + t * rY,
    };
  }

  return null;
}

export function doesSegmentIntersectLink(
  segStart: Point2D,
  segEnd: Point2D,
  linkStart: Point2D,
  linkEnd: Point2D,
  tolerance = 14,
): LinkHitResult {
  const curve = getLinkCurveOffset(linkStart, linkEnd);
  const minLinkX = Math.min(linkStart.x, linkEnd.x) - curve - tolerance;
  const maxLinkX = Math.max(linkStart.x, linkEnd.x) + curve + tolerance;
  const minLinkY = Math.min(linkStart.y, linkEnd.y) - tolerance;
  const maxLinkY = Math.max(linkStart.y, linkEnd.y) + tolerance;

  const minSegX = Math.min(segStart.x, segEnd.x);
  const maxSegX = Math.max(segStart.x, segEnd.x);
  const minSegY = Math.min(segStart.y, segEnd.y);
  const maxSegY = Math.max(segStart.y, segEnd.y);

  if (
    maxSegX < minLinkX ||
    minSegX > maxLinkX ||
    maxSegY < minLinkY ||
    minSegY > maxLinkY
  ) {
    return { hit: false };
  }

  const samples = sampleCubicBezierLink(linkStart, linkEnd, 24);
  let bestDistance = Infinity;
  let bestPoint: Point2D | undefined;

  for (let i = 0; i < samples.length - 1; i += 1) {
    const b1 = samples[i];
    const b2 = samples[i + 1];

    const intersection = getSegmentsIntersectionPoint(segStart, segEnd, b1, b2);
    if (intersection) {
      return { hit: true, hitPoint: intersection };
    }

    const candidates = [
      pointToSegmentDistance(segStart, b1, b2),
      pointToSegmentDistance(segEnd, b1, b2),
      (() => {
        const d = pointToSegmentDistance(b1, segStart, segEnd);
        return { distance: d.distance, closest: b1 };
      })(),
      (() => {
        const d = pointToSegmentDistance(b2, segStart, segEnd);
        return { distance: d.distance, closest: b2 };
      })(),
    ];

    for (const candidate of candidates) {
      if (candidate.distance < bestDistance) {
        bestDistance = candidate.distance;
        bestPoint = candidate.closest;
      }
    }
  }

  if (bestDistance <= tolerance) {
    return { hit: true, hitPoint: bestPoint };
  }

  return { hit: false };
}
