import { loadReferenceImageFile } from "../io/imageReference";
import type {
  MaterialAsset,
  MaterialNode,
  MaterialNodeGraph,
  MaterialNodeLink,
} from "../project/types";
import {
  createDefaultMaterialNodeGraph,
  evaluateMaterialNodeGraph,
  normalizeMaterialNodeGraph,
} from "./nodeGraph";

export type PbrChannelId =
  | "baseColor"
  | "roughness"
  | "metallic"
  | "normal"
  | "ao"
  | "displacement";

export type PbrColorSpace = "srgb" | "linear";

export interface PbrChannelSpec {
  id: PbrChannelId;
  label: string;
  shortLabel: string;
  colorSpace: PbrColorSpace;
  colorSpaceLabel: string;
  principledSocket: string;
}

export const PBR_CHANNEL_IDS: readonly PbrChannelId[] = [
  "baseColor",
  "roughness",
  "metallic",
  "normal",
  "ao",
  "displacement",
] as const;

export const PBR_CHANNEL_SPECS: Record<PbrChannelId, PbrChannelSpec> = {
  baseColor: {
    id: "baseColor",
    label: "Base Color / Albedo",
    shortLabel: "Base Color",
    colorSpace: "srgb",
    colorSpaceLabel: "sRGB",
    principledSocket: "baseColor",
  },
  roughness: {
    id: "roughness",
    label: "Roughness",
    shortLabel: "Roughness",
    colorSpace: "linear",
    colorSpaceLabel: "Lineal (NoColorSpace)",
    principledSocket: "roughness",
  },
  metallic: {
    id: "metallic",
    label: "Metallic",
    shortLabel: "Metallic",
    colorSpace: "linear",
    colorSpaceLabel: "Lineal (NoColorSpace)",
    principledSocket: "metallic",
  },
  normal: {
    id: "normal",
    label: "Normal Map",
    shortLabel: "Normal",
    colorSpace: "linear",
    colorSpaceLabel: "Lineal (NoColorSpace)",
    principledSocket: "normal",
  },
  ao: {
    id: "ao",
    label: "Ambient Occlusion (AO)",
    shortLabel: "AO",
    colorSpace: "linear",
    colorSpaceLabel: "Lineal (NoColorSpace)",
    principledSocket: "ao",
  },
  displacement: {
    id: "displacement",
    label: "Height / Displacement",
    shortLabel: "Height",
    colorSpace: "linear",
    colorSpaceLabel: "Lineal (NoColorSpace)",
    principledSocket: "displacement",
  },
};

export interface PbrImportedTexture {
  fileName: string;
  dataUrl: string;
  width?: number;
  height?: number;
  wasResizedForWebGL?: boolean;
}

export interface ExtractedPbrChannelStatus {
  channel: PbrChannelId;
  spec: PbrChannelSpec;
  loaded: boolean;
  dataUrl?: string;
  textureName?: string;
}

const CHANNEL_TOKEN_PATTERNS: Array<{ channel: PbrChannelId; tokens: string[] }> = [
  {
    channel: "displacement",
    tokens: ["displacement", "displace", "disp", "height", "hgt", "altura", "bump"],
  },
  {
    channel: "ao",
    tokens: ["ambientocclusion", "ambient_occlusion", "occlusion", "occ", "ao"],
  },
  {
    channel: "normal",
    tokens: ["normalgl", "normaldx", "normal", "norm", "nrm", "nor"],
  },
  {
    channel: "roughness",
    tokens: ["roughness", "rugosidad", "rough", "rgh", "gloss"],
  },
  {
    channel: "metallic",
    tokens: ["metalness", "metallic", "metal", "met", "mtl"],
  },
  {
    channel: "baseColor",
    tokens: ["basecolor", "base_color", "albedo", "diffuse", "diff", "color", "col", "bc"],
  },
];

