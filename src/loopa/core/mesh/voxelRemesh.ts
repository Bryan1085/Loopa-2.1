/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EditableMesh, Vec3 } from './EditableMesh';
import { ProgressiveTaskResult, runProgressiveTask } from './progressiveRunner';

export interface VoxelRemeshOptions {
  voxelSize: number;
  smoothIterations?: number;
  preserveMaterialId?: string;
  signal?: AbortSignal;
  onProgress?: (ratio: number, stageLabel: string) => void;
}

export interface VoxelRemeshEstimate {
  nx: number;
  ny: number;
  nz: number;
  totalVoxels: number;
  estimatedVertices: number;
  estimatedFaces: number;
  clampedVoxelSize: number;
}

interface TriData {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  cx: number;
  cy: number;
  cz: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

function pointToTriangleDistSq(
  px: number,
  py: number,
  pz: number,
  t: TriData,
): number {
  const abx = t.bx - t.ax;
  const aby = t.by - t.ay;
  const abz = t.bz - t.az;
  const acx = t.cx - t.ax;
  const acy = t.cy - t.ay;
  const acz = t.cz - t.az;
  const apx = px - t.ax;
  const apy = py - t.ay;
  const apz = pz - t.az;

  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) {
    return apx * apx + apy * apy + apz * apz;
  }

  const bpx = px - t.bx;
  const bpy = py - t.by;
  const bpz = pz - t.bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) {
    return bpx * bpx + bpy * bpy + bpz * bpz;
  }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const qx = t.ax + v * abx - px;
    const qy = t.ay + v * aby - py;
    const qz = t.az + v * abz - pz;
    return qx * qx + qy * qy + qz * qz;
  }

  const cpx = px - t.cx;
  const cpy = py - t.cy;
  const cpz = pz - t.cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) {
    return cpx * cpx + cpy * cpy + cpz * cpz;
  }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const qx = t.ax + w * acx - px;
    const qy = t.ay + w * acy - py;
    const qz = t.az + w * acz - pz;
    return qx * qx + qy * qy + qz * qz;
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    const qx = t.bx + w * (t.cx - t.bx) - px;
    const qy = t.by + w * (t.cy - t.by) - py;
    const qz = t.bz + w * (t.cz - t.bz) - pz;
    return qx * qx + qy * qy + qz * qz;
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  const qx = t.ax + abx * v + acx * w - px;
  const qy = t.ay + aby * v + acy * w - py;
  const qz = t.az + abz * v + acz * w - pz;
  return qx * qx + qy * qy + qz * qz;
}

