/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { clearModifierEvaluationCache } from '../modifiers/evaluateModifiers';
import { GeometryResourceLimits, SceneObjectData } from '../project/types';

export interface RuntimeDeviceCapabilities {
  deviceMemoryGB: number;
  hardwareConcurrency: number;
  maxTextureSize: number;
  maxRenderbufferSize: number;
  supportsUint32Indices: boolean;
  isMobileOrTabletHeuristic: boolean;
}

export type ResourceRiskLevel = 'safe' | 'elevated' | 'critical' | 'blocked';

export type GeometryOperationKind =
  | 'multires_subdivide'
  | 'multires_switch'
  | 'dyntopo_refine'
  | 'voxel_remesh'
  | 'subdivide';

export interface GeometryOperationResourceEstimate {
  operation: GeometryOperationKind;
  estimatedVertices: number;
  estimatedFaces: number;
  estimatedMemoryMB: number;
  sceneCurrentFaces: number;
  sceneTotalFacesAfter: number;
  deviceBudgetMB: number;
  recommendedMaxFaces: number;
  hardMaxFaces: number;
  utilizationRatio: number;
  riskLevel: ResourceRiskLevel;
  canProceed: boolean;
  requiresConfirmation: boolean;
  message: string;
}

export const DEFAULT_GEOMETRY_RESOURCE_LIMITS: GeometryResourceLimits = {
  maxMemoryBudgetMB: 'auto',
  maxFacesPerObject: 'auto',
  autoViewportLod: true,
  warnThresholdRatio: 0.72,
};

let cachedCapabilities: RuntimeDeviceCapabilities | null = null;

export function normalizeGeometryResourceLimits(
  raw?: Partial<GeometryResourceLimits> | null,
): GeometryResourceLimits {
  const def = DEFAULT_GEOMETRY_RESOURCE_LIMITS;
  if (!raw || typeof raw !== 'object') return { ...def };
  const maxMemoryBudgetMB =
    raw.maxMemoryBudgetMB === 'auto'
      ? 'auto'
      : typeof raw.maxMemoryBudgetMB === 'number' && Number.isFinite(raw.maxMemoryBudgetMB)
        ? Math.max(64, Math.min(4096, Math.round(raw.maxMemoryBudgetMB)))
        : def.maxMemoryBudgetMB;
  const maxFacesPerObject =
    raw.maxFacesPerObject === 'auto'
      ? 'auto'
      : typeof raw.maxFacesPerObject === 'number' && Number.isFinite(raw.maxFacesPerObject)
        ? Math.max(2000, Math.min(2_000_000, Math.round(raw.maxFacesPerObject)))
        : def.maxFacesPerObject;
  const autoViewportLod =
    typeof raw.autoViewportLod === 'boolean' ? raw.autoViewportLod : def.autoViewportLod;
  const warnThresholdRatio =
    typeof raw.warnThresholdRatio === 'number' && Number.isFinite(raw.warnThresholdRatio)
      ? Math.max(0.4, Math.min(0.95, raw.warnThresholdRatio))
      : def.warnThresholdRatio;
  return {
    maxMemoryBudgetMB,
    maxFacesPerObject,
    autoViewportLod,
    warnThresholdRatio,
  };
}

export function probeRuntimeDeviceCapabilities(forceRefresh = false): RuntimeDeviceCapabilities {
  if (cachedCapabilities && !forceRefresh) return cachedCapabilities;

  const nav = typeof navigator !== 'undefined'
    ? (navigator as Navigator & { deviceMemory?: number })
    : undefined;
  const rawDeviceMemory =
    typeof nav?.deviceMemory === 'number' && Number.isFinite(nav.deviceMemory)
      ? nav.deviceMemory
      : 4;
  const hardwareConcurrency =
    typeof nav?.hardwareConcurrency === 'number' && Number.isFinite(nav.hardwareConcurrency)
      ? Math.max(1, nav.hardwareConcurrency)
      : 4;

  let maxTextureSize = 4096;
  let maxRenderbufferSize = 4096;
  let supportsUint32Indices = true;

  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      const gl2 = canvas.getContext('webgl2');
      const gl = gl2 || canvas.getContext('webgl');
      if (gl) {
        const texParam = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        const rbParam = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
        if (typeof texParam === 'number' && texParam > 0) maxTextureSize = texParam;
        if (typeof rbParam === 'number' && rbParam > 0) maxRenderbufferSize = rbParam;
        supportsUint32Indices = Boolean(gl2 || gl.getExtension('OES_element_index_uint'));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    } catch {
      // Headless / test environment without WebGL context
    }
  }

  const ua = typeof nav?.userAgent === 'string' ? nav.userAgent : '';
  const isMobileOrTabletHeuristic =
    /Android|iPad|iPhone|iPod|Mobile|Tablet/i.test(ua) || rawDeviceMemory <= 4;

  cachedCapabilities = {
    deviceMemoryGB: Math.max(1, rawDeviceMemory),
    hardwareConcurrency,
    maxTextureSize,
    maxRenderbufferSize,
    supportsUint32Indices,
    isMobileOrTabletHeuristic,
  };
  return cachedCapabilities;
}

