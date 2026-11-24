import { describe, expect, it } from "vitest";
import { createCubeMesh } from "../mesh/primitives";
import {
  createMaterialAsset,
  normalizeProjectHierarchy,
} from "../project/hierarchy";
import { createNewProject } from "../project/storage";
import { evaluateMaterialNodeGraph } from "./nodeGraph";
import {
  assignFilesToPbrChannels,
  buildPbrMaterialPayload,
  derivePbrMaterialNameFromFiles,
  detectPbrChannelFromFilename,
  extractMaterialPbrMaps,
  PBR_CHANNEL_SPECS,
} from "./pbrImport";

const PNG_1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPG_2 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";
const WEBP_3 = "data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=";

describe("PBR material import & shared CORE persistence", () => {
  it("detects all 6 PBR channels from common English and Spanish filenames", () => {
    expect(detectPbrChannelFromFilename("brick_wall_albedo_2k.png")).toBe("baseColor");
    expect(detectPbrChannelFromFilename("Wood_BaseColor.jpg")).toBe("baseColor");
    expect(detectPbrChannelFromFilename("stone_roughness.png")).toBe("roughness");
    expect(detectPbrChannelFromFilename("suelo_rugosidad.png")).toBe("roughness");
    expect(detectPbrChannelFromFilename("steel_metallic.png")).toBe("metallic");
    expect(detectPbrChannelFromFilename("iron_metalness.webp")).toBe("metallic");
    expect(detectPbrChannelFromFilename("brick_NormalGL.png")).toBe("normal");
    expect(detectPbrChannelFromFilename("rock_nrm.jpg")).toBe("normal");
    expect(detectPbrChannelFromFilename("wall_AO.png")).toBe("ao");
    expect(detectPbrChannelFromFilename("plaster_ambient_occlusion.png")).toBe("ao");
    expect(detectPbrChannelFromFilename("cobble_displacement.png")).toBe("displacement");
    expect(detectPbrChannelFromFilename("terrain_height.jpg")).toBe("displacement");
    expect(detectPbrChannelFromFilename("custom_mystery_map.png")).toBeNull();
  });

  it("assigns multiple PBR files automatically and queues unrecognized ones for manual assignment", () => {
    const result = assignFilesToPbrChannels([
      { fileName: "rust_albedo.png", dataUrl: PNG_1 },
      { fileName: "rust_roughness.png", dataUrl: PNG_1 },
      { fileName: "mystery.png", dataUrl: JPG_2 },
    ]);

    expect(result.channels.baseColor?.fileName).toBe("rust_albedo.png");
    expect(result.channels.roughness?.fileName).toBe("rust_roughness.png");
    expect(result.channels.metallic).toBeUndefined();
    expect(result.unassigned).toHaveLength(1);
    expect(result.unassigned[0].fileName).toBe("mystery.png");
    expect(derivePbrMaterialNameFromFiles(["rust_albedo.png"])).toBe("Rust");
  });

  it("keeps strict sRGB vs linear color-space metadata across all 6 channels", () => {
    expect(PBR_CHANNEL_SPECS.baseColor.colorSpace).toBe("srgb");
    expect(PBR_CHANNEL_SPECS.roughness.colorSpace).toBe("linear");
    expect(PBR_CHANNEL_SPECS.metallic.colorSpace).toBe("linear");
    expect(PBR_CHANNEL_SPECS.normal.colorSpace).toBe("linear");
    expect(PBR_CHANNEL_SPECS.ao.colorSpace).toBe("linear");
    expect(PBR_CHANNEL_SPECS.displacement.colorSpace).toBe("linear");
  });

  it("evaluates a complete 6-map PBR set and preserves all maps across project JSON save/reload", () => {
    const payload = buildPbrMaterialPayload(null, "Acero PBR", {
      baseColor: { fileName: "steel_albedo.webp", dataUrl: WEBP_3 },
      roughness: { fileName: "steel_rough.png", dataUrl: PNG_1 },
      metallic: { fileName: "steel_metal.png", dataUrl: PNG_1 },
      normal: { fileName: "steel_normal.jpg", dataUrl: JPG_2 },
      ao: { fileName: "steel_ao.png", dataUrl: PNG_1 },
      displacement: { fileName: "steel_height.png", dataUrl: PNG_1 },
    });

    const pbrMat = createMaterialAsset({ id: "mat_pbr_1", ...payload });
    const evalRes = evaluateMaterialNodeGraph(pbrMat.nodeGraph!, pbrMat);
    expect(evalRes.ok).toBe(true);
    expect(evalRes.errors).toEqual([]);
    expect(evalRes.surface.baseColorTextureUrl).toBe(WEBP_3);
    expect(evalRes.surface.roughnessTextureUrl).toBe(PNG_1);
    expect(evalRes.surface.metallicTextureUrl).toBe(PNG_1);
    expect(evalRes.surface.normalTextureUrl).toBe(JPG_2);
    expect(evalRes.surface.aoTextureUrl).toBe(PNG_1);
    expect(evalRes.surface.displacementTextureUrl).toBe(PNG_1);

    // Save & reopen project round-trip preserving material, PBR maps, and face slots
    const project = createNewProject("Proyecto PBR", "cube");
    const cubeObj = project.scenes[0].objects[0];
    const editable = createCubeMesh();
    editable.faces[0].materialId = pbrMat.id;
    cubeObj.mesh = editable.toJSON();
    project.materials = [project.materials![0], pbrMat];

    const serialized = JSON.parse(JSON.stringify(project));
    const reopened = normalizeProjectHierarchy(serialized);
    expect(reopened).not.toBeNull();

    const reopenedMat = reopened!.materials!.find((m) => m.id === pbrMat.id)!;
    expect(reopenedMat).toBeDefined();
    const extracted = extractMaterialPbrMaps(reopenedMat);
    expect(extracted.baseColor).toMatchObject({ loaded: true, dataUrl: WEBP_3 });
    expect(extracted.roughness).toMatchObject({ loaded: true, dataUrl: PNG_1 });
    expect(extracted.metallic).toMatchObject({ loaded: true, dataUrl: PNG_1 });
    expect(extracted.normal).toMatchObject({ loaded: true, dataUrl: JPG_2 });
    expect(extracted.ao).toMatchObject({ loaded: true, dataUrl: PNG_1 });
    expect(extracted.displacement).toMatchObject({ loaded: true, dataUrl: PNG_1 });
    expect(reopened!.scenes[0].objects[0].mesh.faces[0].materialId).toBe(pbrMat.id);
  });

  it("handles incomplete PBR sets cleanly without crashes or errors", () => {
    const partialPayload = buildPbrMaterialPayload(null, "Solo Roughness y Normal", {
      roughness: { fileName: "rough.png", dataUrl: PNG_1 },
      normal: { fileName: "normal.png", dataUrl: JPG_2 },
    });

    const partialMat = createMaterialAsset({ id: "mat_partial", ...partialPayload });
    const evalRes = evaluateMaterialNodeGraph(partialMat.nodeGraph!, partialMat);
    expect(evalRes.ok).toBe(true);
    expect(evalRes.surface.baseColorTextureUrl).toBeUndefined();
    expect(evalRes.surface.roughnessTextureUrl).toBe(PNG_1);
    expect(evalRes.surface.normalTextureUrl).toBe(JPG_2);
    expect(evalRes.surface.aoTextureUrl).toBeUndefined();

    const extracted = extractMaterialPbrMaps(partialMat);
    expect(extracted.baseColor.loaded).toBe(false);
    expect(extracted.roughness.loaded).toBe(true);
    expect(extracted.normal.loaded).toBe(true);
    expect(extracted.metallic.loaded).toBe(false);
    expect(extracted.ao.loaded).toBe(false);
    expect(extracted.displacement.loaded).toBe(false);
  });
});