function computeMeshBounds(mesh: EditableMesh): {
  min: Vec3;
  max: Vec3;
} {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const v of mesh.vertices) {
    const [x, y, z] = v.position;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX)) {
    return { min: [-1, -1, -1], max: [1, 1, 1] };
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

export function estimateVoxelRemeshStats(
  mesh: EditableMesh,
  voxelSizeInput: number,
): VoxelRemeshEstimate {
  const { min, max } = computeMeshBounds(mesh);
  const spanX = Math.max(0.05, max[0] - min[0]);
  const spanY = Math.max(0.05, max[1] - min[1]);
  const spanZ = Math.max(0.05, max[2] - min[2]);
  const minDim = Math.min(spanX, spanY, spanZ);
  let voxelSize = Math.max(0.015, Math.min(Math.max(spanX, spanY, spanZ) * 0.5, voxelSizeInput));

  // Prevent absurdly large 3D grids (> 2.2M voxels) by clamping minimum voxel size relative to bounds
  const estPad = voxelSize * 2.5;
  const rawTotal =
    ((spanX + estPad * 2) / voxelSize) *
    ((spanY + estPad * 2) / voxelSize) *
    ((spanZ + estPad * 2) / voxelSize);
  if (rawTotal > 1_800_000) {
    const scale = Math.cbrt(rawTotal / 1_800_000);
    voxelSize = Math.max(voxelSize * scale, minDim / 180);
  }

  const pad = voxelSize * 2.5;
  const nx = Math.max(4, Math.ceil((spanX + pad * 2) / voxelSize) + 1);
  const ny = Math.max(4, Math.ceil((spanY + pad * 2) / voxelSize) + 1);
  const nz = Math.max(4, Math.ceil((spanZ + pad * 2) / voxelSize) + 1);
  const totalVoxels = nx * ny * nz;

  // Surface area approximation from mesh bounds to estimate output quads
  const surfaceAreaApprox = 2 * (spanX * spanY + spanY * spanZ + spanX * spanZ);
  const estimatedFaces = Math.max(
    24,
    Math.round(surfaceAreaApprox / Math.max(1e-4, voxelSize * voxelSize)),
  );
  const estimatedVertices = Math.max(26, estimatedFaces + 2);

  return {
    nx,
    ny,
    nz,
    totalVoxels,
    estimatedVertices,
    estimatedFaces,
    clampedVoxelSize: voxelSize,
  };
}

function buildTriangleList(mesh: EditableMesh): TriData[] {
  const tris: TriData[] = [];
  for (const face of mesh.faces) {
    const localTris = mesh.triangulateFaceLocalIndices(face);
    for (const [i0, i1, i2] of localTris) {
      const a = mesh.getVertex(face.vertexIds[i0])?.position;
      const b = mesh.getVertex(face.vertexIds[i1])?.position;
      const c = mesh.getVertex(face.vertexIds[i2])?.position;
      if (!a || !b || !c) continue;
      tris.push({
        ax: a[0],
        ay: a[1],
        az: a[2],
        bx: b[0],
        by: b[1],
        bz: b[2],
        cx: c[0],
        cy: c[1],
        cz: c[2],
        minX: Math.min(a[0], b[0], c[0]),
        minY: Math.min(a[1], b[1], c[1]),
        minZ: Math.min(a[2], b[2], c[2]),
        maxX: Math.max(a[0], b[0], c[0]),
        maxY: Math.max(a[1], b[1], c[1]),
        maxZ: Math.max(a[2], b[2], c[2]),
      });
    }
  }
  return tris;
}

/**
 * Ray-triangle Z-intersection for 2D (px, py) column parity test.
 * Uses slight jitter tie-breaking on edge/vertex hits for parity stability.
 */
function intersectRayZTriangle(px: number, py: number, t: TriData): number | null {
  const qx = px + 1.27e-6;
  const qy = py + 1.73e-6;
  if (qx < t.minX || qx > t.maxX || qy < t.minY || qy > t.maxY) return null;

  const v0x = t.cx - t.ax;
  const v0y = t.cy - t.ay;
  const v1x = t.bx - t.ax;
  const v1y = t.by - t.ay;
  const v2x = qx - t.ax;
  const v2y = qy - t.ay;

  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;

  const denom = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denom) < 1e-14) return null;

  const invDenom = 1 / denom;
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
  if (u >= 0 && v >= 0 && u + v <= 1) {
    return t.az + u * (t.cz - t.az) + v * (t.bz - t.az);
  }
  return null;
}

function applyTaubinSmooth(
  positions: Vec3[],
  faces: number[][],
  iterations: number,
): void {
  if (iterations <= 0 || positions.length === 0) return;
  const neighbors: Set<number>[] = Array.from({ length: positions.length }, () => new Set());
  for (const f of faces) {
    for (let i = 0; i < f.length; i++) {
      const a = f[i];
      const b = f[(i + 1) % f.length];
      neighbors[a].add(b);
      neighbors[b].add(a);
    }
  }

  const next: Vec3[] = positions.map((p) => [p[0], p[1], p[2]]);
  const step = (factor: number) => {
    for (let i = 0; i < positions.length; i++) {
      const nSet = neighbors[i];
      if (nSet.size === 0) continue;
      let ax = 0;
      let ay = 0;
      let az = 0;
      for (const j of nSet) {
        ax += positions[j][0];
        ay += positions[j][1];
        az += positions[j][2];
      }
      const inv = 1 / nSet.size;
      const p = positions[i];
      next[i][0] = p[0] + factor * (ax * inv - p[0]);
      next[i][1] = p[1] + factor * (ay * inv - p[1]);
      next[i][2] = p[2] + factor * (az * inv - p[2]);
    }
    for (let i = 0; i < positions.length; i++) {
      positions[i][0] = next[i][0];
      positions[i][1] = next[i][1];
      positions[i][2] = next[i][2];
    }
  };

  for (let it = 0; it < iterations; it++) {
    step(0.45);
    step(-0.47);
  }
}

