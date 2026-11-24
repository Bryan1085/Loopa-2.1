import type {
  MaterialAsset,
  MaterialNode,
  MaterialNodeGraph,
  MaterialNodeType,
  MaterialNodeValue,
} from "../project/types";
import {
  evaluateNoiseSample,
  evaluateVoronoiSample,
  NoiseTextureParams,
  ProceduralDimensions,
  rgbaToPngDataUrl,
  VoronoiDistanceMetric,
  VoronoiFeature,
  VoronoiTextureParams,
} from "./proceduralTextures";

export type MaterialSocketType =
  "float" | "integer" | "boolean" | "color" | "vector" | "geometry" | "shader" | "material";

export type MaterialNodeCategory = "input" | "shader" | "texture" | "color" | "vector" | "output";

export interface MaterialNodeSocketDefinition {
  id: string;
  label: string;
  type: MaterialSocketType;
}

export interface MaterialNodeDefinition {
  id: MaterialNodeType;
  label: string;
  category: MaterialNodeCategory;
  inputs: MaterialNodeSocketDefinition[];
  outputs: MaterialNodeSocketDefinition[];
}

const socket = (
  id: string,
  label: string,
  type: MaterialSocketType,
): MaterialNodeSocketDefinition => ({ id, label, type });

export const MATERIAL_NODE_DEFINITIONS: MaterialNodeDefinition[] = [
  {
    id: "material_output",
    label: "Material Output",
    category: "output",
    inputs: [socket("surface", "Surface", "shader")],
    outputs: [],
  },
  {
    id: "principled_bsdf",
    label: "Principled BSDF",
    category: "shader",
    inputs: [
      socket("baseColor", "Base Color", "color"),
      socket("metallic", "Metallic", "float"),
      socket("roughness", "Roughness", "float"),
      socket("ior", "IOR", "float"),
      socket("specular", "Specular", "float"),
      socket("alpha", "Alpha", "float"),
      socket("emission", "Emission", "color"),
      socket("emissionStrength", "Emission Strength", "float"),
      socket("normal", "Normal", "vector"),
      socket("ao", "Ambient Occlusion", "float"),
      socket("displacement", "Height / Displacement", "float"),
    ],
    outputs: [socket("bsdf", "BSDF", "shader")],
  },
  {
    id: "emission",
    label: "Emission",
    category: "shader",
    inputs: [
      socket("color", "Color", "color"),
      socket("strength", "Strength", "float"),
    ],
    outputs: [socket("emission", "Emission", "shader")],
  },
  {
    id: "image_texture",
    label: "Image Texture",
    category: "texture",
    inputs: [socket("vector", "Vector", "vector")],
    outputs: [socket("color", "Color", "color"), socket("alpha", "Alpha", "float")],
  },
  {
    id: "noise_texture",
    label: "Noise Texture",
    category: "texture",
    inputs: [
      socket("vector", "Vector", "vector"),
      socket("w", "W", "float"),
      socket("scale", "Scale", "float"),
      socket("detail", "Detail", "float"),
      socket("roughness", "Roughness", "float"),
      socket("lacunarity", "Lacunarity", "float"),
      socket("offset", "Offset", "float"),
      socket("distortion", "Distortion", "float"),
    ],
    outputs: [socket("factor", "Fac", "float"), socket("color", "Color", "color")],
  },
  {
    id: "voronoi_texture",
    label: "Voronoi Texture",
    category: "texture",
    inputs: [
      socket("vector", "Vector", "vector"),
      socket("w", "W", "float"),
      socket("scale", "Scale", "float"),
      socket("detail", "Detail", "float"),
      socket("roughness", "Roughness", "float"),
      socket("lacunarity", "Lacunarity", "float"),
      socket("smoothness", "Smoothness", "float"),
      socket("exponent", "Exponent", "float"),
      socket("randomness", "Randomness", "float"),
    ],
    outputs: [
      socket("distance", "Distance", "float"),
      socket("color", "Color", "color"),
      socket("position", "Position", "vector"),
      socket("w", "W", "float"),
      socket("radius", "Radius", "float"),
    ],
  },
  {
    id: "texture_coordinate",
    label: "Texture Coordinate",
    category: "input",
    inputs: [],
    outputs: [socket("uv", "UV", "vector"), socket("generated", "Generated", "vector")],
  },
  {
    id: "mapping",
    label: "Mapping",
    category: "vector",
    inputs: [socket("vector", "Vector", "vector")],
    outputs: [socket("vector", "Vector", "vector")],
  },
  {
    id: "normal_map",
    label: "Normal Map",
    category: "vector",
    inputs: [socket("color", "Color", "color"), socket("strength", "Strength", "float")],
    outputs: [socket("normal", "Normal", "vector")],
  },
  {
    id: "bump",
    label: "Bump",
    category: "vector",
    inputs: [
      socket("height", "Height", "float"),
      socket("normal", "Normal", "vector"),
      socket("strength", "Strength", "float"),
      socket("distance", "Distance", "float"),
    ],
    outputs: [socket("normal", "Normal", "vector")],
  },
  {
    id: "color_ramp",
    label: "Color Ramp",
    category: "color",
    inputs: [socket("factor", "Factor", "float")],
    outputs: [socket("color", "Color", "color"), socket("alpha", "Alpha", "float")],
  },
  {
    id: "math",
    label: "Math",
    category: "input",
    inputs: [socket("a", "A", "float"), socket("b", "B", "float")],
    outputs: [socket("value", "Value", "float")],
  },
  {
    id: "mix_color",
    label: "Mix Color",
    category: "color",
    inputs: [
      socket("factor", "Factor", "float"),
      socket("colorA", "A", "color"),
      socket("colorB", "B", "color"),
    ],
    outputs: [socket("color", "Color", "color")],
  },
  {
    id: "mix_float",
    label: "Mix Float",
    category: "input",
    inputs: [
      socket("factor", "Factor", "float"),
      socket("a", "A", "float"),
      socket("b", "B", "float"),
    ],
    outputs: [socket("value", "Value", "float")],
  },
  {
    id: "mix_vector",
    label: "Mix Vector",
    category: "vector",
    inputs: [
      socket("factor", "Factor", "float"),
      socket("a", "A", "vector"),
      socket("b", "B", "vector"),
    ],
    outputs: [socket("vector", "Vector", "vector")],
  },
  {
    id: "transform",
    label: "Transform",
    category: "vector",
    inputs: [socket("vector", "Vector", "vector")],
    outputs: [socket("vector", "Vector", "vector")],
  },
  {
    id: "value_float",
    label: "Float",
    category: "input",
    inputs: [],
    outputs: [socket("value", "Value", "float")],
  },
  {
    id: "value_integer",
    label: "Integer",
    category: "input",
    inputs: [],
    outputs: [socket("value", "Value", "integer")],
  },
  {
    id: "value_boolean",
    label: "Boolean",
    category: "input",
    inputs: [],
    outputs: [socket("value", "Value", "boolean")],
  },
  {
    id: "value_color",
    label: "Color",
    category: "input",
    inputs: [],
    outputs: [socket("color", "Color", "color")],
  },
  {
    id: "value_vector",
    label: "Vector",
    category: "input",
    inputs: [],
    outputs: [socket("vector", "Vector", "vector")],
  },
];

export function getMaterialNodeDefinition(type: MaterialNodeType): MaterialNodeDefinition {
  return MATERIAL_NODE_DEFINITIONS.find((definition) => definition.id === type)!;
}

export function areMaterialSocketTypesCompatible(
  source: MaterialSocketType,
  target: MaterialSocketType,
): boolean {
  return (
    source === target ||
    (source === "integer" && target === "float") ||
    (source === "boolean" && target === "float")
  );
}

