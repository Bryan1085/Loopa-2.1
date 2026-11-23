/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EditableMesh,
  SerializedEditableMesh,
  Vec2,
  Vec3,
} from './EditableMesh';
import {
  ProgressiveExecutionContext,
  runProgressiveTask,
} from './progressiveRunner';
import {
  MultiresSubdivisionMode,
  SerializedMultiresData,
} from '../project/types';

export interface MultiresLevelSummary {
  maxLevel: number;
  currentLevel: number;
  viewportLevel: number;
  mode: MultiresSubdivisionMode;
  autoViewportLod: boolean;
  baseVertexCount: number;
  baseFaceCount: number;
  levelCounts: Array<{
    level: number;
    vertices: number;
    faces: number;
    hasDetails: boolean;
  }>;
}

interface IndexedMultiresMesh {
  positions: Vec3[];
  faces: number[][];
  faceUvs: (Vec2[] | undefined)[];
  faceMaterials: (string | undefined)[];
}

interface LocalVertexFrame {
  tx: number;
  ty: number;
  tz: number;
  bx: number;
  by: number;
  bz: number;
  nx: number;
  ny: number;
  nz: number;
}

function numericEdgeKey(a: number, b: number): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

export function editableMeshToIndexed(mesh: EditableMesh): IndexedMultiresMesh {
  const indexById = new Map<string, number>();
  const positions: Vec3[] = mesh.vertices.map((v, idx) => {
    indexById.set(v.id, idx);
    return [v.position[0], v.position[1], v.position[2]];
  });

  const faces: number[][] = [];
  const faceUvs: (Vec2[] | undefined)[] = [];
  const faceMaterials: (string | undefined)[] = [];

  for (const f of mesh.faces) {
    const indices = f.vertexIds.map((vid) => indexById.get(vid) ?? -1);
    if (indices.every((i) => i >= 0)) {
      faces.push(indices);
      faceUvs.push(
        f.uvs && f.uvs.length === f.vertexIds.length
          ? f.uvs.map((uv) => [uv[0], uv[1]] as Vec2)
          : undefined,
      );
      faceMaterials.push(f.materialId);
    }
  }

  return { positions, faces, faceUvs, faceMaterials };
}

export function indexedToEditableMesh(
  indexed: IndexedMultiresMesh,
  _shading?: 'flat' | 'smooth',
): EditableMesh {
  const out = new EditableMesh();
  const vertIds = indexed.positions.map((p) => out.addVertex(p[0], p[1], p[2]).id);
  for (let i = 0; i < indexed.faces.length; i++) {
    const f = indexed.faces[i];
    const uvs = indexed.faceUvs[i];
    const created = out.addFace(
      f.map((idx) => vertIds[idx]),
      indexed.faceMaterials[i],
    );
    if (created && uvs && uvs.length === created.vertexIds.length) {
      created.uvs = uvs.map((uv) => [uv[0], uv[1]] as Vec2);
    }
  }
  out.clearCustomNormals();
  return out;
}