function tokenizeFilenameStem(fileName: string): string[] {
  const withoutExt = fileName.replace(/\.[^.]+$/, "");
  const camelSplit = withoutExt.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  return camelSplit
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Detects a PBR texture channel from common naming conventions (English & Spanish).
 */
export function detectPbrChannelFromFilename(fileName: string): PbrChannelId | null {
  const tokens = tokenizeFilenameStem(fileName);
  const joined = tokens.join("_");

  for (const entry of CHANNEL_TOKEN_PATTERNS) {
    for (const token of entry.tokens) {
      if (token.includes("_")) {
        if (joined.includes(token)) return entry.channel;
      } else if (tokens.includes(token)) {
        return entry.channel;
      }
    }
  }

  // Fallback substring checks for filenames like "metalplate01rough.png"
  for (const entry of CHANNEL_TOKEN_PATTERNS) {
    for (const token of entry.tokens) {
      if (token.length >= 4 && joined.includes(token.replace(/_/g, ""))) {
        return entry.channel;
      }
    }
  }

  return null;
}

const ALL_CHANNEL_KEYWORDS = new Set(
  CHANNEL_TOKEN_PATTERNS.flatMap((entry) =>
    entry.tokens.flatMap((token) => token.split("_")),
  ),
);

/**
 * Derives a clean material display name from imported PBR texture filenames.
 */
export function derivePbrMaterialNameFromFiles(
  fileNames: string[],
  fallback = "Material PBR",
): string {
  for (const fileName of fileNames) {
    const tokens = tokenizeFilenameStem(fileName).filter(
      (tok) =>
        !ALL_CHANNEL_KEYWORDS.has(tok) &&
        !/^(?:1k|2k|4k|8k|512|1024|2048|4096|png|jpg|jpeg|webp|gl|dx)$/.test(tok),
    );
    if (tokens.length > 0) {
      return tokens
        .map((tok) => tok.charAt(0).toUpperCase() + tok.slice(1))
        .join(" ")
        .slice(0, 48);
    }
  }
  return fallback;
}

export async function loadPbrTextureFile(file: File): Promise<PbrImportedTexture> {
  const loaded = await loadReferenceImageFile(file);
  return {
    fileName: loaded.fileName,
    dataUrl: loaded.imageDataUrl,
    width: loaded.naturalWidth,
    height: loaded.naturalHeight,
    wasResizedForWebGL: loaded.wasResizedForWebGL,
  };
}

export function assignFilesToPbrChannels(
  loadedFiles: PbrImportedTexture[],
  existing: Partial<Record<PbrChannelId, PbrImportedTexture>> = {},
): {
  channels: Partial<Record<PbrChannelId, PbrImportedTexture>>;
  unassigned: PbrImportedTexture[];
} {
  const channels: Partial<Record<PbrChannelId, PbrImportedTexture>> = { ...existing };
  const unassigned: PbrImportedTexture[] = [];

  for (const file of loadedFiles) {
    const detected = detectPbrChannelFromFilename(file.fileName);
    if (detected && !channels[detected]) {
      channels[detected] = file;
    } else if (detected && loadedFiles.length === 1) {
      channels[detected] = file;
    } else {
      unassigned.push(file);
    }
  }

  return { channels, unassigned };
}

function findNodeTextureNameForSocket(
  graph: MaterialNodeGraph,
  principledId: string,
  channel: PbrChannelId,
): string | undefined {
  const spec = PBR_CHANNEL_SPECS[channel];
  const directLink = graph.links.find(
    (link) => link.toNodeId === principledId && link.toSocket === spec.principledSocket,
  );
  if (!directLink) return undefined;
  const sourceNode = graph.nodes.find((node) => node.id === directLink.fromNodeId);
  if (!sourceNode) return undefined;
  if (sourceNode.type === "image_texture") {
    return typeof sourceNode.values.textureName === "string"
      ? sourceNode.values.textureName
      : undefined;
  }
  if (sourceNode.type === "normal_map" || sourceNode.type === "bump") {
    const innerSocket = sourceNode.type === "normal_map" ? "color" : "height";
    const innerLink = graph.links.find(
      (link) => link.toNodeId === sourceNode.id && link.toSocket === innerSocket,
    );
    const innerNode = innerLink
      ? graph.nodes.find((node) => node.id === innerLink.fromNodeId)
      : undefined;
    if (innerNode?.type === "image_texture") {
      return typeof innerNode.values.textureName === "string"
        ? innerNode.values.textureName
        : undefined;
    }
  }
  return undefined;
}

/**
 * Reads all 6 PBR channels of a shared MaterialAsset via its evaluated nodeGraph.
 */
export function extractMaterialPbrMaps(
  material: MaterialAsset | null | undefined,
): Record<PbrChannelId, ExtractedPbrChannelStatus> {
  const empty: Record<PbrChannelId, ExtractedPbrChannelStatus> = {
    baseColor: { channel: "baseColor", spec: PBR_CHANNEL_SPECS.baseColor, loaded: false },
    roughness: { channel: "roughness", spec: PBR_CHANNEL_SPECS.roughness, loaded: false },
    metallic: { channel: "metallic", spec: PBR_CHANNEL_SPECS.metallic, loaded: false },
    normal: { channel: "normal", spec: PBR_CHANNEL_SPECS.normal, loaded: false },
    ao: { channel: "ao", spec: PBR_CHANNEL_SPECS.ao, loaded: false },
    displacement: {
      channel: "displacement",
      spec: PBR_CHANNEL_SPECS.displacement,
      loaded: false,
    },
  };
  if (!material) return empty;

  const graph = material.nodeGraph
    ? normalizeMaterialNodeGraph(material.nodeGraph, material)
    : createDefaultMaterialNodeGraph(material);
  const evaluation = evaluateMaterialNodeGraph(graph, material);
  const surface = evaluation.surface;
  const principled = graph.nodes.find((n) => n.type === "principled_bsdf");
  const principledId = principled?.id ?? "";

  const urlMap: Record<PbrChannelId, string | undefined> = {
    baseColor: surface.baseColorTextureUrl ?? material.textureDataUrl,
    roughness: surface.roughnessTextureUrl,
    metallic: surface.metallicTextureUrl,
    normal: surface.normalTextureUrl ?? surface.bumpTextureUrl,
    ao: surface.aoTextureUrl,
    displacement: surface.displacementTextureUrl,
  };

  for (const channelId of PBR_CHANNEL_IDS) {
    const dataUrl = urlMap[channelId];
    const nodeTexName = principledId
      ? findNodeTextureNameForSocket(graph, principledId, channelId)
      : undefined;
    const textureName =
      nodeTexName ||
      (channelId === "baseColor" ? surface.textureName ?? material.textureName : undefined);
    empty[channelId] = {
      channel: channelId,
      spec: PBR_CHANNEL_SPECS[channelId],
      loaded: Boolean(dataUrl),
      dataUrl,
      textureName: textureName || (dataUrl ? PBR_CHANNEL_SPECS[channelId].shortLabel : undefined),
    };
  }

  return empty;
}

const PBR_NODE_OFFSETS: Record<PbrChannelId, { x: number; y: number }> = {
  baseColor: { x: -240, y: -40 },
  metallic: { x: -240, y: 180 },
  roughness: { x: -240, y: 400 },
  normal: { x: -460, y: 620 },
  ao: { x: -240, y: 840 },
  displacement: { x: -240, y: 1060 },
};

/**
 * Updates or constructs a MaterialNodeGraph wired with the provided PBR texture maps.
 * Channels set to `undefined` keep their existing wiring; channels set to `null` are cleared.
 */
export function buildPbrMaterialNodeGraph(
  existingGraph: MaterialNodeGraph | undefined,
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
  maps: Partial<Record<PbrChannelId, PbrImportedTexture | null>>,
): MaterialNodeGraph {
  const baseGraph = existingGraph
    ? normalizeMaterialNodeGraph(existingGraph, material)
    : createDefaultMaterialNodeGraph(material);

  const nodes: MaterialNode[] = baseGraph.nodes.map((n) => ({
    ...n,
    position: { ...n.position },
    values: { ...n.values },
  }));
  let links: MaterialNodeLink[] = baseGraph.links.map((l) => ({ ...l }));

  const outputNode = nodes.find((n) => n.type === "material_output");
  const surfaceLink = outputNode
    ? links.find((l) => l.toNodeId === outputNode.id && l.toSocket === "surface")
    : undefined;
  const principled =
    (surfaceLink ? nodes.find((n) => n.id === surfaceLink.fromNodeId) : undefined) ??
    nodes.find((n) => n.type === "principled_bsdf");

  if (!principled) {
    return baseGraph;
  }

  const removeSubtreeForSocket = (socketId: string) => {
    const incoming = links.filter(
      (l) => l.toNodeId === principled.id && l.toSocket === socketId,
    );
    const removeNodeIds = new Set<string>();
    for (const link of incoming) {
      const src = nodes.find((n) => n.id === link.fromNodeId);
      if (!src) continue;
      if (src.type === "image_texture") {
        removeNodeIds.add(src.id);
      } else if (src.type === "normal_map" || src.type === "bump") {
        removeNodeIds.add(src.id);
        for (const inner of links) {
          if (inner.toNodeId === src.id) {
            const innerSrc = nodes.find((n) => n.id === inner.fromNodeId);
            if (innerSrc?.type === "image_texture") {
              removeNodeIds.add(innerSrc.id);
            }
          }
        }
      }
    }
    links = links.filter(
      (l) =>
        !(l.toNodeId === principled.id && l.toSocket === socketId) &&
        !removeNodeIds.has(l.fromNodeId) &&
        !removeNodeIds.has(l.toNodeId),
    );
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (removeNodeIds.has(nodes[i].id)) {
        nodes.splice(i, 1);
      }
    }
  };

  for (const channelId of PBR_CHANNEL_IDS) {
    if (!(channelId in maps)) continue;
    const entry = maps[channelId];
    const spec = PBR_CHANNEL_SPECS[channelId];

    if (entry === undefined) continue;

    removeSubtreeForSocket(spec.principledSocket);

    if (entry === null) {
      continue;
    }

    const imageNodeId = `${principled.id}:pbr:${channelId}`;
    const offset = PBR_NODE_OFFSETS[channelId];
    const imageNode: MaterialNode = {
      id: imageNodeId,
      type: "image_texture",
      label: spec.shortLabel,
      position: {
        x: principled.position.x + offset.x,
        y: principled.position.y + offset.y,
      },
      values: {
        dataUrl: entry.dataUrl,
        textureName: entry.fileName,
        textureSlot: channelId,
        colorSpace: spec.colorSpace,
      },
    };
    nodes.push(imageNode);

    if (channelId === "normal") {
      const normalMapId = `${principled.id}:pbr:normal_map`;
      nodes.push({
        id: normalMapId,
        type: "normal_map",
        position: {
          x: principled.position.x - 190,
          y: principled.position.y + offset.y,
        },
        values: {
          strength: 1,
        },
      });
      links.push(
        {
          id: `${imageNodeId}->${normalMapId}:color`,
          fromNodeId: imageNodeId,
          fromSocket: "color",
          toNodeId: normalMapId,
          toSocket: "color",
        },
        {
          id: `${normalMapId}->${principled.id}:normal`,
          fromNodeId: normalMapId,
          fromSocket: "normal",
          toNodeId: principled.id,
          toSocket: "normal",
        },
      );
    } else {
      const fromSocket = spec.principledSocket === "baseColor" ? "color" : "alpha";
      links.push({
        id: `${imageNodeId}->${principled.id}:${spec.principledSocket}`,
        fromNodeId: imageNodeId,
        fromSocket,
        toNodeId: principled.id,
        toSocket: spec.principledSocket,
      });

      if (channelId === "baseColor") {
        principled.values.baseColor = "#ffffff";
      } else if (channelId === "roughness") {
        principled.values.roughness = 1;
      } else if (channelId === "metallic") {
        principled.values.metallic = 1;
      } else if (channelId === "ao") {
        principled.values.ao = 1;
      } else if (channelId === "displacement") {
        principled.values.displacement = 0.04;
      }
    }
  }

  return {
    version: 1,
    nodes,
    links,
  };
}