export function connectMaterialNodeSockets(
  graph: MaterialNodeGraph,
  fromNodeId: string,
  fromSocketId: string,
  toNodeId: string,
  toSocketId: string,
): MaterialNodeGraph | null {
  if (fromNodeId === toNodeId) return null;
  const sourceNode = graph.nodes.find((node) => node.id === fromNodeId);
  const targetNode = graph.nodes.find((node) => node.id === toNodeId);
  if (!sourceNode || !targetNode) return null;

  const sourceSocket = getMaterialNodeDefinition(sourceNode.type).outputs.find(
    (item) => item.id === fromSocketId,
  );
  const targetSocket = getMaterialNodeDefinition(targetNode.type).inputs.find(
    (item) => item.id === toSocketId,
  );
  if (
    !sourceSocket ||
    !targetSocket ||
    !areMaterialSocketTypesCompatible(sourceSocket.type, targetSocket.type)
  ) {
    return null;
  }

  const links = graph.links.filter(
    (link) => link.toNodeId !== toNodeId || link.toSocket !== toSocketId,
  );
  const newLink = {
    id: `${fromNodeId}:${fromSocketId}->${toNodeId}:${toSocketId}`,
    fromNodeId,
    fromSocket: fromSocketId,
    toNodeId,
    toSocket: toSocketId,
  };
  const pending = [toNodeId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (nodeId === fromNodeId) return null;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    for (const link of links) {
      if (link.fromNodeId === nodeId) pending.push(link.toNodeId);
    }
  }

  return { ...graph, links: [...links, newLink] };
}

export interface EvaluatedMaterialSurface {
  baseColor: string;
  baseColorTextureUrl?: string;
  textureName?: string;
  textureTransform?: {
    location: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  normalTextureUrl?: string;
  normalTextureTransform?: EvaluatedMaterialSurface["textureTransform"];
  normalMapStrength?: number;
  bumpTextureUrl?: string;
  bumpTextureTransform?: EvaluatedMaterialSurface["textureTransform"];
  bumpScale?: number;
  roughnessTextureUrl?: string;
  metallicTextureUrl?: string;
  aoTextureUrl?: string;
  aoStrength?: number;
  displacementTextureUrl?: string;
  displacementScale?: number;
  metallic: number;
  roughness: number;
  opacity: number;
  ior: number;
  specular: number;
  emissionColor: string;
  emissionTextureUrl?: string;
  emissionIntensity: number;
}

export type MaterialOutputStatus = "connected" | "disconnected" | "missing_output" | "invalid";

export interface MaterialGraphEvaluation {
  ok: boolean;
  hasConnectedOutput: boolean;
  outputStatus: MaterialOutputStatus;
  surface: EvaluatedMaterialSurface;
  errors: string[];
}

export interface NodeNumericParamSpec {
  min: number;
  max: number;
  step: number;
  decimals?: number;
  clampMin?: number;
  clampMax?: number;
}

export const NODE_NUMERIC_PARAM_SPECS: Record<string, NodeNumericParamSpec> = {
  "principled_bsdf.metallic": { min: 0, max: 1, step: 0.01, decimals: 2, clampMin: 0, clampMax: 1 },
  "principled_bsdf.roughness": { min: 0, max: 1, step: 0.01, decimals: 2, clampMin: 0, clampMax: 1 },
  "principled_bsdf.alpha": { min: 0, max: 1, step: 0.01, decimals: 2, clampMin: 0, clampMax: 1 },
  "principled_bsdf.ior": { min: 1, max: 2.5, step: 0.01, decimals: 2, clampMin: 1, clampMax: 2.5 },
  "principled_bsdf.specular": { min: 0, max: 1, step: 0.01, decimals: 2, clampMin: 0, clampMax: 1 },
  "principled_bsdf.emissionStrength": { min: 0, max: 20, step: 0.1, decimals: 2, clampMin: 0 },
  "principled_bsdf.ao": { min: 0, max: 2, step: 0.05, decimals: 2, clampMin: 0, clampMax: 2 },
  "principled_bsdf.displacement": { min: 0, max: 0.5, step: 0.01, decimals: 2, clampMin: 0, clampMax: 1 },
  "emission.strength": { min: 0, max: 25, step: 0.1, decimals: 2, clampMin: 0 },
  "math.a": { min: -10, max: 10, step: 0.05, decimals: 2 },
  "math.b": { min: -10, max: 10, step: 0.05, decimals: 2 },
  "normal_map.strength": { min: 0, max: 2, step: 0.01, decimals: 2, clampMin: 0 },
  "bump.strength": { min: 0, max: 2, step: 0.01, decimals: 2, clampMin: 0 },
  "bump.distance": { min: 0, max: 5, step: 0.05, decimals: 2, clampMin: 0 },
  "mix_color.factor": { min: 0, max: 1, step: 0.01, decimals: 2, clampMin: 0, clampMax: 1 },
  "mix_float.factor": { min: 0, max: 1, step: 0.01, decimals: 2, clampMin: 0, clampMax: 1 },
  "mix_float.a": { min: -10, max: 10, step: 0.05, decimals: 2 },
  "mix_float.b": { min: -10, max: 10, step: 0.05, decimals: 2 },
  "mix_vector.factor": { min: 0, max: 1, step: 0.01, decimals: 2, clampMin: 0, clampMax: 1 },
  "mix_vector.a": { min: -10, max: 10, step: 0.05, decimals: 2 },
  "mix_vector.b": { min: -10, max: 10, step: 0.05, decimals: 2 },
  "color_ramp.factor": { min: 0, max: 1, step: 0.01, decimals: 2, clampMin: 0, clampMax: 1 },
  "color_ramp.position": { min: 0, max: 1, step: 0.01, decimals: 2, clampMin: 0, clampMax: 1 },
  "color_ramp.alpha": { min: 0, max: 1, step: 0.01, decimals: 2, clampMin: 0, clampMax: 1 },
  "mapping.location": { min: -10, max: 10, step: 0.05, decimals: 2 },
  "mapping.rotation": { min: -6.28, max: 6.28, step: 0.05, decimals: 2 },
  "mapping.scale": { min: 0.01, max: 20, step: 0.05, decimals: 2 },
  "transform.location": { min: -10, max: 10, step: 0.05, decimals: 2 },
  "transform.rotation": { min: -360, max: 360, step: 1, decimals: 1 },
  "transform.scale": { min: 0.01, max: 20, step: 0.05, decimals: 2 },
  "value_float.value": { min: -10, max: 10, step: 0.01, decimals: 2 },
  "value_integer.value": { min: -50, max: 50, step: 1, decimals: 0 },
  "value_vector.value": { min: -10, max: 10, step: 0.05, decimals: 2 },
};

export function getNodeNumericParamSpec(
  nodeType: MaterialNodeType,
  paramKey: string,
  fallback: NodeNumericParamSpec = { min: -10, max: 10, step: 0.05, decimals: 2 },
): NodeNumericParamSpec {
  return NODE_NUMERIC_PARAM_SPECS[`${nodeType}.${paramKey}`] ?? fallback;
}

const MATERIAL_NODE_TYPE_SET = new Set<MaterialNodeType>(
  MATERIAL_NODE_DEFINITIONS.map((definition) => definition.id),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function copyNodeValue(value: unknown): MaterialNodeValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const items = value.map(copyNodeValue);
    if (items.some((item) => item === undefined)) return undefined;
    return items as MaterialNodeValue[];
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).map(([key, item]) => [key, copyNodeValue(item)]);
    if (entries.some(([, item]) => item === undefined)) return undefined;
    return Object.fromEntries(entries) as { [key: string]: MaterialNodeValue };
  }
  return undefined;
}

export function createDefaultMaterialNodeGraph(
  material: Pick<
    MaterialAsset,
    | "id"
    | "baseColor"
    | "metallic"
    | "roughness"
    | "opacity"
    | "emissiveColor"
    | "emissiveIntensity"
    | "textureName"
    | "textureDataUrl"
  >,
): MaterialNodeGraph {
  const principledId = `${material.id}:principled`;
  const outputId = `${material.id}:output`;
  const nodes: MaterialNode[] = [
    {
      id: principledId,
      type: "principled_bsdf",
      position: { x: 120, y: 120 },
      values: {
        baseColor: material.baseColor,
        metallic: material.metallic,
        roughness: material.roughness,
        ior: 1.45,
        specular: 0.5,
        alpha: material.opacity ?? 1,
        emission: material.emissiveColor ?? "#000000",
        emissionStrength: material.emissiveIntensity ?? 0,
      },
    },
    {
      id: outputId,
      type: "material_output",
      position: { x: 520, y: 120 },
      values: {},
    },
  ];
  const links = [
    {
      id: `${material.id}:surface`,
      fromNodeId: principledId,
      fromSocket: "bsdf",
      toNodeId: outputId,
      toSocket: "surface",
    },
  ];
  if (material.textureDataUrl) {
    const imageNodeId = `${material.id}:base-color-image`;
    nodes.push({
      id: imageNodeId,
      type: "image_texture",
      position: { x: 120, y: 360 },
      values: {
        textureSlot: "baseColor",
      },
    });
    links.push({
      id: `${material.id}:base-color`,
      fromNodeId: imageNodeId,
      fromSocket: "color",
      toNodeId: principledId,
      toSocket: "baseColor",
    });
  }
  return {
    version: 1,
    nodes,
    links,
  };
}