function runSubdivisionStepSync(
  input: IndexedMultiresMesh,
  mode: MultiresSubdivisionMode,
): IndexedMultiresMesh {
  const numVerts = input.positions.length;
  const numFaces = input.faces.length;

  const facePoints: Vec3[] = new Array(numFaces);
  for (let f = 0; f < numFaces; f++) {
    const fv = input.faces[f];
    const n = Math.max(1, fv.length);
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let i = 0; i < fv.length; i++) {
      const p = input.positions[fv[i]];
      sx += p[0];
      sy += p[1];
      sz += p[2];
    }
    facePoints[f] = [sx / n, sy / n, sz / n];
  }

  interface EdgeInfo {
    a: number;
    b: number;
    adjFaces: number[];
    midpoint: Vec3;
    edgePointIndex: number;
  }

  const edgeMap = new Map<string, number>();
  const edges: EdgeInfo[] = [];
  const vertFaces: number[][] = Array.from({ length: numVerts }, () => []);
  const vertEdges: number[][] = Array.from({ length: numVerts }, () => []);

  for (let f = 0; f < numFaces; f++) {
    const fv = input.faces[f];
    const n = fv.length;
    for (let i = 0; i < n; i++) {
      const v0 = fv[i];
      const v1 = fv[(i + 1) % n];
      vertFaces[v0].push(f);
      const key = numericEdgeKey(v0, v1);
      let eIdx = edgeMap.get(key);
      if (eIdx === undefined) {
        const p0 = input.positions[v0];
        const p1 = input.positions[v1];
        eIdx = edges.length;
        edges.push({
          a: Math.min(v0, v1),
          b: Math.max(v0, v1),
          adjFaces: [f],
          midpoint: [
            (p0[0] + p1[0]) * 0.5,
            (p0[1] + p1[1]) * 0.5,
            (p0[2] + p1[2]) * 0.5,
          ],
          edgePointIndex: -1,
        });
        edgeMap.set(key, eIdx);
        vertEdges[v0].push(eIdx);
        vertEdges[v1].push(eIdx);
      } else {
        edges[eIdx].adjFaces.push(f);
      }
    }
  }

  const outPositions: Vec3[] = new Array(numVerts + numFaces + edges.length);

  for (let i = 0; i < numVerts; i++) {
    const p = input.positions[i];
    if (mode === 'simple') {
      outPositions[i] = [p[0], p[1], p[2]];
      continue;
    }

    const incEdges = vertEdges[i];
    const incFaces = vertFaces[i];
    const boundaryNeighbors: number[] = [];
    for (const eIdx of incEdges) {
      const e = edges[eIdx];
      if (e.adjFaces.length < 2) {
        boundaryNeighbors.push(e.a === i ? e.b : e.a);
      }
    }

    if (boundaryNeighbors.length > 0) {
      if (boundaryNeighbors.length === 2) {
        const b0 = input.positions[boundaryNeighbors[0]];
        const b1 = input.positions[boundaryNeighbors[1]];
        outPositions[i] = [
          (6 * p[0] + b0[0] + b1[0]) / 8,
          (6 * p[1] + b0[1] + b1[1]) / 8,
          (6 * p[2] + b0[2] + b1[2]) / 8,
        ];
      } else {
        outPositions[i] = [p[0], p[1], p[2]];
      }
    } else if (incFaces.length >= 3 && incEdges.length === incFaces.length) {
      const n = incFaces.length;
      let fx = 0;
      let fy = 0;
      let fz = 0;
      for (const fIdx of incFaces) {
        const fp = facePoints[fIdx];
        fx += fp[0];
        fy += fp[1];
        fz += fp[2];
      }
      fx /= n;
      fy /= n;
      fz /= n;

      let rx = 0;
      let ry = 0;
      let rz = 0;
      for (const eIdx of incEdges) {
        const mp = edges[eIdx].midpoint;
        rx += mp[0];
        ry += mp[1];
        rz += mp[2];
      }
      rx /= n;
      ry /= n;
      rz /= n;

      outPositions[i] = [
        (fx + 2 * rx + (n - 3) * p[0]) / n,
        (fy + 2 * ry + (n - 3) * p[1]) / n,
        (fz + 2 * rz + (n - 3) * p[2]) / n,
      ];
    } else {
      outPositions[i] = [p[0], p[1], p[2]];
    }
  }

  for (let f = 0; f < numFaces; f++) {
    outPositions[numVerts + f] = facePoints[f];
  }

  for (let eIdx = 0; eIdx < edges.length; eIdx++) {
    const e = edges[eIdx];
    const pA = input.positions[e.a];
    const pB = input.positions[e.b];
    const outIdx = numVerts + numFaces + eIdx;
    e.edgePointIndex = outIdx;

    if (mode === 'catmull_clark' && e.adjFaces.length === 2) {
      const f0 = facePoints[e.adjFaces[0]];
      const f1 = facePoints[e.adjFaces[1]];
      outPositions[outIdx] = [
        (pA[0] + pB[0] + f0[0] + f1[0]) * 0.25,
        (pA[1] + pB[1] + f0[1] + f1[1]) * 0.25,
        (pA[2] + pB[2] + f0[2] + f1[2]) * 0.25,
      ];
    } else {
      outPositions[outIdx] = [
        (pA[0] + pB[0]) * 0.5,
        (pA[1] + pB[1]) * 0.5,
        (pA[2] + pB[2]) * 0.5,
      ];
    }
  }

  const outFaces: number[][] = [];
  const outFaceUvs: (Vec2[] | undefined)[] = [];
  const outFaceMaterials: (string | undefined)[] = [];

  for (let f = 0; f < numFaces; f++) {
    const fv = input.faces[f];
    const fUv = input.faceUvs[f];
    const fMat = input.faceMaterials[f];
    const n = fv.length;
    const facePointIdx = numVerts + f;

    let centerUv: Vec2 | undefined;
    if (fUv && fUv.length === n) {
      let cu = 0;
      let cv = 0;
      for (let i = 0; i < n; i++) {
        cu += fUv[i][0];
        cv += fUv[i][1];
      }
      centerUv = [cu / n, cv / n];
    }

    for (let i = 0; i < n; i++) {
      const vPrev = fv[(i - 1 + n) % n];
      const vCurr = fv[i];
      const vNext = fv[(i + 1) % n];

      const ePrevIdx = edgeMap.get(numericEdgeKey(vPrev, vCurr))!;
      const eNextIdx = edgeMap.get(numericEdgeKey(vCurr, vNext))!;

      outFaces.push([
        vCurr,
        edges[eNextIdx].edgePointIndex,
        facePointIdx,
        edges[ePrevIdx].edgePointIndex,
      ]);
      outFaceMaterials.push(fMat);

      if (fUv && centerUv) {
        const uvPrev = fUv[(i - 1 + n) % n];
        const uvCurr = fUv[i];
        const uvNext = fUv[(i + 1) % n];
        outFaceUvs.push([
          [uvCurr[0], uvCurr[1]],
          [(uvCurr[0] + uvNext[0]) * 0.5, (uvCurr[1] + uvNext[1]) * 0.5],
          [centerUv[0], centerUv[1]],
          [(uvPrev[0] + uvCurr[0]) * 0.5, (uvPrev[1] + uvCurr[1]) * 0.5],
        ]);
      } else {
        outFaceUvs.push(undefined);
      }
    }
  }

  return {
    positions: outPositions,
    faces: outFaces,
    faceUvs: outFaceUvs,
    faceMaterials: outFaceMaterials,
  };
}