export function computeScenePolygonLoad(objects: SceneObjectData[]): {
  totalVertices: number;
  totalFaces: number;
  meshObjects: number;
} {
  let totalVertices = 0;
  let totalFaces = 0;
  let meshObjects = 0;
  for (const obj of objects) {
    if (obj.objectType !== 'mesh') continue;
    meshObjects++;
    totalVertices += obj.mesh?.vertices?.length ?? 0;
    totalFaces += obj.mesh?.faces?.length ?? 0;
  }
  return { totalVertices, totalFaces, meshObjects };
}

export interface AdaptiveResourceBudgets {
  deviceBudgetMB: number;
  recommendedMaxFaces: number;
  hardMaxFaces: number;
}

export function computeAdaptiveBudgets(
  capabilities: RuntimeDeviceCapabilities,
  limits: GeometryResourceLimits,
): AdaptiveResourceBudgets {
  // Base memory budget tailored dynamically to runtime hardware (bounded so tabs remain stable)
  const autoBudgetMB = Math.round(
    Math.max(
      160,
      Math.min(
        1400,
        capabilities.deviceMemoryGB * 110 + capabilities.hardwareConcurrency * 16,
      ),
    ),
  );
  const deviceBudgetMB =
    limits.maxMemoryBudgetMB === 'auto' ? autoBudgetMB : limits.maxMemoryBudgetMB;

  // Rough JS + GPU allocation footprint per sculpted mesh quad/tri (~0.85 KB total with adjacency/GPU buffers)
  const memoryDerivedHardFaces = Math.round((deviceBudgetMB * 1024) / 1.1);
  const glIndexCap = capabilities.supportsUint32Indices ? 900_000 : 60_000;
  const autoHardMaxFaces = Math.max(
    18_000,
    Math.min(
      glIndexCap,
      capabilities.isMobileOrTabletHeuristic ? 260_000 : 650_000,
      memoryDerivedHardFaces,
    ),
  );

  const hardMaxFaces =
    limits.maxFacesPerObject === 'auto' ? autoHardMaxFaces : limits.maxFacesPerObject;
  const recommendedMaxFaces = Math.max(8_000, Math.round(hardMaxFaces * limits.warnThresholdRatio));

  return {
    deviceBudgetMB,
    recommendedMaxFaces,
    hardMaxFaces,
  };
}

/**
 * Estimates memory & polygon impact BEFORE running a heavy geometry operation.
 */