export function normalizeMaterialNodeGraph(
  raw: unknown,
  material: Parameters<typeof createDefaultMaterialNodeGraph>[0],
): MaterialNodeGraph {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.nodes)) {
    return createDefaultMaterialNodeGraph(material);
  }

  const nodes: MaterialNode[] = [];
  const seenIds = new Set<string>();
  for (const candidate of raw.nodes) {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== "string" ||
      !candidate.id ||
      typeof candidate.type !== "string" ||
      !MATERIAL_NODE_TYPE_SET.has(candidate.type as MaterialNodeType) ||
      !isRecord(candidate.position) ||
      !isRecord(candidate.values) ||
      seenIds.has(candidate.id)
    ) {
      continue;
    }
    const x = Number(candidate.position.x);
    const y = Number(candidate.position.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const values: Record<string, MaterialNodeValue> = {};
    for (const [key, value] of Object.entries(candidate.values)) {
      const copied = copyNodeValue(value);
      if (copied !== undefined) values[key] = copied;
    }
    const customLabel =
      typeof candidate.label === "string" && candidate.label.trim()
        ? candidate.label.trim()
        : undefined;
    nodes.push({
      id: candidate.id,
      type: candidate.type as MaterialNodeType,
      ...(customLabel ? { label: customLabel } : {}),
      position: { x, y },
      ...(candidate.collapsed ? { collapsed: true } : {}),
      values,
    });
    seenIds.add(candidate.id);
  }
  if (nodes.length === 0) return createDefaultMaterialNodeGraph(material);

  const nodeIds = new Set(nodes.map((node) => node.id));
  const links = Array.isArray(raw.links)
    ? raw.links.flatMap((candidate) => {
        if (
          !isRecord(candidate) ||
          typeof candidate.id !== "string" ||
          typeof candidate.fromNodeId !== "string" ||
          typeof candidate.fromSocket !== "string" ||
          typeof candidate.toNodeId !== "string" ||
          typeof candidate.toSocket !== "string" ||
          !nodeIds.has(candidate.fromNodeId) ||
          !nodeIds.has(candidate.toNodeId)
        ) {
          return [];
        }
        return [
          {
            id: candidate.id,
            fromNodeId: candidate.fromNodeId,
            fromSocket: candidate.fromSocket,
            toNodeId: candidate.toNodeId,
            toSocket: candidate.toSocket,
          },
        ];
      })
    : [];
  if (material.textureDataUrl) {
    for (const node of nodes) {
      if (
        node.type === "image_texture" &&
        node.values.textureSlot === "baseColor" &&
        typeof node.values.dataUrl !== "string"
      ) {
        node.values = {
          ...node.values,
          dataUrl: material.textureDataUrl,
          textureName: material.textureName ?? "",
        };
      }
    }
  }
  return { version: 1, nodes, links };
}

export function syncMaterialFieldsToNodeGraph(
  graph: MaterialNodeGraph,
  material: Pick<
    MaterialAsset,
    | "baseColor"
    | "metallic"
    | "roughness"
    | "opacity"
    | "emissiveColor"
    | "emissiveIntensity"
    | "textureName"
    | "textureDataUrl"
  >,
  changedFields: string[],
): MaterialNodeGraph {
  const output = graph.nodes.find((node) => node.type === "material_output");
  const surfaceLink = graph.links.find(
    (link) => link.toNodeId === output?.id && link.toSocket === "surface",
  );
  const principledId =
    surfaceLink?.fromNodeId ?? graph.nodes.find((node) => node.type === "principled_bsdf")?.id;
  if (!principledId) return graph;

  const fieldToSocket: Record<string, string> = {
    baseColor: "baseColor",
    metallic: "metallic",
    roughness: "roughness",
    opacity: "alpha",
    emissiveColor: "emission",
    emissiveIntensity: "emissionStrength",
  };
  const updates: Record<string, MaterialNodeValue> = {};
  for (const field of changedFields) {
    const socketId = fieldToSocket[field];
    if (!socketId) continue;
    const value =
      field === "opacity"
        ? (material.opacity ?? 1)
        : field === "emissiveColor"
          ? (material.emissiveColor ?? "#000000")
          : field === "emissiveIntensity"
            ? (material.emissiveIntensity ?? 0)
            : material[field as keyof typeof material];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      updates[socketId] = value;
    }
  }
  let nextGraph: MaterialNodeGraph =
    Object.keys(updates).length === 0
      ? graph
      : {
          ...graph,
          nodes: graph.nodes.map((node) =>
            node.id === principledId ? { ...node, values: { ...node.values, ...updates } } : node,
          ),
        };

  if (changedFields.includes("textureDataUrl") || changedFields.includes("textureName")) {
    const dataUrl = material.textureDataUrl;
    const textureLink = nextGraph.links.find(
      (link) =>
        link.toNodeId === principledId &&
        link.toSocket === "baseColor" &&
        link.fromSocket === "color" &&
        nextGraph.nodes.some(
          (node) => node.id === link.fromNodeId && node.type === "image_texture",
        ),
    );
    const imageNodeId = textureLink?.fromNodeId ?? `${principledId}:image`;
    const hasTexture = typeof dataUrl === "string" && dataUrl.startsWith("data:image/");
    const hasOtherBaseColorLink = nextGraph.links.some(
      (link) => link.toNodeId === principledId && link.toSocket === "baseColor" && !textureLink,
    );
    if (hasTexture && !hasOtherBaseColorLink) {
      const imageNodeExists = nextGraph.nodes.some((node) => node.id === imageNodeId);
      nextGraph = {
        ...nextGraph,
        nodes: imageNodeExists
          ? nextGraph.nodes.map((node) =>
              node.id === imageNodeId
                ? {
                    ...node,
                    values: {
                      ...node.values,
                      dataUrl,
                      textureName: material.textureName ?? "",
                    },
                  }
                : node,
            )
          : [
              ...nextGraph.nodes,
              {
                id: imageNodeId,
                type: "image_texture",
                position: { x: 120, y: 360 },
                values: {
                  dataUrl,
                  textureName: material.textureName ?? "",
                },
              },
            ],
        links: textureLink
          ? nextGraph.links
          : [
              ...nextGraph.links,
              {
                id: `${imageNodeId}-${principledId}-baseColor`,
                fromNodeId: imageNodeId,
                fromSocket: "color",
                toNodeId: principledId,
                toSocket: "baseColor",
              },
            ],
      };
    } else if (textureLink) {
      nextGraph = {
        ...nextGraph,
        nodes: nextGraph.nodes.filter((node) => node.id !== imageNodeId),
        links: nextGraph.links.filter((link) => link.fromNodeId !== imageNodeId),
      };
    }
  }
  return nextGraph;
}

export function normalizeMaterialGraphBaseTextureReference(
  graph: MaterialNodeGraph,
  dataUrl: string | undefined,
): MaterialNodeGraph {
  if (!dataUrl) return graph;
  const principalIds = new Set(
    graph.nodes.filter((node) => node.type === "principled_bsdf").map((node) => node.id),
  );
  const connectedImageIds = new Set(
    graph.links
      .filter(
        (link) =>
          principalIds.has(link.toNodeId) &&
          link.toSocket === "baseColor" &&
          link.fromSocket === "color",
      )
      .map((link) => link.fromNodeId),
  );
  let changed = false;
  const nodes = graph.nodes.map((node) => {
    if (
      node.type !== "image_texture" ||
      !connectedImageIds.has(node.id) ||
      node.values.dataUrl !== dataUrl
    ) {
      return node;
    }
    const values = { ...node.values };
    delete values.dataUrl;
    delete values.textureName;
    values.textureSlot = "baseColor";
    changed = true;
    return { ...node, values };
  });
  return changed ? { ...graph, nodes } : graph;
}