async function runSubdivisionStepAsync(
  input: IndexedMultiresMesh,
  mode: MultiresSubdivisionMode,
  ctx?: ProgressiveExecutionContext,
  progressStart = 0,
  progressEnd = 1,
  stagePrefix = 'Subdividiendo',
): Promise<IndexedMultiresMesh> {
  if (!ctx || input.faces.length < 3500) {
    return runSubdivisionStepSync(input, mode);
  }

  const numVerts = input.positions.length;
  const numFaces = input.faces.length;
  const span = progressEnd - progressStart;

  const facePoints: Vec3[] = new Array(numFaces);
  for (let f = 0; f < numFaces; f++) {
    const fv = input.faces[f];
    const n = Math.max(1, fv.length);
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let i = 0; i < fv.length; i++) {
      const p = input.positions[fv[i]];
      sx += p[0];
      sy += p[1];
      sz += p[2];
    }
    facePoints[f] = [sx / n, sy / n, sz / n];
    if ((f & 511) === 0) {
      ctx.reportProgress(progressStart + span * 0.2 * (f / numFaces), stagePrefix);
      await ctx.checkYield(64);
    }
  }

  interface EdgeInfo {
    a: number;
    b: number;
    adjFaces: number[];
    midpoint: Vec3;
    edgePointIndex: number;
  }

  const edgeMap = new Map<string, number>();
  const edges: EdgeInfo[] = [];
  const vertFaces: number[][] = Array.from({ length: numVerts }, () => []);
  const vertEdges: number[][] = Array.from({ length: numVerts }, () => []);

  for (let f = 0; f < numFaces; f++) {
    const fv = input.faces[f];
    const n = fv.length;
    for (let i = 0; i < n; i++) {
      const v0 = fv[i];
      const v1 = fv[(i + 1) % n];
      vertFaces[v0].push(f);
      const key = numericEdgeKey(v0, v1);
      let eIdx = edgeMap.get(key);
      if (eIdx === undefined) {
        const p0 = input.positions[v0];
        const p1 = input.positions[v1];
        eIdx = edges.length;
        edges.push({
          a: Math.min(v0, v1),
          b: Math.max(v0, v1),
          adjFaces: [f],
          midpoint: [
            (p0[0] + p1[0]) * 0.5,
            (p0[1] + p1[1]) * 0.5,
            (p0[2] + p1[2]) * 0.5,
          ],
          edgePointIndex: -1,
        });
        edgeMap.set(key, eIdx);
        vertEdges[v0].push(eIdx);
        vertEdges[v1].push(eIdx);
      } else {
        edges[eIdx].adjFaces.push(f);
      }
    }
    if ((f & 511) === 0) {
      ctx.reportProgress(progressStart + span * (0.2 + 0.25 * (f / numFaces)), stagePrefix);
      await ctx.checkYield(64);
    }
  }

  const outPositions: Vec3[] = new Array(numVerts + numFaces + edges.length);

  for (let i = 0; i < numVerts; i++) {
    const p = input.positions[i];
    if (mode === 'simple') {
      outPositions[i] = [p[0], p[1], p[2]];
    } else {
      const incEdges = vertEdges[i];
      const incFaces = vertFaces[i];
      const boundaryNeighbors: number[] = [];
      for (const eIdx of incEdges) {
        const e = edges[eIdx];
        if (e.adjFaces.length < 2) {
          boundaryNeighbors.push(e.a === i ? e.b : e.a);
        }
      }

      if (boundaryNeighbors.length > 0) {
        if (boundaryNeighbors.length === 2) {
          const b0 = input.positions[boundaryNeighbors[0]];
          const b1 = input.positions[boundaryNeighbors[1]];
          outPositions[i] = [
            (6 * p[0] + b0[0] + b1[0]) / 8,
            (6 * p[1] + b0[1] + b1[1]) / 8,
            (6 * p[2] + b0[2] + b1[2]) / 8,
          ];
        } else {
          outPositions[i] = [p[0], p[1], p[2]];
        }
      } else if (incFaces.length >= 3 && incEdges.length === incFaces.length) {
        const n = incFaces.length;
        let fx = 0;
        let fy = 0;
        let fz = 0;
        for (const fIdx of incFaces) {
          const fp = facePoints[fIdx];
          fx += fp[0];
          fy += fp[1];
          fz += fp[2];
        }
        fx /= n;
        fy /= n;
        fz /= n;

        let rx = 0;
        let ry = 0;
        let rz = 0;
        for (const eIdx of incEdges) {
          const mp = edges[eIdx].midpoint;
          rx += mp[0];
          ry += mp[1];
          rz += mp[2];
        }
        rx /= n;
        ry /= n;
        rz /= n;

        outPositions[i] = [
          (fx + 2 * rx + (n - 3) * p[0]) / n,
          (fy + 2 * ry + (n - 3) * p[1]) / n,
          (fz + 2 * rz + (n - 3) * p[2]) / n,
        ];
      } else {
        outPositions[i] = [p[0], p[1], p[2]];
      }
    }
    if ((i & 511) === 0) {
      await ctx.checkYield(32);
    }
  }

  for (let f = 0; f < numFaces; f++) {
    outPositions[numVerts + f] = facePoints[f];
  }

  for (let eIdx = 0; eIdx < edges.length; eIdx++) {
    const e = edges[eIdx];
    const pA = input.positions[e.a];
    const pB = input.positions[e.b];
    const outIdx = numVerts + numFaces + eIdx;
    e.edgePointIndex = outIdx;

    if (mode === 'catmull_clark' && e.adjFaces.length === 2) {
      const f0 = facePoints[e.adjFaces[0]];
      const f1 = facePoints[e.adjFaces[1]];
      outPositions[outIdx] = [
        (pA[0] + pB[0] + f0[0] + f1[0]) * 0.25,
        (pA[1] + pB[1] + f0[1] + f1[1]) * 0.25,
        (pA[2] + pB[2] + f0[2] + f1[2]) * 0.25,
      ];
    } else {
      outPositions[outIdx] = [
        (pA[0] + pB[0]) * 0.5,
        (pA[1] + pB[1]) * 0.5,
        (pA[2] + pB[2]) * 0.5,
      ];
    }
    if ((eIdx & 1023) === 0) {
      await ctx.checkYield(32);
    }
  }

  const outFaces: number[][] = [];
  const outFaceUvs: (Vec2[] | undefined)[] = [];
  const outFaceMaterials: (string | undefined)[] = [];

  for (let f = 0; f < numFaces; f++) {
    const fv = input.faces[f];
    const fUv = input.faceUvs[f];
    const fMat = input.faceMaterials[f];
    const n = fv.length;
    const facePointIdx = numVerts + f;

    let centerUv: Vec2 | undefined;
    if (fUv && fUv.length === n) {
      let cu = 0;
      let cv = 0;
      for (let i = 0; i < n; i++) {
        cu += fUv[i][0];
        cv += fUv[i][1];
      }
      centerUv = [cu / n, cv / n];
    }

    for (let i = 0; i < n; i++) {
      const vPrev = fv[(i - 1 + n) % n];
      const vCurr = fv[i];
      const vNext = fv[(i + 1) % n];

      const ePrevIdx = edgeMap.get(numericEdgeKey(vPrev, vCurr))!;
      const eNextIdx = edgeMap.get(numericEdgeKey(vCurr, vNext))!;

      outFaces.push([
        vCurr,
        edges[eNextIdx].edgePointIndex,
        facePointIdx,
        edges[ePrevIdx].edgePointIndex,
      ]);
      outFaceMaterials.push(fMat);

      if (fUv && centerUv) {
        const uvPrev = fUv[(i - 1 + n) % n];
        const uvCurr = fUv[i];
        const uvNext = fUv[(i + 1) % n];
        outFaceUvs.push([
          [uvCurr[0], uvCurr[1]],
          [(uvCurr[0] + uvNext[0]) * 0.5, (uvCurr[1] + uvNext[1]) * 0.5],
          [centerUv[0], centerUv[1]],
          [(uvPrev[0] + uvCurr[0]) * 0.5, (uvPrev[1] + uvCurr[1]) * 0.5],
        ]);
      } else {
        outFaceUvs.push(undefined);
      }
    }

    if ((f & 511) === 0) {
      ctx.reportProgress(progressStart + span * (0.5 + 0.5 * (f / numFaces)), stagePrefix);
      await ctx.checkYield(64);
    }
  }

  return {
    positions: outPositions,
    faces: outFaces,
    faceUvs: outFaceUvs,
    faceMaterials: outFaceMaterials,
  };
}

