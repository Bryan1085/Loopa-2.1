/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { EditableMesh, MeshFace, Vec2 } from './EditableMesh';
import { SculptDyntopoSettings, SculptSymmetryAxes } from '../project/types';

export interface DyntopoStepResult {
  modified: boolean;
  splitCount: number;
  collapseCount: number;
  hitBudgetLimit: boolean;
}

function getMirrorAxes(symmetry: SculptSymmetryAxes): [number, number, number][] {
  const xs = symmetry.x ? [1, -1] : [1];
  const ys = symmetry.y ? [1, -1] : [1];
  const zs = symmetry.z ? [1, -1] : [1];
  const out: [number, number, number][] = [];
  for (const sx of xs) {
    for (const sy of ys) {
      for (const sz of zs) {
        out.push([sx, sy, sz]);
      }
    }
  }
  return out;
}

function lerpUv(a: Vec2 | undefined, b: Vec2 | undefined): Vec2 | undefined {
  if (!a || !b) return undefined;
  return [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
}

/**
 * Triangulates any quad/n-gon faces near the brush sphere so Dyntopo edge splits
 * and collapses maintain closed triangle topology without T-junctions.
 */
function ensureLocalFacesTriangulated(
  mesh: EditableMesh,
  candidateFaceIds: Set<string>,
): boolean {
  let changed = false;
  const toReplace: MeshFace[] = [];
  for (const fid of candidateFaceIds) {
    const face = mesh.getFace(fid);
    if (face && face.vertexIds.length > 3) {
      toReplace.push(face);
    }
  }
  if (toReplace.length === 0) return false;

  const removeSet = new Set(toReplace.map((f) => f.id));
  const replacements: Array<{
    vids: string[];
    matId?: string;
    uvs?: Vec2[];
  }> = [];

  for (const face of toReplace) {
    const tris = mesh.triangulateFaceLocalIndices(face);
    const hasFaceUvs =
      Array.isArray(face.uvs) && face.uvs.length === face.vertexIds.length;
    for (const [i0, i1, i2] of tris) {
      const vids = [face.vertexIds[i0], face.vertexIds[i1], face.vertexIds[i2]];
      const uvs: Vec2[] | undefined = hasFaceUvs
        ? [
            [face.uvs![i0][0], face.uvs![i0][1]],
            [face.uvs![i1][0], face.uvs![i1][1]],
            [face.uvs![i2][0], face.uvs![i2][1]],
          ]
        : undefined;
      replacements.push({ vids, matId: face.materialId, uvs });
    }
  }

  mesh.deleteFaces(removeSet);
  for (const item of replacements) {
    const created = mesh.addFace(item.vids, item.matId);
    if (created && item.uvs) {
      created.uvs = item.uvs;
    }
  }
  changed = true;
  return changed;
}

/**
 * Splits edge (v0, v1) by inserting midpoint vertex `vm` and subdividing adjacent faces
 * (triangles split 1->2 cleanly; polygons insert `vm` into their loop preserving manifold edges).
 */
function splitMeshEdge(
  mesh: EditableMesh,
  edgeId: string,
): boolean {
  const edge = mesh.getEdge(edgeId);
  if (!edge) return false;
  const v0 = mesh.getVertex(edge.v0);
  const v1 = mesh.getVertex(edge.v1);
  if (!v0 || !v1) return false;

  const adjFaceIds = mesh.getFacesForEdge(edgeId);
  if (adjFaceIds.length === 0) return false;

  const mx = (v0.position[0] + v1.position[0]) * 0.5;
  const my = (v0.position[1] + v1.position[1]) * 0.5;
  const mz = (v0.position[2] + v1.position[2]) * 0.5;
  const vm = mesh.addVertex(mx, my, mz);
  if (v0.uv && v1.uv) {
    vm.uv = [(v0.uv[0] + v1.uv[0]) * 0.5, (v0.uv[1] + v1.uv[1]) * 0.5];
  }

  const wasSeam = Boolean(edge.isSeam);
  const facesToDelete = new Set<string>();
  const facesToAdd: Array<{
    vids: string[];
    matId?: string;
    uvs?: Vec2[];
  }> = [];

  for (const fid of adjFaceIds) {
    const face = mesh.getFace(fid);
    if (!face) continue;
    const n = face.vertexIds.length;
    const hasUvs = Array.isArray(face.uvs) && face.uvs.length === n;

    // Locate edge orientation inside face
    let idxA = -1;
    let idxB = -1;
    for (let i = 0; i < n; i++) {
      const a = face.vertexIds[i];
      const b = face.vertexIds[(i + 1) % n];
      if ((a === edge.v0 && b === edge.v1) || (a === edge.v1 && b === edge.v0)) {
        idxA = i;
        idxB = (i + 1) % n;
        break;
      }
    }
    if (idxA === -1) continue;

    facesToDelete.add(fid);
    if (n === 3) {
      const idxC = (idxB + 1) % 3;
      const va = face.vertexIds[idxA];
      const vb = face.vertexIds[idxB];
      const vc = face.vertexIds[idxC];
      const uvA = hasUvs ? face.uvs![idxA] : undefined;
      const uvB = hasUvs ? face.uvs![idxB] : undefined;
      const uvC = hasUvs ? face.uvs![idxC] : undefined;
      const uvM = lerpUv(uvA, uvB);

      facesToAdd.push({
        vids: [va, vm.id, vc],
        matId: face.materialId,
        uvs: uvA && uvM && uvC ? [[uvA[0], uvA[1]], uvM, [uvC[0], uvC[1]]] : undefined,
      });
      facesToAdd.push({
        vids: [vm.id, vb, vc],
        matId: face.materialId,
        uvs: uvM && uvB && uvC ? [uvM, [uvB[0], uvB[1]], [uvC[0], uvC[1]]] : undefined,
      });
    } else {
      // Insert vm between idxA and idxB in polygon
      const nextVids: string[] = [];
      const nextUvs: Vec2[] = [];
      for (let i = 0; i < n; i++) {
        nextVids.push(face.vertexIds[i]);
        if (hasUvs) nextUvs.push([face.uvs![i][0], face.uvs![i][1]]);
        if (i === idxA) {
          nextVids.push(vm.id);
          if (hasUvs) {
            const mUv = lerpUv(face.uvs![idxA], face.uvs![idxB]);
            if (mUv) nextUvs.push(mUv);
          }
        }
      }
      facesToAdd.push({
        vids: nextVids,
        matId: face.materialId,
        uvs: hasUvs && nextUvs.length === nextVids.length ? nextUvs : undefined,
      });
    }
  }

  // Remove old faces and old edge, then rebuild faces
  mesh.faces = mesh.faces.filter((f) => !facesToDelete.has(f.id));
  mesh.edges = mesh.edges.filter((e) => e.id !== edgeId);
  mesh.rebuildIndices();

  for (const item of facesToAdd) {
    const created = mesh.addFace(item.vids, item.matId);
    if (created && item.uvs) {
      created.uvs = item.uvs;
    }
  }

  if (wasSeam) {
    const eA = mesh.findEdgeId(edge.v0, vm.id);
    const eB = mesh.findEdgeId(vm.id, edge.v1);
    if (eA) {
      const refA = mesh.getEdge(eA);
      if (refA) refA.isSeam = true;
    }
    if (eB) {
      const refB = mesh.getEdge(eB);
      if (refB) refB.isSeam = true;
    }
  }

  return true;
}

/**
 * Safely collapses a short manifold triangle edge by welding `v1` into `v0` at their midpoint,
 * checking the topological link condition so no non-manifold edges or folded slivers are introduced.
 */
function tryCollapseMeshEdge(mesh: EditableMesh, edgeId: string): boolean {
  const edge = mesh.getEdge(edgeId);
  if (!edge || edge.isSeam) return false;

  const v0 = mesh.getVertex(edge.v0);
  const v1 = mesh.getVertex(edge.v1);
  if (!v0 || !v1) return false;

  const adjFaces = mesh.getFacesForEdge(edgeId);
  if (adjFaces.length === 0 || adjFaces.length > 2) return false;

  // Preserve mesh boundary vertices unless both belong to same boundary edge cleanly
  const neighbors0 = new Set(mesh.getConnectedVertices(v0.id));
  const neighbors1 = new Set(mesh.getConnectedVertices(v1.id));
  let commonNeighbors = 0;
  for (const n of neighbors0) {
    if (n !== v1.id && neighbors1.has(n)) commonNeighbors++;
  }
  // Link condition: interior edge between 2 triangles has exactly 2 common neighbors; boundary edge has 1
  if (adjFaces.length === 2 && commonNeighbors !== 2) return false;
  if (adjFaces.length === 1 && commonNeighbors !== 1) return false;

  // Ensure all affected faces remain triangles (no high-valence n-gon corruption)
  const v0Faces = mesh.getFacesForVertex(v0.id);
  const v1Faces = mesh.getFacesForVertex(v1.id);
  if (v0Faces.length + v1Faces.length < 3) return false;

  const adjFaceSet = new Set(adjFaces);
  for (const fid of v1Faces) {
    if (adjFaceSet.has(fid)) continue;
    const face = mesh.getFace(fid);
    if (!face || face.vertexIds.length !== 3) return false;
    // Reject if collapsing would duplicate v0 in the face
    if (face.vertexIds.includes(v0.id)) return false;
  }

  // Move v0 to midpoint and weld v1 -> v0
  v0.position[0] = (v0.position[0] + v1.position[0]) * 0.5;
  v0.position[1] = (v0.position[1] + v1.position[1]) * 0.5;
  v0.position[2] = (v0.position[2] + v1.position[2]) * 0.5;
  if (v0.uv && v1.uv) {
    v0.uv = [(v0.uv[0] + v1.uv[0]) * 0.5, (v0.uv[1] + v1.uv[1]) * 0.5];
  }

  const nextFaces: MeshFace[] = [];
  for (const face of mesh.faces) {
    if (adjFaceSet.has(face.id)) continue;
    if (!face.vertexIds.includes(v1.id)) {
      nextFaces.push(face);
      continue;
    }
    const mappedVids = face.vertexIds.map((vid) => (vid === v1.id ? v0.id : vid));
    const unique = new Set(mappedVids);
    if (unique.size >= 3) {
      face.vertexIds = mappedVids;
      nextFaces.push(face);
    }
  }

  mesh.faces = nextFaces;
  mesh.vertices = mesh.vertices.filter((v) => v.id !== v1.id);
  mesh.edges = mesh.edges.filter((e) => e.v0 !== v1.id && e.v1 !== v1.id);
  mesh.rebuildIndices();

  // Ensure edges exist for any modified faces
  for (const fid of v1Faces) {
    const f = mesh.getFace(fid);
    if (!f) continue;
    for (let i = 0; i < f.vertexIds.length; i++) {
      mesh.addEdge(f.vertexIds[i], f.vertexIds[(i + 1) % f.vertexIds.length]);
    }
  }
  mesh.rebuildIndices();
  return true;
}

/**
 * Performs local Dynamic Topology (Dyntopo) subdivision & optional collapse around a sculpt brush hit.
 */
export function applyDyntopoAroundWorldPoint(params: {
  mesh: EditableMesh;
  matrixWorld: THREE.Matrix4;
  matrixWorldInv: THREE.Matrix4;
  worldHit: THREE.Vector3;
  brushRadius: number;
  symmetry: SculptSymmetryAxes;
  dyntopo: SculptDyntopoSettings;
  maxFaces: number;
}): DyntopoStepResult {
  const { mesh, matrixWorld, matrixWorldInv, worldHit, brushRadius, symmetry, dyntopo, maxFaces } =
    params;
  if (!dyntopo.enabled) {
    return { modified: false, splitCount: 0, collapseCount: 0, hitBudgetLimit: false };
  }

  const detailSize = Math.max(0.015, Math.min(2.0, dyntopo.detailSize));
  const splitThreshold = detailSize * 1.35;
  const collapseThreshold = detailSize * 0.42;
  const effectRadius = Math.max(detailSize * 1.5, brushRadius * 1.08);

  const localHit = worldHit.clone().applyMatrix4(matrixWorldInv);
  const mirrorCenters = getMirrorAxes(symmetry).map(([sx, sy, sz]) =>
    new THREE.Vector3(localHit.x * sx, localHit.y * sy, localHit.z * sz).applyMatrix4(
      matrixWorld,
    ),
  );

  const p0World = new THREE.Vector3();
  const p1World = new THREE.Vector3();
  const midWorld = new THREE.Vector3();

  // 1. Ensure faces inside brush influence are triangulated first
  const localFaceIds = new Set<string>();
  for (const v of mesh.vertices) {
    p0World.set(v.position[0], v.position[1], v.position[2]).applyMatrix4(matrixWorld);
    for (const center of mirrorCenters) {
      if (p0World.distanceTo(center) <= effectRadius) {
        for (const fid of mesh.getFacesForVertex(v.id)) {
          localFaceIds.add(fid);
        }
        break;
      }
    }
  }

  let modified = ensureLocalFacesTriangulated(mesh, localFaceIds);
  let splitCount = 0;
  let collapseCount = 0;
  let hitBudgetLimit = mesh.faces.length >= maxFaces;

  // 2. Local adaptive subdivision along longest edges within brush radius
  if (dyntopo.subdivide && !hitBudgetLimit) {
    const maxSplitsPerStep = 28;
    for (let iter = 0; iter < maxSplitsPerStep; iter++) {
      if (mesh.faces.length + 2 > maxFaces) {
        hitBudgetLimit = true;
        break;
      }
      let bestEdgeId: string | null = null;
      let bestLen = splitThreshold;

      for (const edge of mesh.edges) {
        const va = mesh.getVertex(edge.v0);
        const vb = mesh.getVertex(edge.v1);
        if (!va || !vb) continue;
        p0World.set(va.position[0], va.position[1], va.position[2]).applyMatrix4(matrixWorld);
        p1World.set(vb.position[0], vb.position[1], vb.position[2]).applyMatrix4(matrixWorld);
        const len = p0World.distanceTo(p1World);
        if (len <= bestLen) continue;

        midWorld.addVectors(p0World, p1World).multiplyScalar(0.5);
        let inBrush = false;
        for (const center of mirrorCenters) {
          if (
            midWorld.distanceTo(center) <= effectRadius ||
            p0World.distanceTo(center) <= effectRadius ||
            p1World.distanceTo(center) <= effectRadius
          ) {
            inBrush = true;
            break;
          }
        }
        if (inBrush) {
          bestLen = len;
          bestEdgeId = edge.id;
        }
      }

      if (!bestEdgeId) break;
      if (splitMeshEdge(mesh, bestEdgeId)) {
        splitCount++;
        modified = true;
      } else {
        break;
      }
    }
  }

  // 3. Optional local edge collapse for over-dense slivers
  if (dyntopo.collapse && collapseThreshold > 1e-4) {
    const maxCollapsesPerStep = 14;
    for (let iter = 0; iter < maxCollapsesPerStep; iter++) {
      let shortestEdgeId: string | null = null;
      let shortestLen = collapseThreshold;

      for (const edge of mesh.edges) {
        if (edge.isSeam) continue;
        const va = mesh.getVertex(edge.v0);
        const vb = mesh.getVertex(edge.v1);
        if (!va || !vb) continue;
        p0World.set(va.position[0], va.position[1], va.position[2]).applyMatrix4(matrixWorld);
        p1World.set(vb.position[0], vb.position[1], vb.position[2]).applyMatrix4(matrixWorld);
        const len = p0World.distanceTo(p1World);
        if (len >= shortestLen) continue;

        midWorld.addVectors(p0World, p1World).multiplyScalar(0.5);
        let inBrush = false;
        for (const center of mirrorCenters) {
          if (midWorld.distanceTo(center) <= effectRadius) {
            inBrush = true;
            break;
          }
        }
        if (inBrush) {
          shortestLen = len;
          shortestEdgeId = edge.id;
        }
      }

      if (!shortestEdgeId) break;
      if (tryCollapseMeshEdge(mesh, shortestEdgeId)) {
        collapseCount++;
        modified = true;
      } else {
        break;
      }
    }
  }

  if (modified) {
    mesh.clearCustomNormals();
  }
  return { modified, splitCount, collapseCount, hitBudgetLimit };
}