export function validateMaterialNodeGraph(graph: MaterialNodeGraph): string[] {
  const errors: string[] = [];
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const inputLinks = new Set<string>();
  const adjacency = new Map<string, string[]>();

  for (const link of graph.links) {
    const from = nodes.get(link.fromNodeId);
    const to = nodes.get(link.toNodeId);
    if (!from || !to) {
      errors.push(`La conexión "${link.id}" referencia un nodo inexistente.`);
      continue;
    }
    const fromSocket = MATERIAL_NODE_DEFINITIONS.find(
      (definition) => definition.id === from.type,
    )?.outputs.find((item) => item.id === link.fromSocket);
    const toSocket = MATERIAL_NODE_DEFINITIONS.find(
      (definition) => definition.id === to.type,
    )?.inputs.find((item) => item.id === link.toSocket);
    if (
      !fromSocket ||
      !toSocket ||
      !areMaterialSocketTypesCompatible(fromSocket.type, toSocket.type)
    ) {
      errors.push(`La conexión "${link.id}" usa sockets incompatibles.`);
      continue;
    }
    const inputKey = `${to.id}:${link.toSocket}`;
    if (inputLinks.has(inputKey)) {
      errors.push(`La entrada "${link.toSocket}" tiene más de una conexión.`);
    }
    inputLinks.add(inputKey);
    const targets = adjacency.get(from.id) ?? [];
    targets.push(to.id);
    adjacency.set(from.id, targets);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) {
      errors.push("El grafo contiene un ciclo y no se puede evaluar.");
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) visit(next);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const node of graph.nodes) visit(node.id);
  if (!graph.nodes.some((node) => node.type === "material_output")) {
    errors.push("El grafo no contiene un nodo Material Output.");
  }
  return [...new Set(errors)];
}

function parseHexColor(value: unknown): [number, number, number] {
  if (typeof value !== "string") return [0.6, 0.6, 0.6];
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return [0.6, 0.6, 0.6];
  const integer = parseInt(match[1], 16);
  return [((integer >> 16) & 255) / 255, ((integer >> 8) & 255) / 255, (integer & 255) / 255];
}

function asVector3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value)) return fallback;
  return [
    asNumber(value[0], fallback[0]),
    asNumber(value[1], fallback[1]),
    asNumber(value[2], fallback[2]),
  ];
}