/**
 * Computes orthonormal local Darboux / tangent frames `(T, B, N)` for every vertex
 * in an indexed mesh, enabling high-level sculpted details to follow macro deformations.
 */
function computeLocalVertexFrames(indexed: IndexedMultiresMesh): LocalVertexFrame[] {
  const numVerts = indexed.positions.length;
  const nxArr = new Float64Array(numVerts);
  const nyArr = new Float64Array(numVerts);
  const nzArr = new Float64Array(numVerts);
  const firstRefDx = new Float64Array(numVerts);
  const firstRefDy = new Float64Array(numVerts);
  const firstRefDz = new Float64Array(numVerts);
  const hasRefEdge = new Uint8Array(numVerts);

  for (let f = 0; f < indexed.faces.length; f++) {
    const fv = indexed.faces[f];
    const len = fv.length;
    if (len < 3) continue;

    // Newell face normal (magnitude proportional to 2 * area)
    let fnx = 0;
    let fny = 0;
    let fnz = 0;
    for (let i = 0; i < len; i++) {
      const a = indexed.positions[fv[i]];
      const b = indexed.positions[fv[(i + 1) % len]];
      fnx += (a[1] - b[1]) * (a[2] + b[2]);
      fny += (a[2] - b[2]) * (a[0] + b[0]);
      fnz += (a[0] - b[0]) * (a[1] + b[1]);
    }

    for (let i = 0; i < len; i++) {
      const vi = fv[i];
      nxArr[vi] += fnx;
      nyArr[vi] += fny;
      nzArr[vi] += fnz;
      if (!hasRefEdge[vi]) {
        const p0 = indexed.positions[vi];
        const p1 = indexed.positions[fv[(i + 1) % len]];
        const dx = p1[0] - p0[0];
        const dy = p1[1] - p0[1];
        const dz = p1[2] - p0[2];
        if (dx * dx + dy * dy + dz * dz > 1e-12) {
          firstRefDx[vi] = dx;
          firstRefDy[vi] = dy;
          firstRefDz[vi] = dz;
          hasRefEdge[vi] = 1;
        }
      }
    }
  }

  const frames: LocalVertexFrame[] = new Array(numVerts);
  for (let i = 0; i < numVerts; i++) {
    let nx = nxArr[i];
    let ny = nyArr[i];
    let nz = nzArr[i];
    const nLen = Math.hypot(nx, ny, nz);
    if (nLen > 1e-9) {
      nx /= nLen;
      ny /= nLen;
      nz /= nLen;
    } else {
      nx = 0;
      ny = 0;
      nz = 1;
    }

    let rx = hasRefEdge[i] ? firstRefDx[i] : Math.abs(nz) < 0.9 ? 0 : 1;
    let ry = hasRefEdge[i] ? firstRefDy[i] : 0;
    let rz = hasRefEdge[i] ? firstRefDz[i] : Math.abs(nz) < 0.9 ? 1 : 0;

    // Project reference edge perpendicular to N to form tangent T
    const dotRN = rx * nx + ry * ny + rz * nz;
    let tx = rx - dotRN * nx;
    let ty = ry - dotRN * ny;
    let tz = rz - dotRN * nz;
    let tLen = Math.hypot(tx, ty, tz);
    if (tLen < 1e-8) {
      // Fallback orthogonal axis
      const ax = Math.abs(nx) < 0.9 ? 1 : 0;
      const ay = Math.abs(nx) < 0.9 ? 0 : 1;
      const az = 0;
      tx = ay * nz - az * ny;
      ty = az * nx - ax * nz;
      tz = ax * ny - ay * nx;
      tLen = Math.hypot(tx, ty, tz) || 1;
    }
    tx /= tLen;
    ty /= tLen;
    tz /= tLen;

    // Bitangent B = N x T
    const bx = ny * tz - nz * ty;
    const by = nz * tx - nx * tz;
    const bz = nx * ty - ny * tx;

    frames[i] = { tx, ty, tz, bx, by, bz, nx, ny, nz };
  }
  return frames;
}

