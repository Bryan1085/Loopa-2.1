import { describe, expect, it } from "vitest";
import {
  doesSegmentIntersectLink,
  getLinkCurveOffset,
  pointToSegmentDistance,
  sampleCubicBezierLink,
} from "./nodeLinkCut";

describe("nodeLinkCut", () => {
  it("computes curve offset and samples cubic bezier endpoints cleanly", () => {
    expect(getLinkCurveOffset({ x: 100, y: 100 }, { x: 120, y: 100 })).toBe(48);
    expect(getLinkCurveOffset({ x: 100, y: 100 }, { x: 500, y: 100 })).toBe(180);

    const points = sampleCubicBezierLink({ x: 100, y: 100 }, { x: 300, y: 200 }, 24);
    expect(points).toHaveLength(25);
    expect(points[0]).toEqual({ x: 100, y: 100 });
    expect(points[points.length - 1]).toEqual({ x: 300, y: 200 });
  });

  it("detects intersections across horizontal and curved cubic links while ignoring distant strokes", () => {
    const start = { x: 100, y: 150 };
    const end = { x: 400, y: 250 };

    const centerCut = doesSegmentIntersectLink(
      { x: 250, y: 100 },
      { x: 250, y: 300 },
      start,
      end,
      12,
    );
    expect(centerCut.hit).toBe(true);
    expect(centerCut.hitPoint).not.toBeNull();

    const nearToleranceCut = doesSegmentIntersectLink(
      { x: 250, y: 192 },
      { x: 250, y: 195 },
      start,
      end,
      14,
    );
    expect(nearToleranceCut.hit).toBe(true);

    const miss = doesSegmentIntersectLink(
      { x: 50, y: 20 },
      { x: 450, y: 40 },
      start,
      end,
      12,
    );
    expect(miss.hit).toBe(false);
    expect(miss.hitPoint).toBeUndefined();
  });

  it("handles degenerate zero-length point hits within tolerance", () => {
    expect(pointToSegmentDistance({ x: 5, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 }).distance).toBe(4);
    const pointTap = doesSegmentIntersectLink(
      { x: 200, y: 105 },
      { x: 200, y: 105 },
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      12,
    );
    expect(pointTap.hit).toBe(true);
  });
});