/**
 * Progressive, cancelable Voxel Remesh via narrow-band SDF + Surface Nets quad extraction.
 */
export async function runVoxelRemeshAsync(
  sourceMesh: EditableMesh,
  options: VoxelRemeshOptions,
): Promise<ProgressiveTaskResult<EditableMesh>> {
  return runProgressiveTask(
    async (ctx) => {
      if (sourceMesh.faces.length === 0) {
        return sourceMesh.clone();
      }

      const estimate = estimateVoxelRemeshStats(sourceMesh, options.voxelSize);
      const voxelSize = estimate.clampedVoxelSize;
      const { min } = computeMeshBounds(sourceMesh);
      const pad = voxelSize * 2.5;
      const originX = min[0] - pad;
      const originY = min[1] - pad;
      const originZ = min[2] - pad;
      const { nx, ny, nz } = estimate;

      ctx.reportProgress(0.05, 'Triangulando malla de entrada');
      const tris = buildTriangleList(sourceMesh);
      if (tris.length === 0) return sourceMesh.clone();
      await ctx.checkYield(20);

      // Bucket triangles into 2D XY grid columns for fast ray-parity tests & 3D narrow-band distance
      const colTris: number[][] = Array.from({ length: nx * ny }, () => []);
      for (let ti = 0; ti < tris.length; ti++) {
        const t = tris[ti];
        const ix0 = Math.max(0, Math.floor((t.minX - originX) / voxelSize));
        const ix1 = Math.min(nx - 1, Math.ceil((t.maxX - originX) / voxelSize));
        const iy0 = Math.max(0, Math.floor((t.minY - originY) / voxelSize));
        const iy1 = Math.min(ny - 1, Math.ceil((t.maxY - originY) / voxelSize));
        for (let iy = iy0; iy <= iy1; iy++) {
          for (let ix = ix0; ix <= ix1; ix++) {
            colTris[ix + iy * nx].push(ti);
          }
        }
      }

      const distField = new Float32Array(nx * ny * nz);
      distField.fill(voxelSize * 2);

      // 1. Inside/outside classification along Z columns via ray-triangle intersection parity
      ctx.reportProgress(0.12, 'Clasificando volumen interior');
      for (let iy = 0; iy < ny; iy++) {
        const py = originY + iy * voxelSize;
        for (let ix = 0; ix < nx; ix++) {
          const px = originX + ix * voxelSize;
          const cTris = colTris[ix + iy * nx];
          if (cTris.length === 0) continue;

          const zHits: number[] = [];
          for (const ti of cTris) {
            const zHit = intersectRayZTriangle(px, py, tris[ti]);
            if (zHit !== null) zHits.push(zHit);
          }
          if (zHits.length < 2) continue;
          zHits.sort((a, b) => a - b);

          let hitIdx = 0;
          let inside = false;
          for (let iz = 0; iz < nz; iz++) {
            const pz = originZ + iz * voxelSize;
            while (hitIdx < zHits.length && zHits[hitIdx] < pz) {
              inside = !inside;
              hitIdx++;
            }
            if (inside) {
              distField[(iz * ny + iy) * nx + ix] = -voxelSize * 2;
            }
          }
        }
        if ((iy & 15) === 0) {
          ctx.reportProgress(0.12 + 0.25 * (iy / ny), 'Clasificando volumen interior');
          await ctx.checkYield(24);
        }
      }

      // 2. Narrow-band exact point-to-triangle distance around each triangle AABB
      ctx.reportProgress(0.38, 'Calculando campo de distancia SDF');
      const bandSq = new Float32Array(nx * ny * nz);
      const maxBandDist = voxelSize * 1.9;
      bandSq.fill(maxBandDist * maxBandDist);

      const bandVoxels = 2;
      for (let ti = 0; ti < tris.length; ti++) {
        const t = tris[ti];
        const ix0 = Math.max(0, Math.floor((t.minX - originX) / voxelSize) - bandVoxels);
        const ix1 = Math.min(nx - 1, Math.ceil((t.maxX - originX) / voxelSize) + bandVoxels);
        const iy0 = Math.max(0, Math.floor((t.minY - originY) / voxelSize) - bandVoxels);
        const iy1 = Math.min(ny - 1, Math.ceil((t.maxY - originY) / voxelSize) + bandVoxels);
        const iz0 = Math.max(0, Math.floor((t.minZ - originZ) / voxelSize) - bandVoxels);
        const iz1 = Math.min(nz - 1, Math.ceil((t.maxZ - originZ) / voxelSize) + bandVoxels);

        for (let iz = iz0; iz <= iz1; iz++) {
          const pz = originZ + iz * voxelSize;
          const zOff = iz * ny;
          for (let iy = iy0; iy <= iy1; iy++) {
            const py = originY + iy * voxelSize;
            const yOff = (zOff + iy) * nx;
            for (let ix = ix0; ix <= ix1; ix++) {
              const px = originX + ix * voxelSize;
              const dSq = pointToTriangleDistSq(px, py, pz, t);
              const idx = yOff + ix;
              if (dSq < bandSq[idx]) {
                bandSq[idx] = dSq;
              }
            }
          }
        }
        if ((ti & 255) === 0) {
          ctx.reportProgress(0.38 + 0.28 * (ti / tris.length), 'Calculando campo de distancia SDF');
          await ctx.checkYield(48);
        }
      }

      const totalGrid = nx * ny * nz;
      const limitSq = maxBandDist * maxBandDist;
      for (let i = 0; i < totalGrid; i++) {
        if (bandSq[i] < limitSq) {
          const sign = distField[i] < 0 ? -1 : 1;
          distField[i] = sign * Math.sqrt(bandSq[i]);
        }
      }

      // 3. Surface Nets dual vertex extraction
      ctx.reportProgress(0.68, 'Extrayendo superficie Surface Nets');
      const cxMax = nx - 1;
      const cyMax = ny - 1;
      const czMax = nz - 1;
      const cellToVertex = new Int32Array(cxMax * cyMax * czMax);
      cellToVertex.fill(-1);
      const outPositions: Vec3[] = [];

      const cornerOffsets: [number, number, number][] = [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
        [0, 0, 1],
        [1, 0, 1],
        [0, 1, 1],
        [1, 1, 1],
      ];
      const cubeEdges: [number, number][] = [
        [0, 1],
        [2, 3],
        [4, 5],
        [6, 7],
        [0, 2],
        [1, 3],
        [4, 6],
        [5, 7],
        [0, 4],
        [1, 5],
        [2, 6],
        [3, 7],
      ];

      const cornerVals = new Float32Array(8);
      for (let iz = 0; iz < czMax; iz++) {
        for (let iy = 0; iy < cyMax; iy++) {
          for (let ix = 0; ix < cxMax; ix++) {
            let mask = 0;
            for (let c = 0; c < 8; c++) {
              const [ox, oy, oz] = cornerOffsets[c];
              const v = distField[((iz + oz) * ny + (iy + oy)) * nx + (ix + ox)];
              cornerVals[c] = v;
              if (v < 0) mask |= 1 << c;
            }
            if (mask === 0 || mask === 255) continue;

            let sx = 0;
            let sy = 0;
            let sz = 0;
            let crossings = 0;
            for (const [ca, cb] of cubeEdges) {
              const va = cornerVals[ca];
              const vb = cornerVals[cb];
              if ((va < 0) === (vb < 0)) continue;
              const denom = va - vb;
              const t = Math.abs(denom) > 1e-8 ? va / denom : 0.5;
              const [ax, ay, az] = cornerOffsets[ca];
              const [bx, by, bz] = cornerOffsets[cb];
              sx += ax + (bx - ax) * t;
              sy += ay + (by - ay) * t;
              sz += az + (bz - az) * t;
              crossings++;
            }

            if (crossings > 0) {
              const vIdx = outPositions.length;
              outPositions.push([
                originX + (ix + sx / crossings) * voxelSize,
                originY + (iy + sy / crossings) * voxelSize,
                originZ + (iz + sz / crossings) * voxelSize,
              ]);
              cellToVertex[(iz * cyMax + iy) * cxMax + ix] = vIdx;
            }
          }
        }
        if ((iz & 7) === 0) {
          ctx.reportProgress(0.68 + 0.14 * (iz / czMax), 'Extrayendo superficie Surface Nets');
          await ctx.checkYield(32);
        }
      }

      // 4. Emit quads along interior sign-changing grid edges
      ctx.reportProgress(0.84, 'Construyendo topología uniforme');
      const outFaces: number[][] = [];
      const getCellV = (x: number, y: number, z: number): number =>
        cellToVertex[(z * cyMax + y) * cxMax + x];

      // Edges parallel to X, Y, Z axes
      for (let iz = 1; iz < nz - 1; iz++) {
        for (let iy = 1; iy < ny - 1; iy++) {
          for (let ix = 0; ix < cxMax; ix++) {
            const v0 = distField[(iz * ny + iy) * nx + ix];
            const v1 = distField[(iz * ny + iy) * nx + ix + 1];
            if ((v0 < 0) === (v1 < 0)) continue;
            const c0 = getCellV(ix, iy - 1, iz - 1);
            const c1 = getCellV(ix, iy, iz - 1);
            const c2 = getCellV(ix, iy, iz);
            const c3 = getCellV(ix, iy - 1, iz);
            if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) continue;
            // Outward orientation when gradient points from v0 (inside <0) to v1 (outside >=0) along +X
            if (v0 < 0) {
              outFaces.push([c0, c1, c2, c3]);
            } else {
              outFaces.push([c0, c3, c2, c1]);
            }
          }
        }
      }

      for (let iz = 1; iz < nz - 1; iz++) {
        for (let iy = 0; iy < cyMax; iy++) {
          for (let ix = 1; ix < nx - 1; ix++) {
            const v0 = distField[(iz * ny + iy) * nx + ix];
            const v1 = distField[(iz * ny + iy + 1) * nx + ix];
            if ((v0 < 0) === (v1 < 0)) continue;
            const c0 = getCellV(ix - 1, iy, iz - 1);
            const c1 = getCellV(ix - 1, iy, iz);
            const c2 = getCellV(ix, iy, iz);
            const c3 = getCellV(ix, iy, iz - 1);
            if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) continue;
            if (v0 < 0) {
              outFaces.push([c0, c1, c2, c3]);
            } else {
              outFaces.push([c0, c3, c2, c1]);
            }
          }
        }
      }

      for (let iz = 0; iz < czMax; iz++) {
        for (let iy = 1; iy < ny - 1; iy++) {
          for (let ix = 1; ix < nx - 1; ix++) {
            const v0 = distField[(iz * ny + iy) * nx + ix];
            const v1 = distField[((iz + 1) * ny + iy) * nx + ix];
            if ((v0 < 0) === (v1 < 0)) continue;
            const c0 = getCellV(ix - 1, iy - 1, iz);
            const c1 = getCellV(ix, iy - 1, iz);
            const c2 = getCellV(ix, iy, iz);
            const c3 = getCellV(ix - 1, iy, iz);
            if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) continue;
            if (v0 < 0) {
              outFaces.push([c0, c1, c2, c3]);
            } else {
              outFaces.push([c0, c3, c2, c1]);
            }
          }
        }
      }

      await ctx.checkYield(0);
      applyTaubinSmooth(outPositions, outFaces, options.smoothIterations ?? 2);

      if (outPositions.length === 0 || outFaces.length === 0) {
        return sourceMesh.clone();
      }

      ctx.reportProgress(0.95, 'Ensamblando malla final');
      const remeshed = new EditableMesh();
      const vertIds = outPositions.map((p) => remeshed.addVertex(p[0], p[1], p[2]).id);
      for (const f of outFaces) {
        remeshed.addFace(
          [vertIds[f[0]], vertIds[f[1]], vertIds[f[2]], vertIds[f[3]]],
          options.preserveMaterialId,
        );
      }
      remeshed.pruneOrphanVertices();
      ctx.reportProgress(1, 'Remesh completado');
      return remeshed;
    },
    { signal: options.signal, onProgress: options.onProgress },
  );
}