function applyTangentDeltas(
  indexed: IndexedMultiresMesh,
  deltas: number[] | undefined,
): void {
  if (!deltas || deltas.length === 0) return;
  const count = Math.min(indexed.positions.length, Math.floor(deltas.length / 3));
  if (count === 0) return;

  // Quick check: skip frame calculation if all deltas are zero
  let hasNonZero = false;
  for (let i = 0; i < count * 3; i++) {
    if (Math.abs(deltas[i]) > 1e-9) {
      hasNonZero = true;
      break;
    }
  }
  if (!hasNonZero) return;

  const frames = computeLocalVertexFrames(indexed);
  for (let i = 0; i < count; i++) {
    const dt = deltas[i * 3];
    const db = deltas[i * 3 + 1];
    const dn = deltas[i * 3 + 2];
    if (dt === 0 && db === 0 && dn === 0) continue;
    const f = frames[i];
    const p = indexed.positions[i];
    p[0] += dt * f.tx + db * f.bx + dn * f.nx;
    p[1] += dt * f.ty + db * f.by + dn * f.ny;
    p[2] += dt * f.tz + db * f.bz + dn * f.nz;
  }
}

function cloneDeltasRecord(
  deltasByLevel: Record<number, number[]>,
): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  for (const [k, v] of Object.entries(deltasByLevel)) {
    out[Number(k)] = [...v];
  }
  return out;
}