/**
 * Builds a complete shared MaterialAsset payload ready for `createMaterial` or `updateMaterial`.
 */
export function buildPbrMaterialPayload(
  existingMaterial: MaterialAsset | null | undefined,
  materialName: string,
  maps: Partial<Record<PbrChannelId, PbrImportedTexture | null>>,
): Omit<MaterialAsset, "id"> {
  const seedId = existingMaterial?.id ?? "mat_pbr_seed";
  const baseColorFallback =
    maps.baseColor && maps.baseColor !== null
      ? "#ffffff"
      : existingMaterial?.baseColor ?? "#9aa0a6";
  const roughnessFallback =
    maps.roughness && maps.roughness !== null
      ? 1
      : existingMaterial?.roughness ?? 0.55;
  const metallicFallback =
    maps.metallic && maps.metallic !== null
      ? 1
      : existingMaterial?.metallic ?? 0;

  const seedMaterial: MaterialAsset = {
    id: seedId,
    name: materialName.trim() || existingMaterial?.name || "Material PBR",
    baseColor: baseColorFallback,
    metallic: metallicFallback,
    roughness: roughnessFallback,
    opacity: existingMaterial?.opacity ?? 1,
    emissiveColor: existingMaterial?.emissiveColor ?? "#000000",
    emissiveIntensity: existingMaterial?.emissiveIntensity ?? 0,
    textureName:
      maps.baseColor === null
        ? ""
        : maps.baseColor?.fileName ?? existingMaterial?.textureName,
    textureDataUrl:
      maps.baseColor === null
        ? ""
        : maps.baseColor?.dataUrl ?? existingMaterial?.textureDataUrl,
    nodeGraph: existingMaterial?.nodeGraph,
  };

  const nodeGraph = buildPbrMaterialNodeGraph(
    existingMaterial?.nodeGraph,
    seedMaterial,
    maps,
  );
  const evaluation = evaluateMaterialNodeGraph(nodeGraph, seedMaterial);

  return {
    name: seedMaterial.name,
    baseColor: evaluation.surface.baseColor,
    metallic: evaluation.surface.metallic,
    roughness: evaluation.surface.roughness,
    opacity: evaluation.surface.opacity,
    emissiveColor: evaluation.surface.emissionColor,
    emissiveIntensity: evaluation.surface.emissionIntensity,
    textureName: evaluation.surface.textureName ?? "",
    textureDataUrl: evaluation.surface.baseColorTextureUrl ?? "",
    nodeGraph,
  };
}