function formatHexColor(color: [number, number, number]): string {
  return `#${color
    .map((channel) =>
      Math.round(Math.max(0, Math.min(1, channel)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function asNumber(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function evaluateMath(operation: unknown, a: number, b: number): number {
  switch (operation) {
    case "subtract":
      return a - b;
    case "multiply":
      return a * b;
    case "divide":
      return Math.abs(b) > 1e-8 ? a / b : 0;
    case "minimum":
      return Math.min(a, b);
    case "maximum":
      return Math.max(a, b);
    case "power":
      return Math.pow(Math.max(0, a), b);
    case "sine":
      return Math.sin(a);
    case "cosine":
      return Math.cos(a);
    default:
      return a + b;
  }
}

function evaluateScalarMix(operation: unknown, factor: number, a: number, b: number): number {
  const blend = Math.max(0, Math.min(1, factor));
  const mode = operation ?? "mix";
  const operationValue =
    mode === "add"
      ? a + b
      : mode === "subtract"
        ? a - b
        : mode === "multiply"
          ? a * b
          : mode === "minimum"
            ? Math.min(a, b)
            : mode === "maximum"
              ? Math.max(a, b)
              : a + (b - a) * blend;
  return mode === "mix" ? operationValue : a + (operationValue - a) * blend;
}

function evaluateColorMix(
  operation: unknown,
  factor: number,
  colorA: [number, number, number],
  colorB: [number, number, number],
): string {
  const blend = Math.max(0, Math.min(1, factor));
  const mode = operation ?? "mix";
  const color = colorA.map((a, index) => {
    const b = colorB[index];
    const operationValue =
      mode === "add"
        ? a + b
        : mode === "subtract"
          ? a - b
          : mode === "multiply"
            ? a * b
            : a + (b - a) * blend;
    return mode === "mix" ? operationValue : a + (operationValue - a) * blend;
  }) as [number, number, number];
  return formatHexColor(color);
}

function evaluateVectorMix(
  operation: unknown,
  factor: number,
  vectorA: [number, number, number],
  vectorB: [number, number, number],
): [number, number, number] {
  const blend = Math.max(0, Math.min(1, factor));
  const mode = operation ?? "mix";
  return vectorA.map((a, index) => {
    const b = vectorB[index];
    const operationValue =
      mode === "add"
        ? a + b
        : mode === "subtract"
          ? a - b
          : mode === "multiply"
            ? a * b
            : a + (b - a) * blend;
    return mode === "mix" ? operationValue : a + (operationValue - a) * blend;
  }) as [number, number, number];
}

function transformVector(
  value: unknown,
  node: MaterialNode,
): [number, number, number] | Record<string, unknown> {
  const location = asVector3(node.values.location, [0, 0, 0]);
  const rotationDegrees = asVector3(node.values.rotation, [0, 0, 0]);
  const rotation = rotationDegrees.map((degrees) => (degrees * Math.PI) / 180) as [
    number,
    number,
    number,
  ];
  const scale = asVector3(node.values.scale, [1, 1, 1]);
  if (isRecord(value) && value.kind === "uv") {
    return { kind: "mapped_uv", location, rotation, scale };
  }
  if (isRecord(value) && value.kind === "mapped_uv") {
    return { ...value, location, rotation, scale };
  }

  let [x, y, z] = asVector3(value, [0, 0, 0]);
  x *= scale[0];
  y *= scale[1];
  z *= scale[2];

  const [rx, ry, rz] = rotation;
  const nextY = y * Math.cos(rx) - z * Math.sin(rx);
  let nextZ = y * Math.sin(rx) + z * Math.cos(rx);
  const nextX = x * Math.cos(ry) + nextZ * Math.sin(ry);
  nextZ = -x * Math.sin(ry) + nextZ * Math.cos(ry);
  x = nextX * Math.cos(rz) - nextY * Math.sin(rz);
  y = nextX * Math.sin(rz) + nextY * Math.cos(rz);
  z = nextZ;
  return [x + location[0], y + location[1], z + location[2]];
}

function evaluateRamp(node: MaterialNode, factor: number): { color: string; alpha: number } {
  const rawStops = node.values.stops;
  if (!Array.isArray(rawStops)) return { color: "#ffffff", alpha: 1 };
  const stops = rawStops
    .flatMap((stop) =>
      isRecord(stop)
        ? [
            {
              position: Math.max(0, Math.min(1, asNumber(stop.position, 0))),
              color: parseHexColor(stop.color),
              alpha: Math.max(0, Math.min(1, asNumber(stop.alpha, 1))),
            },
          ]
        : [],
    )
    .sort((a, b) => a.position - b.position);
  if (stops.length === 0) return { color: "#ffffff", alpha: 1 };

  const rightIndex = stops.findIndex((stop) => stop.position >= factor);
  if (rightIndex <= 0) {
    const stop = rightIndex === -1 ? stops[stops.length - 1] : stops[0];
    return { color: formatHexColor(stop.color), alpha: stop.alpha };
  }
  const left = stops[rightIndex - 1];
  const right = stops[rightIndex];
  let blend =
    right.position === left.position
      ? 0
      : (factor - left.position) / (right.position - left.position);
  if (node.values.interpolation === "constant") blend = 0;
  if (node.values.interpolation === "ease") blend = blend * blend * (3 - 2 * blend);
  const color = left.color.map(
    (channel, index) => channel + (right.color[index] - channel) * blend,
  ) as [number, number, number];
  return {
    color: formatHexColor(color),
    alpha: left.alpha + (right.alpha - left.alpha) * blend,
  };
}

const PROCEDURAL_TEXTURE_SIZE = 96;
const proceduralBakeCache = new Map<string, string>();

function setCachedProceduralBake(key: string, dataUrl: string): void {
  if (proceduralBakeCache.has(key)) {
    proceduralBakeCache.delete(key);
  } else if (proceduralBakeCache.size >= 48) {
    const oldestKey = proceduralBakeCache.keys().next().value;
    if (oldestKey !== undefined) {
      proceduralBakeCache.delete(oldestKey);
    }
  }
  proceduralBakeCache.set(key, dataUrl);
}

function readDimensions(value: unknown): ProceduralDimensions {
  return value === "1D" || value === "2D" || value === "3D" || value === "4D" ? value : "3D";
}

function readVoronoiFeature(value: unknown): VoronoiFeature {
  return value === "f1" ||
    value === "f2" ||
    value === "smooth_f1" ||
    value === "distance_to_edge" ||
    value === "n_sphere_radius"
    ? value
    : "f1";
}

function readVoronoiMetric(value: unknown): VoronoiDistanceMetric {
  return value === "euclidean" ||
    value === "manhattan" ||
    value === "chebychev" ||
    value === "minkowski"
    ? value
    : "euclidean";
}

function applyUvMappingTransform(
  coord: [number, number, number],
  location: [number, number, number],
  rotation: [number, number, number],
  scale: [number, number, number],
): [number, number, number] {
  let x = coord[0] * scale[0];
  let y = coord[1] * scale[1];
  let z = coord[2] * scale[2];
  const [rx, ry, rz] = rotation;
  const nextY = y * Math.cos(rx) - z * Math.sin(rx);
  let nextZ = y * Math.sin(rx) + z * Math.cos(rx);
  const nextX = x * Math.cos(ry) + nextZ * Math.sin(ry);
  nextZ = -x * Math.sin(ry) + nextZ * Math.cos(ry);
  x = nextX * Math.cos(rz) - nextY * Math.sin(rz);
  y = nextX * Math.sin(rz) + nextY * Math.cos(rz);
  z = nextZ;
  return [x + location[0], y + location[1], z + location[2]];
}


export function evaluateMaterialNodeGraph(
  graph: MaterialNodeGraph,
  fallback: Pick<
    MaterialAsset,
    | "baseColor"
    | "metallic"
    | "roughness"
    | "opacity"
    | "emissiveColor"
    | "emissiveIntensity"
    | "textureName"
    | "textureDataUrl"
  >,
): MaterialGraphEvaluation {
  const errors = validateMaterialNodeGraph(graph);
  const fallbackSurface: EvaluatedMaterialSurface = {
    baseColor: fallback.baseColor,
    baseColorTextureUrl: fallback.textureDataUrl,
    textureName: fallback.textureName,
    textureTransform: undefined,
    metallic: fallback.metallic,
    roughness: fallback.roughness,
    opacity: fallback.opacity ?? 1,
    ior: 1.45,
    specular: 0.5,
    emissionColor: fallback.emissiveColor ?? "#000000",
    emissionIntensity: fallback.emissiveIntensity ?? 0,
  };
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const outputNode = graph.nodes.find((node) => node.type === "material_output");
  const outputLink = outputNode
    ? graph.links.find(
        (link) => link.toNodeId === outputNode.id && link.toSocket === "surface",
      )
    : undefined;
  const surfaceShader = outputLink ? nodes.get(outputLink.fromNodeId) : undefined;
  const outputStatus: MaterialOutputStatus = !outputNode
    ? "missing_output"
    : !outputLink || !surfaceShader
      ? "disconnected"
      : surfaceShader.type !== "principled_bsdf" && surfaceShader.type !== "emission"
        ? "invalid"
        : "connected";
  const hasConnectedOutput = outputStatus === "connected";

  if (errors.length > 0) {
    return {
      ok: false,
      hasConnectedOutput,
      outputStatus,
      surface: fallbackSurface,
      errors,
    };
  }

  if (!surfaceShader || (surfaceShader.type !== "principled_bsdf" && surfaceShader.type !== "emission")) {
    return {
      ok: false,
      hasConnectedOutput: false,
      outputStatus,
      surface: fallbackSurface,
      errors: ["La salida Surface debe estar conectada a un nodo shader (Principled BSDF o Emission)."],
    };
  }

  const unsupportedNodes = new Set<string>();
  const findLink = (nodeId: string, socketId: string) =>
    graph.links.find((candidate) => candidate.toNodeId === nodeId && candidate.toSocket === socketId);

  const subtreeHasProceduralSource = (
    node: MaterialNode,
    socketId: string,
    visited = new Set<string>(),
  ): boolean => {
    const visitKey = `${node.id}:${socketId}`;
    if (visited.has(visitKey)) return false;
    visited.add(visitKey);
    const link = findLink(node.id, socketId);
    if (!link) return false;
    const source = nodes.get(link.fromNodeId);
    if (!source) return false;
    if (source.type === "noise_texture" || source.type === "voronoi_texture") {
      return true;
    }
    const def = getMaterialNodeDefinition(source.type);
    return def.inputs.some((input) => subtreeHasProceduralSource(source, input.id, visited));
  };

  const getNoiseParamsAtCoord = (
    source: MaterialNode,
    coord: [number, number, number],
  ): NoiseTextureParams => ({
    dimensions: readDimensions(source.values.dimensions),
    w: evalScalarAtCoord(source, "w", 0, coord),
    scale: evalScalarAtCoord(source, "scale", 5, coord),
    detail: evalScalarAtCoord(source, "detail", 2, coord),
    roughness: evalScalarAtCoord(source, "roughness", 0.5, coord),
    lacunarity: evalScalarAtCoord(source, "lacunarity", 2, coord),
    offset: evalScalarAtCoord(source, "offset", 0, coord),
    distortion: evalScalarAtCoord(source, "distortion", 0, coord),
    normalize: source.values.normalize !== false,
  });

  const getVoronoiParamsAtCoord = (
    source: MaterialNode,
    coord: [number, number, number],
  ): VoronoiTextureParams => ({
    dimensions: readDimensions(source.values.dimensions),
    feature: readVoronoiFeature(source.values.feature),
    distanceMetric: readVoronoiMetric(source.values.distanceMetric),
    w: evalScalarAtCoord(source, "w", 0, coord),
    scale: evalScalarAtCoord(source, "scale", 5, coord),
    detail: evalScalarAtCoord(source, "detail", 0, coord),
    roughness: evalScalarAtCoord(source, "roughness", 0.5, coord),
    lacunarity: evalScalarAtCoord(source, "lacunarity", 2, coord),
    smoothness: evalScalarAtCoord(source, "smoothness", 1, coord),
    exponent: evalScalarAtCoord(source, "exponent", 0.5, coord),
    randomness: evalScalarAtCoord(source, "randomness", 1, coord),
    normalize: Boolean(source.values.normalize),
  });

  const evalVectorAtCoord = (
    node: MaterialNode,
    socketId: string,
    defaultVec: [number, number, number],
    coord: [number, number, number],
  ): [number, number, number] => {
    const link = findLink(node.id, socketId);
    if (!link) return asVector3(node.values[socketId], defaultVec);
    const source = nodes.get(link.fromNodeId);
    if (!source) return defaultVec;

    if (source.type === "texture_coordinate") {
      if (link.fromSocket === "generated") {
        return [coord[0], coord[1], 0.5];
      }
      return [coord[0], coord[1], 0];
    }
    if (source.type === "mapping") {
      const baseVec = evalVectorAtCoord(source, "vector", coord, coord);
      const location = asVector3(source.values.location, [0, 0, 0]);
      const rotation = asVector3(source.values.rotation, [0, 0, 0]);
      const scale = asVector3(source.values.scale, [1, 1, 1]);
      return applyUvMappingTransform(baseVec, location, rotation, scale);
    }
    if (source.type === "transform") {
      const baseVec = evalVectorAtCoord(source, "vector", coord, coord);
      const location = asVector3(source.values.location, [0, 0, 0]);
      const rotationDeg = asVector3(source.values.rotation, [0, 0, 0]);
      const rotation = rotationDeg.map((deg) => (deg * Math.PI) / 180) as [number, number, number];
      const scale = asVector3(source.values.scale, [1, 1, 1]);
      return applyUvMappingTransform(baseVec, location, rotation, scale);
    }
    if (source.type === "mix_vector") {
      return evaluateVectorMix(
        source.values.operation,
        evalScalarAtCoord(source, "factor", 0.5, coord),
        evalVectorAtCoord(source, "a", [0, 0, 0], coord),
        evalVectorAtCoord(source, "b", [1, 1, 1], coord),
      );
    }
    if (source.type === "value_vector") {
      return asVector3(source.values.value, defaultVec);
    }
    if (source.type === "voronoi_texture" && link.fromSocket === "position") {
      const sampleVec = evalVectorAtCoord(source, "vector", coord, coord);
      return evaluateVoronoiSample(getVoronoiParamsAtCoord(source, coord), sampleVec).position;
    }
    return defaultVec;
  };

  const evalColorRgbAtCoord = (
    node: MaterialNode,
    socketId: string,
    defaultColor: [number, number, number],
    coord: [number, number, number],
  ): [number, number, number] => {
    const link = findLink(node.id, socketId);
    if (!link) return parseHexColor(node.values[socketId] ?? formatHexColor(defaultColor));
    const source = nodes.get(link.fromNodeId);
    if (!source) return defaultColor;

    if (source.type === "noise_texture") {
      const sampleVec = evalVectorAtCoord(source, "vector", coord, coord);
      const res = evaluateNoiseSample(getNoiseParamsAtCoord(source, coord), sampleVec);
      if (link.fromSocket === "color") return res.color;
      return [res.factor, res.factor, res.factor];
    }
    if (source.type === "voronoi_texture") {
      const sampleVec = evalVectorAtCoord(source, "vector", coord, coord);
      const res = evaluateVoronoiSample(getVoronoiParamsAtCoord(source, coord), sampleVec);
      if (link.fromSocket === "color") return res.color;
      if (link.fromSocket === "position") return res.position;
      const scalar =
        link.fromSocket === "radius" ? res.radius : link.fromSocket === "w" ? res.w : res.distance;
      return [scalar, scalar, scalar];
    }
    if (source.type === "color_ramp") {
      const factor = Math.max(0, Math.min(1, evalScalarAtCoord(source, "factor", 0.5, coord)));
      const result = evaluateRamp(source, factor);
      if (link.fromSocket === "alpha") {
        return [result.alpha, result.alpha, result.alpha];
      }
      return parseHexColor(result.color);
    }
    if (source.type === "mix_color") {
      const factor = Math.max(0, Math.min(1, evalScalarAtCoord(source, "factor", 0.5, coord)));
      const cA = evalColorRgbAtCoord(source, "colorA", [0, 0, 0], coord);
      const cB = evalColorRgbAtCoord(source, "colorB", [1, 1, 1], coord);
      return parseHexColor(evaluateColorMix(source.values.operation, factor, cA, cB));
    }
    if (source.type === "value_color") {
      return parseHexColor(source.values.value);
    }
    const scalar = evalScalarAtCoord(node, socketId, 0.5, coord);
    return [scalar, scalar, scalar];
  };

  const evalScalarAtCoord = (
    node: MaterialNode,
    socketId: string,
    defaultValue: number,
    coord: [number, number, number],
  ): number => {
    const link = findLink(node.id, socketId);
    if (!link) return asNumber(node.values[socketId], defaultValue);
    const source = nodes.get(link.fromNodeId);
    if (!source) return defaultValue;

    if (source.type === "noise_texture") {
      const sampleVec = evalVectorAtCoord(source, "vector", coord, coord);
      const res = evaluateNoiseSample(getNoiseParamsAtCoord(source, coord), sampleVec);
      if (link.fromSocket === "color") {
        return (res.color[0] + res.color[1] + res.color[2]) / 3;
      }
      return res.factor;
    }
    if (source.type === "voronoi_texture") {
      const sampleVec = evalVectorAtCoord(source, "vector", coord, coord);
      const res = evaluateVoronoiSample(getVoronoiParamsAtCoord(source, coord), sampleVec);
      if (link.fromSocket === "color") {
        return (res.color[0] + res.color[1] + res.color[2]) / 3;
      }
      if (link.fromSocket === "position") {
        return (res.position[0] + res.position[1] + res.position[2]) / 3;
      }
      if (link.fromSocket === "w") return res.w;
      if (link.fromSocket === "radius") return res.radius;
      return res.distance;
    }
    if (source.type === "math") {
      return evaluateMath(
        source.values.operation,
        evalScalarAtCoord(source, "a", 0, coord),
        evalScalarAtCoord(source, "b", 0, coord),
      );
    }
    if (source.type === "mix_float") {
      return evaluateScalarMix(
        source.values.operation,
        evalScalarAtCoord(source, "factor", 0.5, coord),
        evalScalarAtCoord(source, "a", 0, coord),
        evalScalarAtCoord(source, "b", 0, coord),
      );
    }
    if (source.type === "color_ramp") {
      const factor = Math.max(0, Math.min(1, evalScalarAtCoord(source, "factor", 0.5, coord)));
      const ramp = evaluateRamp(source, factor);
      if (link.fromSocket === "alpha") return ramp.alpha;
      const rgb = parseHexColor(ramp.color);
      return (rgb[0] + rgb[1] + rgb[2]) / 3;
    }
    if (
      source.type === "value_float" ||
      source.type === "value_integer" ||
      source.type === "value_boolean"
    ) {
      return asNumber(source.values.value, defaultValue);
    }
    if (source.type === "mix_color") {
      const rgb = evalColorRgbAtCoord(node, socketId, [defaultValue, defaultValue, defaultValue], coord);
      return (rgb[0] + rgb[1] + rgb[2]) / 3;
    }
    return defaultValue;
  };

  const serializeSubtreeKey = (
    node: MaterialNode,
    socketId: string,
    visited = new Set<string>(),
  ): string => {
    const link = findLink(node.id, socketId);
    if (!link) return `v:${JSON.stringify(node.values[socketId] ?? null)}`;
    if (visited.has(link.id)) return "cycle";
    visited.add(link.id);
    const source = nodes.get(link.fromNodeId);
    if (!source) return "missing";
    const def = getMaterialNodeDefinition(source.type);
    const inputKeys = def.inputs.map(
      (input) => `${input.id}=${serializeSubtreeKey(source, input.id, new Set(visited))}`,
    );
    return `${source.type}:${link.fromSocket}:${JSON.stringify(source.values)}:(${inputKeys.join(",")})`;
  };

  const bakeProceduralSubtree = (
    node: MaterialNode,
    socketId: string,
    mode: "color" | "scalar",
  ): string => {
    const cacheKey = `${mode}|${serializeSubtreeKey(node, socketId)}`;
    const cached = proceduralBakeCache.get(cacheKey);
    if (cached) return cached;

    const size = PROCEDURAL_TEXTURE_SIZE;
    const rgba = new Uint8ClampedArray(size * size * 4);
    for (let py = 0; py < size; py += 1) {
      const v = 1 - (py + 0.5) / size;
      for (let px = 0; px < size; px += 1) {
        const u = (px + 0.5) / size;
        const idx = (py * size + px) * 4;
        if (mode === "color") {
          const [r, g, b] = evalColorRgbAtCoord(node, socketId, [0.5, 0.5, 0.5], [u, v, 0]);
          rgba[idx] = Math.round(Math.max(0, Math.min(1, r)) * 255);
          rgba[idx + 1] = Math.round(Math.max(0, Math.min(1, g)) * 255);
          rgba[idx + 2] = Math.round(Math.max(0, Math.min(1, b)) * 255);
          rgba[idx + 3] = 255;
        } else {
          const val = Math.max(0, Math.min(1, evalScalarAtCoord(node, socketId, 0.5, [u, v, 0])));
          const byte = Math.round(val * 255);
          rgba[idx] = byte;
          rgba[idx + 1] = byte;
          rgba[idx + 2] = byte;
          rgba[idx + 3] = 255;
        }
      }
    }
    const url = rgbaToPngDataUrl(size, size, rgba);
    setCachedProceduralBake(cacheKey, url);
    return url;
  };

  const inputValue = (node: MaterialNode, socketId: string): unknown => {
    const link = findLink(node.id, socketId);
    if (!link) return node.values[socketId];
    const source = nodes.get(link.fromNodeId);
    if (!source) return undefined;
    if (subtreeHasProceduralSource(node, socketId)) {
      const sampleCoord: [number, number, number] = [0.5, 0.5, 0];
      if (
        source.type === "noise_texture" ||
        source.type === "voronoi_texture" ||
        source.type === "color_ramp" ||
        source.type === "mix_color" ||
        source.type === "math" ||
        source.type === "mix_float"
      ) {
        if (
          link.fromSocket === "color" ||
          (source.type === "mix_color" && link.fromSocket === "color")
        ) {
          return formatHexColor(evalColorRgbAtCoord(node, socketId, [0.5, 0.5, 0.5], sampleCoord));
        }
        return evalScalarAtCoord(node, socketId, 0.5, sampleCoord);
      }
    }
    if (source.type === "math" && link.fromSocket === "value") {
      return evaluateMath(
        source.values.operation,
        scalarInput(source, "a", 0),
        scalarInput(source, "b", 0),
      );
    }
    if (
      source.type === "value_float" ||
      source.type === "value_integer" ||
      source.type === "value_boolean"
    ) {
      return source.values.value;
    }
    if (source.type === "value_color") return source.values.value;
    if (source.type === "value_vector") return source.values.value;
    if (source.type === "mix_float" && link.fromSocket === "value") {
      return evaluateScalarMix(
        source.values.operation,
        scalarInput(source, "factor", 0.5),
        scalarInput(source, "a", 0),
        scalarInput(source, "b", 0),
      );
    }
    if (source.type === "mix_vector" && link.fromSocket === "vector") {
      return evaluateVectorMix(
        source.values.operation,
        scalarInput(source, "factor", 0.5),
        asVector3(inputValue(source, "a"), [0, 0, 0]),
        asVector3(inputValue(source, "b"), [0, 0, 0]),
      );
    }
    if (source.type === "mix_color" && link.fromSocket === "color") {
      const factor = Math.max(0, Math.min(1, scalarInput(source, "factor", 0.5)));
      return evaluateColorMix(
        source.values.operation,
        factor,
        parseHexColor(inputValue(source, "colorA")),
        parseHexColor(inputValue(source, "colorB")),
      );
    }
    if (
      source.type === "color_ramp" &&
      (link.fromSocket === "color" || link.fromSocket === "alpha")
    ) {
      const factor = Math.max(0, Math.min(1, scalarInput(source, "factor", 0.5)));
      const result = evaluateRamp(source, factor);
      return link.fromSocket === "alpha" ? result.alpha : result.color;
    }
    if (source.type === "principled_bsdf") {
      return source.values[link.fromSocket];
    }
    if (source.type === "image_texture") {
      const dataUrl =
        typeof source.values.dataUrl === "string"
          ? source.values.dataUrl
          : source.values.textureSlot === "baseColor"
            ? fallback.textureDataUrl
            : undefined;
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
        unsupportedNodes.add(source.id);
        return undefined;
      }
      return {
        kind: link.fromSocket === "alpha" ? "image_alpha" : "image_texture",
        nodeId: source.id,
        dataUrl,
        textureName:
          typeof source.values.textureName === "string"
            ? source.values.textureName
            : source.values.textureSlot === "baseColor"
              ? (fallback.textureName ?? "")
              : "",
        transform: inputValue(source, "vector"),
      };
    }
    if (source.type === "texture_coordinate") {
      if (link.fromSocket !== "uv" && link.fromSocket !== "generated") {
        unsupportedNodes.add(source.id);
        return undefined;
      }
      return { kind: "uv", coordType: link.fromSocket };
    }
    if (source.type === "mapping") {
      const inputVector = inputValue(source, "vector");
      if (isRecord(inputVector) && inputVector.kind === "mapped_uv") {
        unsupportedNodes.add(source.id);
        return undefined;
      }
      return {
        kind: "mapped_uv",
        location: asVector3(source.values.location, [0, 0, 0]),
        rotation: asVector3(source.values.rotation, [0, 0, 0]),
        scale: asVector3(source.values.scale, [1, 1, 1]),
      };
    }
    if (source.type === "transform" && link.fromSocket === "vector") {
      const vector = inputValue(source, "vector");
      if (isRecord(vector) && vector.kind === "mapped_uv") {
        unsupportedNodes.add(source.id);
        return undefined;
      }
      return transformVector(vector, source);
    }
    if (source.type === "normal_map" && link.fromSocket === "normal") {
      if (subtreeHasProceduralSource(source, "color")) {
        return {
          kind: "normal_map",
          dataUrl: bakeProceduralSubtree(source, "color", "color"),
          textureName: "Procedural Normal",
          transform: undefined,
          strength: Math.max(0, scalarInput(source, "strength", 1)),
        };
      }
      const color = inputValue(source, "color");
      if (!isRecord(color) || color.kind !== "image_texture") {
        unsupportedNodes.add(source.id);
        return undefined;
      }
      return {
        kind: "normal_map",
        dataUrl: color.dataUrl,
        textureName: color.textureName,
        transform: color.transform,
        strength: Math.max(0, scalarInput(source, "strength", 1)),
      };
    }
    if (source.type === "bump" && link.fromSocket === "normal") {
      if (
        graph.links.some(
          (candidate) => candidate.toNodeId === source.id && candidate.toSocket === "normal",
        )
      ) {
        unsupportedNodes.add(source.id);
        return undefined;
      }
      if (subtreeHasProceduralSource(source, "height")) {
        return {
          kind: "bump_map",
          dataUrl: bakeProceduralSubtree(source, "height", "scalar"),
          transform: undefined,
          scale: Math.max(0, scalarInput(source, "strength", 1)) * scalarInput(source, "distance", 1),
        };
      }
      const height = inputValue(source, "height");
      if (!isRecord(height) || (height.kind !== "image_alpha" && height.kind !== "image_texture")) {
        unsupportedNodes.add(source.id);
        return undefined;
      }
      return {
        kind: "bump_map",
        dataUrl: height.dataUrl,
        transform: height.transform,
        scale: Math.max(0, scalarInput(source, "strength", 1)) * scalarInput(source, "distance", 1),
      };
    }
    return source.values[link.fromSocket];
  };

  const scalarInput = (node: MaterialNode, socketId: string, defaultValue: number): number => {
    const value = inputValue(node, socketId);
    if (
      isRecord(value) &&
      (value.kind === "image_alpha" || value.kind === "image_texture") &&
      typeof value.nodeId === "string"
    ) {
      unsupportedNodes.add(value.nodeId);
      return defaultValue;
    }
    return asNumber(value, defaultValue);
  };

  const clamp = (value: unknown, fallbackValue: number) =>
    Math.max(0, Math.min(1, asNumber(value, fallbackValue)));

  if (surfaceShader.type === "emission") {
    const emissionColorIsProcedural = subtreeHasProceduralSource(surfaceShader, "color");
    const emissionValue = inputValue(surfaceShader, "color");
    const emissionImage =
      isRecord(emissionValue) && emissionValue.kind === "image_texture"
        ? emissionValue
        : undefined;
    const proceduralEmissionUrl = emissionColorIsProcedural
      ? bakeProceduralSubtree(surfaceShader, "color", "color")
      : undefined;
    const emissionTextureUrl =
      typeof emissionImage?.dataUrl === "string"
        ? emissionImage.dataUrl
        : proceduralEmissionUrl;
    const emissionColor = emissionTextureUrl
      ? "#ffffff"
      : typeof emissionValue === "string"
        ? emissionValue
        : typeof surfaceShader.values.color === "string"
          ? surfaceShader.values.color
          : "#ffffff";
    const emissionIntensity = Math.max(0, scalarInput(surfaceShader, "strength", 1));

    if (unsupportedNodes.size > 0) {
      return {
        ok: false,
        hasConnectedOutput: true,
        outputStatus: "connected",
        surface: fallbackSurface,
        errors: Array.from(unsupportedNodes, (nodeId) => {
          const node = nodes.get(nodeId);
          const label =
            MATERIAL_NODE_DEFINITIONS.find((definition) => definition.id === node?.type)?.label ??
            nodeId;
          return `El nodo ${label} aún no está disponible en el evaluador.`;
        }),
      };
    }

    return {
      ok: true,
      hasConnectedOutput: true,
      outputStatus: "connected",
      errors: [],
      surface: {
        baseColor: "#000000",
        metallic: 0,
        roughness: 1,
        opacity: 1,
        ior: 1.45,
        specular: 0,
        emissionColor,
        emissionTextureUrl,
        emissionIntensity,
      },
    };
  }

  const principled = surfaceShader;
  const baseColorIsProcedural = subtreeHasProceduralSource(principled, "baseColor");
  const roughnessIsProcedural = subtreeHasProceduralSource(principled, "roughness");
  const metallicIsProcedural = subtreeHasProceduralSource(principled, "metallic");
  const emissionIsProcedural = subtreeHasProceduralSource(principled, "emission");
  const aoIsProcedural = subtreeHasProceduralSource(principled, "ao");
  const displacementIsProcedural = subtreeHasProceduralSource(principled, "displacement");

  const baseColorValue = inputValue(principled, "baseColor");
  const roughnessValue = inputValue(principled, "roughness");
  const metallicValue = inputValue(principled, "metallic");
  const aoValue = inputValue(principled, "ao");
  const displacementValue = inputValue(principled, "displacement");
  const emissionValue = inputValue(principled, "emission");

  const extractImageRecord = (val: unknown) =>
    isRecord(val) &&
    (val.kind === "image_texture" || val.kind === "image_alpha") &&
    typeof val.dataUrl === "string"
      ? val
      : undefined;

  const baseColorTexture =
    isRecord(baseColorValue) && baseColorValue.kind === "image_texture"
      ? baseColorValue
      : undefined;
  const roughnessImageTexture = extractImageRecord(roughnessValue);
  const metallicImageTexture = extractImageRecord(metallicValue);
  const aoImageTexture = extractImageRecord(aoValue);
  const displacementImageTexture = extractImageRecord(displacementValue);
  const emissionImageTexture =
    isRecord(emissionValue) && emissionValue.kind === "image_texture"
      ? emissionValue
      : undefined;
  const proceduralBaseColorUrl = baseColorIsProcedural
    ? bakeProceduralSubtree(principled, "baseColor", "color")
    : undefined;
  const proceduralRoughnessUrl = roughnessIsProcedural
    ? bakeProceduralSubtree(principled, "roughness", "scalar")
    : undefined;
  const proceduralMetallicUrl = metallicIsProcedural
    ? bakeProceduralSubtree(principled, "metallic", "scalar")
    : undefined;
  const proceduralAoUrl = aoIsProcedural
    ? bakeProceduralSubtree(principled, "ao", "scalar")
    : undefined;
  const proceduralDisplacementUrl = displacementIsProcedural
    ? bakeProceduralSubtree(principled, "displacement", "scalar")
    : undefined;
  const proceduralEmissionUrl = emissionIsProcedural
    ? bakeProceduralSubtree(principled, "emission", "color")
    : undefined;
  const mappedTransform =
    baseColorTexture && isRecord(baseColorTexture.transform)
      ? baseColorTexture.transform
      : undefined;
  const normalValue = inputValue(principled, "normal");
  if (
    isRecord(normalValue) &&
    normalValue.kind === "image_texture" &&
    typeof normalValue.nodeId === "string"
  ) {
    unsupportedNodes.add(normalValue.nodeId);
  }
  const normalTexture =
    isRecord(normalValue) && normalValue.kind === "normal_map" ? normalValue : undefined;
  const bumpTexture =
    isRecord(normalValue) && normalValue.kind === "bump_map" ? normalValue : undefined;
  const mapTransform = (value: Record<string, unknown> | undefined) => {
    const transform = value?.transform;
    if (!isRecord(transform) || transform.kind !== "mapped_uv") {
      return undefined;
    }
    return {
      location: asVector3(transform.location, [0, 0, 0]),
      rotation: asVector3(transform.rotation, [0, 0, 0]),
      scale: asVector3(transform.scale, [1, 1, 1]),
    };
  };
  const baseColor = typeof baseColorValue === "string" ? baseColorValue : fallbackSurface.baseColor;
  const emissionTextureUrl =
    typeof emissionImageTexture?.dataUrl === "string"
      ? emissionImageTexture.dataUrl
      : proceduralEmissionUrl;
  const emissionColor = emissionTextureUrl
    ? "#ffffff"
    : typeof emissionValue === "string"
      ? emissionValue
      : fallbackSurface.emissionColor;
  const ior = Math.max(1, Math.min(2.5, scalarInput(principled, "ior", 1.45)));
  const roughnessTextureUrl =
    typeof roughnessImageTexture?.dataUrl === "string"
      ? roughnessImageTexture.dataUrl
      : proceduralRoughnessUrl;
  const metallicTextureUrl =
    typeof metallicImageTexture?.dataUrl === "string"
      ? metallicImageTexture.dataUrl
      : proceduralMetallicUrl;
  const aoTextureUrl =
    typeof aoImageTexture?.dataUrl === "string"
      ? aoImageTexture.dataUrl
      : proceduralAoUrl;
  const displacementTextureUrl =
    typeof displacementImageTexture?.dataUrl === "string"
      ? displacementImageTexture.dataUrl
      : proceduralDisplacementUrl;

  const evaluatedMetallic = metallicImageTexture
    ? clamp(principled.values.metallic ?? 1, 1)
    : clamp(
        scalarInput(principled, "metallic", fallbackSurface.metallic),
        fallbackSurface.metallic,
      );
  const evaluatedRoughness = roughnessImageTexture
    ? clamp(principled.values.roughness ?? 1, 1)
    : clamp(
        scalarInput(principled, "roughness", fallbackSurface.roughness),
        fallbackSurface.roughness,
      );
  const aoStrength = aoTextureUrl
    ? Math.max(0, Math.min(2, asNumber(principled.values.ao, 1)))
    : undefined;
  const displacementScale = displacementTextureUrl
    ? Math.max(0, Math.min(1, asNumber(principled.values.displacement, 0.04)))
    : undefined;
  if (!aoImageTexture && !aoIsProcedural && findLink(principled.id, "ao")) {
    scalarInput(principled, "ao", 1);
  }
  if (!displacementImageTexture && !displacementIsProcedural && findLink(principled.id, "displacement")) {
    scalarInput(principled, "displacement", 0.04);
  }
  const evaluatedOpacity = clamp(
    scalarInput(principled, "alpha", fallbackSurface.opacity),
    fallbackSurface.opacity,
  );
  const evaluatedSpecular = clamp(scalarInput(principled, "specular", 0.5), 0.5);
  const evaluatedEmissionStrength = Math.max(0, scalarInput(principled, "emissionStrength", 0));

  if (unsupportedNodes.size > 0) {
    return {
      ok: false,
      hasConnectedOutput: true,
      outputStatus: "connected",
      surface: fallbackSurface,
      errors: Array.from(unsupportedNodes, (nodeId) => {
        const node = nodes.get(nodeId);
        const label =
          MATERIAL_NODE_DEFINITIONS.find((definition) => definition.id === node?.type)?.label ??
          nodeId;
        return `El nodo ${label} aún no está disponible en el evaluador.`;
      }),
    };
  }

  return {
    ok: true,
    hasConnectedOutput: true,
    outputStatus: "connected",
    errors: [],
    surface: {
      baseColor,
      baseColorTextureUrl:
        typeof baseColorTexture?.dataUrl === "string"
          ? baseColorTexture.dataUrl
          : proceduralBaseColorUrl,
      textureName:
        typeof baseColorTexture?.textureName === "string"
          ? baseColorTexture.textureName
          : proceduralBaseColorUrl
            ? "Procedural Texture"
            : undefined,
      textureTransform:
        mappedTransform?.kind === "mapped_uv"
          ? {
              location: asVector3(mappedTransform.location, [0, 0, 0]),
              rotation: asVector3(mappedTransform.rotation, [0, 0, 0]),
              scale: asVector3(mappedTransform.scale, [1, 1, 1]),
            }
          : undefined,
      normalTextureUrl:
        typeof normalTexture?.dataUrl === "string" ? normalTexture.dataUrl : undefined,
      normalTextureTransform: mapTransform(normalTexture),
      normalMapStrength:
        typeof normalTexture?.strength === "number" ? normalTexture.strength : undefined,
      bumpTextureUrl: typeof bumpTexture?.dataUrl === "string" ? bumpTexture.dataUrl : undefined,
      bumpTextureTransform: mapTransform(bumpTexture),
      bumpScale: typeof bumpTexture?.scale === "number" ? bumpTexture.scale : undefined,
      roughnessTextureUrl,
      metallicTextureUrl,
      aoTextureUrl,
      aoStrength,
      displacementTextureUrl,
      displacementScale,
      metallic: evaluatedMetallic,
      roughness: evaluatedRoughness,
      opacity: evaluatedOpacity,
      ior,
      specular: evaluatedSpecular,
      emissionColor,
      emissionTextureUrl,
      emissionIntensity: evaluatedEmissionStrength,
    },
  };
}

export function getNodeCategoryColor(category: MaterialNodeCategory): string {
  switch (category) {
    case "input":
      return "#38bdf8";
    case "shader":
      return "#ff9b59";
    case "texture":
      return "#5ecd6e";
    case "color":
      return "#dc8bff";
    case "vector":
      return "#6edb8b";
    case "output":
      return "#e8c35a";
  }
}