export function cloneMultiresData(
  multires: SerializedMultiresData,
): SerializedMultiresData {
  return {
    version: 1,
    mode: multires.mode,
    baseMesh: EditableMesh.fromJSON(multires.baseMesh).toJSON(),
    maxLevel: multires.maxLevel,
    currentLevel: multires.currentLevel,
    viewportLevel: multires.viewportLevel,
    autoViewportLod: multires.autoViewportLod,
    deltasByLevel: cloneDeltasRecord(multires.deltasByLevel),
  };
}

export function createInitialMultiresData(
  baseMesh: EditableMesh | SerializedEditableMesh,
  mode: MultiresSubdivisionMode = 'catmull_clark',
): SerializedMultiresData {
  const serialized =
    baseMesh instanceof EditableMesh
      ? baseMesh.toJSON()
      : EditableMesh.fromJSON(baseMesh).toJSON();
  return {
    version: 1,
    mode,
    baseMesh: serialized,
    maxLevel: 0,
    currentLevel: 0,
    viewportLevel: 0,
    autoViewportLod: true,
    deltasByLevel: {},
  };
}

export function evaluateMultiresLevelIndexed(
  multires: SerializedMultiresData,
  targetLevel: number,
): IndexedMultiresMesh {
  const clamped = Math.max(0, Math.min(multires.maxLevel, Math.round(targetLevel)));
  let indexed = editableMeshToIndexed(EditableMesh.fromJSON(multires.baseMesh));
  for (let lvl = 1; lvl <= clamped; lvl++) {
    indexed = runSubdivisionStepSync(indexed, multires.mode);
    applyTangentDeltas(indexed, multires.deltasByLevel[lvl]);
  }
  return indexed;
}

export function evaluateMultiresLevel(
  multires: SerializedMultiresData,
  targetLevel: number,
  shading?: 'flat' | 'smooth',
): EditableMesh {
  const indexed = evaluateMultiresLevelIndexed(multires, targetLevel);
  return indexedToEditableMesh(indexed, shading);
}