export function estimateGeometryOperationResources(params: {
  operation: GeometryOperationKind;
  currentVertices: number;
  currentFaces: number;
  levelDelta?: number;
  estimatedTargetFaces?: number;
  estimatedTargetVertices?: number;
  sceneObjects?: SceneObjectData[];
  limits?: Partial<GeometryResourceLimits> | null;
  capabilities?: RuntimeDeviceCapabilities;
}): GeometryOperationResourceEstimate {
  const capabilities = params.capabilities ?? probeRuntimeDeviceCapabilities();
  const limits = normalizeGeometryResourceLimits(params.limits);
  const budgets = computeAdaptiveBudgets(capabilities, limits);
  const sceneLoad = computeScenePolygonLoad(params.sceneObjects ?? []);

  let estimatedFaces = params.estimatedTargetFaces ?? params.currentFaces;
  let estimatedVertices = params.estimatedTargetVertices ?? params.currentVertices;

  if (params.estimatedTargetFaces === undefined) {
    if (params.operation === 'multires_subdivide' || params.operation === 'subdivide') {
      const steps = Math.max(0, params.levelDelta ?? 1);
      const factor = Math.pow(4, steps);
      estimatedFaces = Math.max(1, Math.round(params.currentFaces * factor));
      estimatedVertices = Math.max(
        3,
        Math.round(params.currentVertices * factor),
      );
    } else if (params.operation === 'dyntopo_refine') {
      estimatedFaces = Math.round(params.currentFaces * 1.15 + 64);
      estimatedVertices = Math.round(params.currentVertices * 1.15 + 34);
    }
  }

  // Approximate memory footprint in MB: JS EditableMesh objects + TypedArrays + WebGL vertex/normal/uv buffers
  const estimatedBytes =
    estimatedVertices * 420 +
    estimatedFaces * 540 +
    (sceneLoad.totalFaces * 420);
  const estimatedMemoryMB = Number((estimatedBytes / (1024 * 1024)).toFixed(2));
  const sceneTotalFacesAfter = Math.max(
    estimatedFaces,
    sceneLoad.totalFaces - params.currentFaces + estimatedFaces,
  );

  const faceRatio = estimatedFaces / Math.max(1, budgets.hardMaxFaces);
  const memRatio = estimatedMemoryMB / Math.max(1, budgets.deviceBudgetMB);
  const utilizationRatio = Math.max(faceRatio, memRatio);

  let riskLevel: ResourceRiskLevel = 'safe';
  let canProceed = true;
  let requiresConfirmation = false;
  let message = `Consumo estimado: ${estimatedFaces.toLocaleString()} caras (~${estimatedMemoryMB.toFixed(1)} MB / ${budgets.deviceBudgetMB} MB).`;

  if (estimatedFaces > budgets.hardMaxFaces || memRatio > 1.05) {
    riskLevel = 'blocked';
    canProceed = false;
    requiresConfirmation = false;
    message = `Límite de seguridad superado: ${estimatedFaces.toLocaleString()} caras (~${estimatedMemoryMB.toFixed(1)} MB) excede el límite configurado (${budgets.hardMaxFaces.toLocaleString()} caras / ${budgets.deviceBudgetMB} MB). Reduce la densidad o ajusta el límite en Ajustes.`;
  } else if (utilizationRatio >= 0.88) {
    riskLevel = 'critical';
    canProceed = true;
    requiresConfirmation = true;
    message = `Densidad muy alta (${estimatedFaces.toLocaleString()} caras, ~${estimatedMemoryMB.toFixed(1)} MB). Puede afectar la fluidez en este dispositivo; se recomienda activar LOD de visor.`;
  } else if (utilizationRatio >= limits.warnThresholdRatio) {
    riskLevel = 'elevated';
    canProceed = true;
    requiresConfirmation = false;
    message = `Densidad elevada (${estimatedFaces.toLocaleString()} caras, ~${estimatedMemoryMB.toFixed(1)} MB).`;
  }

  return {
    operation: params.operation,
    estimatedVertices,
    estimatedFaces,
    estimatedMemoryMB,
    sceneCurrentFaces: sceneLoad.totalFaces,
    sceneTotalFacesAfter,
    deviceBudgetMB: budgets.deviceBudgetMB,
    recommendedMaxFaces: budgets.recommendedMaxFaces,
    hardMaxFaces: budgets.hardMaxFaces,
    utilizationRatio,
    riskLevel,
    canProceed,
    requiresConfirmation,
    message,
  };
}

const extraCachePurgeHooks = new Set<() => void>();

export function registerGeometryCachePurgeHook(hook: () => void): () => void {
  extraCachePurgeHooks.add(hook);
  return () => {
    extraCachePurgeHooks.delete(hook);
  };
}

/**
 * Safely purges temporary caches (evaluated modifier cache, procedural textures, LOD proxies)
 * without ever deleting base cages, active scene meshes, or project history.
 */
export function purgeGeometryCaches(): { clearedHooks: number } {
  clearModifierEvaluationCache();
  let clearedHooks = 0;
  for (const hook of extraCachePurgeHooks) {
    try {
      hook();
      clearedHooks++;
    } catch {
      // Ignore individual cache cleanup failure
    }
  }
  return { clearedHooks };
}