export async function evaluateMultiresLevelAsync(
  multires: SerializedMultiresData,
  targetLevel: number,
  options: {
    shading?: 'flat' | 'smooth';
    signal?: AbortSignal;
    onProgress?: (ratio: number, stageLabel: string) => void;
  } = {},
) {
  const clamped = Math.max(0, Math.min(multires.maxLevel, Math.round(targetLevel)));
  return runProgressiveTask(
    async (ctx) => {
      ctx.reportProgress(0.05, `Preparando nivel ${clamped}`);
      let indexed = editableMeshToIndexed(EditableMesh.fromJSON(multires.baseMesh));
      for (let lvl = 1; lvl <= clamped; lvl++) {
        const p0 = (lvl - 1) / Math.max(1, clamped);
        const p1 = lvl / Math.max(1, clamped);
        indexed = await runSubdivisionStepAsync(
          indexed,
          multires.mode,
          ctx,
          p0,
          p1,
          `Evaluando nivel ${lvl}/${clamped}`,
        );
        applyTangentDeltas(indexed, multires.deltasByLevel[lvl]);
      }
      ctx.reportProgress(1, `Nivel ${clamped} listo`);
      return indexedToEditableMesh(indexed, options.shading);
    },
    { signal: options.signal, onProgress: options.onProgress },
  );
}

/**
 * Adds a new progressive multiresolution subdivision level (`maxLevel + 1`),
 * running chunked & cancelable without mutating `existing` if cancelled.
 */
export async function addMultiresLevelAsync(
  sourceMesh: EditableMesh,
  existing: SerializedMultiresData | undefined,
  options: {
    mode?: MultiresSubdivisionMode;
    shading?: 'flat' | 'smooth';
    signal?: AbortSignal;
    onProgress?: (ratio: number, stageLabel: string) => void;
  } = {},
) {
  return runProgressiveTask(
    async (ctx) => {
      const baseMultires = existing
        ? cloneMultiresData(existing)
        : createInitialMultiresData(sourceMesh, options.mode ?? 'catmull_clark');
      const nextLevel = baseMultires.maxLevel + 1;

      ctx.reportProgress(0.05, `Evaluando base hasta nivel ${baseMultires.maxLevel}`);
      let indexed = editableMeshToIndexed(EditableMesh.fromJSON(baseMultires.baseMesh));
      for (let lvl = 1; lvl <= baseMultires.maxLevel; lvl++) {
        indexed = await runSubdivisionStepAsync(
          indexed,
          baseMultires.mode,
          ctx,
          (lvl - 1) / nextLevel,
          lvl / nextLevel,
          `Reconstruyendo nivel ${lvl}`,
        );
        applyTangentDeltas(indexed, baseMultires.deltasByLevel[lvl]);
      }

      indexed = await runSubdivisionStepAsync(
        indexed,
        baseMultires.mode,
        ctx,
        baseMultires.maxLevel / nextLevel,
        0.96,
        `Generando nivel Multires ${nextLevel}`,
      );

      // Initialize zero displacement delta vector for the new level
      baseMultires.deltasByLevel[nextLevel] = new Array(indexed.positions.length * 3).fill(0);
      baseMultires.maxLevel = nextLevel;
      baseMultires.currentLevel = nextLevel;
      baseMultires.viewportLevel = nextLevel;

      const outMesh = indexedToEditableMesh(indexed, options.shading);
      ctx.reportProgress(1, `Nivel ${nextLevel} generado`);
      return {
        multires: baseMultires,
        mesh: outMesh,
      };
    },
    { signal: options.signal, onProgress: options.onProgress },
  );
}

/**
 * Switches active working level (up or down) while keeping all upper-level sculpted deltas intact.
 */
export async function switchMultiresLevelAsync(
  existing: SerializedMultiresData,
  targetLevel: number,
  options: {
    shading?: 'flat' | 'smooth';
    signal?: AbortSignal;
    onProgress?: (ratio: number, stageLabel: string) => void;
  } = {},
) {
  const clamped = Math.max(0, Math.min(existing.maxLevel, Math.round(targetLevel)));
  const evalRes = await evaluateMultiresLevelAsync(existing, clamped, options);
  if (evalRes.status !== 'completed') return evalRes;

  const updated = cloneMultiresData(existing);
  updated.currentLevel = clamped;
  if (updated.viewportLevel > clamped) {
    updated.viewportLevel = clamped;
  } else if (updated.viewportLevel === existing.currentLevel) {
    updated.viewportLevel = clamped;
  }
  return {
    status: 'completed' as const,
    result: {
      multires: updated,
      mesh: evalRes.result,
    },
  };
}

/**
 * Stores sculpted or edited vertex changes made at `level` into `multires`:
 * - If `level === 0`: updates `baseMesh`, keeping all `deltasByLevel[1..maxLevel]` intact!
 * - If `level > 0`: decomposes `(editedPos - smoothBaseAtLevel)` into the surface's local
 *   tangent frame `(T, B, N)` and writes `deltasByLevel[level]`, preserving `deltasByLevel[level+1..maxLevel]`!
 */
export function commitMeshChangesToMultires(
  existing: SerializedMultiresData,
  editedMeshAtCurrentLevel: EditableMesh,
  level = existing.currentLevel,
): SerializedMultiresData {
  const next = cloneMultiresData(existing);
  const clampedLevel = Math.max(0, Math.min(next.maxLevel, Math.round(level)));

  if (clampedLevel === 0) {
    // Preserve base mesh edits cleanly when vertex/face counts still correspond or topology changed
    next.baseMesh = editedMeshAtCurrentLevel.toJSON();
    return next;
  }

  // Build smooth reference at `clampedLevel` from `clampedLevel - 1`
  const prevIndexed = evaluateMultiresLevelIndexed(next, clampedLevel - 1);
  const smoothAtLevel = runSubdivisionStepSync(prevIndexed, next.mode);

  if (editedMeshAtCurrentLevel.vertices.length !== smoothAtLevel.positions.length) {
    // Fallback if topology diverged outside multires: keep safe copy
    return createInitialMultiresData(editedMeshAtCurrentLevel, next.mode);
  }

  const frames = computeLocalVertexFrames(smoothAtLevel);
  const newDeltas = new Array<number>(smoothAtLevel.positions.length * 3);

  for (let i = 0; i < smoothAtLevel.positions.length; i++) {
    const editedP = editedMeshAtCurrentLevel.vertices[i].position;
    const baseP = smoothAtLevel.positions[i];
    const dx = editedP[0] - baseP[0];
    const dy = editedP[1] - baseP[1];
    const dz = editedP[2] - baseP[2];
    const f = frames[i];
    newDeltas[i * 3] = dx * f.tx + dy * f.ty + dz * f.tz;
    newDeltas[i * 3 + 1] = dx * f.bx + dy * f.by + dz * f.bz;
    newDeltas[i * 3 + 2] = dx * f.nx + dy * f.ny + dz * f.nz;
  }

  next.deltasByLevel[clampedLevel] = newDeltas;
  return next;
}

export function deleteMultiresHigherLevels(
  existing: SerializedMultiresData,
): SerializedMultiresData {
  const next = cloneMultiresData(existing);
  for (const lvlKey of Object.keys(next.deltasByLevel)) {
    const lvl = Number(lvlKey);
    if (lvl > next.currentLevel) {
      delete next.deltasByLevel[lvl];
    }
  }
  next.maxLevel = next.currentLevel;
  next.viewportLevel = Math.min(next.viewportLevel, next.maxLevel);
  return next;
}

export function getMultiresSummary(
  multires: SerializedMultiresData | undefined,
  currentMesh: EditableMesh | SerializedEditableMesh,
): MultiresLevelSummary {
  const verts = currentMesh.vertices.length;
  const faces = currentMesh.faces.length;
  if (!multires) {
    return {
      maxLevel: 0,
      currentLevel: 0,
      viewportLevel: 0,
      mode: 'catmull_clark',
      autoViewportLod: true,
      baseVertexCount: verts,
      baseFaceCount: faces,
      levelCounts: [
        {
          level: 0,
          vertices: verts,
          faces,
          hasDetails: false,
        },
      ],
    };
  }

  const baseV = multires.baseMesh.vertices.length;
  const baseF = multires.baseMesh.faces.length;
  const levelCounts: MultiresLevelSummary['levelCounts'] = [
    { level: 0, vertices: baseV, faces: baseF, hasDetails: false },
  ];

  let estF = baseF;
  let estV = baseV;
  for (let lvl = 1; lvl <= multires.maxLevel; lvl++) {
    estF = estF * 4;
    const deltas = multires.deltasByLevel[lvl];
    const vertsAtLvl = deltas ? Math.floor(deltas.length / 3) : Math.max(estV * 4, estF + 2);
    estV = vertsAtLvl;
    let hasDetails = false;
    if (deltas) {
      for (let i = 0; i < deltas.length; i++) {
        if (Math.abs(deltas[i]) > 1e-6) {
          hasDetails = true;
          break;
        }
      }
    }
    levelCounts.push({
      level: lvl,
      vertices: vertsAtLvl,
      faces: estF,
      hasDetails,
    });
  }

  return {
    maxLevel: multires.maxLevel,
    currentLevel: multires.currentLevel,
    viewportLevel: multires.viewportLevel,
    mode: multires.mode,
    autoViewportLod: multires.autoViewportLod,
    baseVertexCount: baseV,
    baseFaceCount: baseF,
    levelCounts,
  };
}
