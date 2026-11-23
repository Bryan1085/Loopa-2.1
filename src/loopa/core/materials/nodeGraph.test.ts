import { describe, expect, it } from "vitest";
import { createMaterialAsset } from "../project/hierarchy";
import {
  connectMaterialNodeSockets,
  createDefaultMaterialNodeGraph,
  evaluateMaterialNodeGraph,
  normalizeMaterialGraphBaseTextureReference,
  normalizeMaterialNodeGraph,
  syncMaterialFieldsToNodeGraph,
  validateMaterialNodeGraph,
} from "./nodeGraph";

describe("material node graph", () => {
  it("creates a connected Principled-to-Output graph for existing materials", () => {
    const material = createMaterialAsset({
      id: "material-test",
      baseColor: "#123456",
      metallic: 0.3,
      roughness: 0.7,
    });
    const graph = createDefaultMaterialNodeGraph(material);

    expect(graph.nodes.map((node) => node.type)).toEqual(["principled_bsdf", "material_output"]);
    expect(graph.links).toHaveLength(1);
    expect(evaluateMaterialNodeGraph(graph, material)).toMatchObject({
      ok: true,
      surface: {
        baseColor: "#123456",
        metallic: 0.3,
        roughness: 0.7,
      },
    });
  });

  it("migrates existing base textures into an Image Texture node", () => {
    const imageDataUrl = "data:image/png;base64,aGVsbG8=";
    const material = createMaterialAsset({
      id: "material-legacy-texture",
      textureName: "legacy.png",
      textureDataUrl: imageDataUrl,
    });

    expect(material.nodeGraph?.nodes).toContainEqual(
      expect.objectContaining({
        type: "image_texture",
        values: expect.objectContaining({ textureSlot: "baseColor" }),
      }),
    );
    expect(
      evaluateMaterialNodeGraph(material.nodeGraph!, material).surface.baseColorTextureUrl,
    ).toBe(imageDataUrl);
  });

  it("allows a graph edit to disconnect a migrated image texture", () => {
    const material = createMaterialAsset({
      id: "material-disconnect-texture",
      textureName: "base.png",
      textureDataUrl: "data:image/png;base64,aGVsbG8=",
    });
    const graph = material.nodeGraph!;
    const imageNode = graph.nodes.find((node) => node.type === "image_texture")!;
    graph.nodes = graph.nodes.filter((node) => node.id !== imageNode.id);
    graph.links = graph.links.filter((link) => link.fromNodeId !== imageNode.id);

    const normalized = createMaterialAsset({ ...material, nodeGraph: graph });
    expect(normalized.nodeGraph?.nodes).not.toContainEqual(
      expect.objectContaining({ type: "image_texture" }),
    );
    expect(
      evaluateMaterialNodeGraph(normalized.nodeGraph!, normalized).surface.baseColorTextureUrl,
    ).toBeUndefined();
  });

  it("stores a migrated base texture once and keeps its graph reference", () => {
    const material = createMaterialAsset({
      id: "material-base-reference",
      textureName: "base.png",
      textureDataUrl: "data:image/png;base64,aGVsbG8=",
    });
    const graph = material.nodeGraph!;
    const normalized = normalizeMaterialGraphBaseTextureReference(graph, material.textureDataUrl);
    const imageNode = normalized.nodes.find((node) => node.type === "image_texture")!;

    expect(imageNode.values).toEqual({ textureSlot: "baseColor" });
    expect(evaluateMaterialNodeGraph(normalized, material).surface.baseColorTextureUrl).toBe(
      material.textureDataUrl,
    );
  });

  it("keeps the existing flat property controls synchronized with the graph", () => {
    const material = createMaterialAsset({ id: "material-properties" });
    const graph = syncMaterialFieldsToNodeGraph(
      material.nodeGraph!,
      { ...material, baseColor: "#abcdef" },
      ["baseColor"],
    );

    expect(evaluateMaterialNodeGraph(graph, material).surface.baseColor).toBe("#abcdef");
  });

  it("evaluates a connected Math node into a Principled input", () => {
    const material = createMaterialAsset({ id: "material-math" });
    const graph = createDefaultMaterialNodeGraph(material);
    const principled = graph.nodes.find((node) => node.type === "principled_bsdf")!;
    graph.nodes.push({
      id: "math-multiply",
      type: "math",
      position: { x: 300, y: 300 },
      values: { operation: "multiply", a: 0.5, b: 0.4 },
    });
    graph.links.push({
      id: "math-metallic",
      fromNodeId: "math-multiply",
      fromSocket: "value",
      toNodeId: principled.id,
      toSocket: "metallic",
    });

    expect(evaluateMaterialNodeGraph(graph, material).surface.metallic).toBe(0.2);
  });

  it("evaluates a Mix Color node into a Principled color input", () => {
    const material = createMaterialAsset({ id: "material-mix" });
    const graph = createDefaultMaterialNodeGraph(material);
    const principled = graph.nodes.find((node) => node.type === "principled_bsdf")!;
    graph.nodes.push({
      id: "mix",
      type: "mix_color",
      position: { x: 300, y: 300 },
      values: {
        factor: 0.5,
        colorA: "#000000",
        colorB: "#ffffff",
      },
    });
    graph.links.push({
      id: "mix-base-color",
      fromNodeId: "mix",
      fromSocket: "color",
      toNodeId: principled.id,
      toSocket: "baseColor",
    });

    expect(evaluateMaterialNodeGraph(graph, material).surface.baseColor).toBe("#808080");
  });

  it("evaluates an image texture and UV mapping for the base color", () => {
    const material = createMaterialAsset({ id: "material-image" });
    const graph = createDefaultMaterialNodeGraph(material);
    const principled = graph.nodes.find((node) => node.type === "principled_bsdf")!;
    const imageDataUrl = "data:image/png;base64,aGVsbG8=";
    graph.nodes.push(
      {
        id: "image",
        type: "image_texture",
        position: { x: 0, y: 0 },
        values: { dataUrl: imageDataUrl, textureName: "base.png" },
      },
      {
        id: "uv",
        type: "texture_coordinate",
        position: { x: 0, y: 100 },
        values: {},
      },
      {
        id: "mapping",
        type: "mapping",
        position: { x: 100, y: 100 },
        values: {
          location: [0.2, 0.3, 0],
          rotation: [0, 0, 0.5],
          scale: [2, 3, 1],
        },
      },
    );
    graph.links.push(
      {
        id: "image-base-color",
        fromNodeId: "image",
        fromSocket: "color",
        toNodeId: principled.id,
        toSocket: "baseColor",
      },
      {
        id: "uv-mapping",
        fromNodeId: "uv",
        fromSocket: "uv",
        toNodeId: "mapping",
        toSocket: "vector",
      },
      {
        id: "mapping-image",
        fromNodeId: "mapping",
        fromSocket: "vector",
        toNodeId: "image",
        toSocket: "vector",
      },
    );

    expect(evaluateMaterialNodeGraph(graph, material)).toMatchObject({
      ok: true,
      surface: {
        baseColorTextureUrl: imageDataUrl,
        textureName: "base.png",
        textureTransform: {
          location: [0.2, 0.3, 0],
          rotation: [0, 0, 0.5],
          scale: [2, 3, 1],
        },
      },
    });
  });

  it("evaluates multi-stop ramps and Mix Float operations", () => {
    const material = createMaterialAsset({ id: "material-color-nodes" });
    const graph = createDefaultMaterialNodeGraph(material);
    const principled = graph.nodes.find((node) => node.type === "principled_bsdf")!;
    graph.nodes.push(
      {
        id: "ramp",
        type: "color_ramp",
        position: { x: 100, y: 200 },
        values: {
          factor: 0.25,
          interpolation: "linear",
          stops: [
            { position: 0, color: "#000000" },
            { position: 0.5, color: "#ff0000" },
            { position: 1, color: "#ffffff" },
          ],
        },
      },
      {
        id: "mix-float",
        type: "mix_float",
        position: { x: 300, y: 300 },
        values: { operation: "add", factor: 0.5, a: 0.2, b: 0.8 },
      },
    );
    graph.links.push(
      {
        id: "ramp-color",
        fromNodeId: "ramp",
        fromSocket: "color",
        toNodeId: principled.id,
        toSocket: "baseColor",
      },
      {
        id: "float-metallic",
        fromNodeId: "mix-float",
        fromSocket: "value",
        toNodeId: principled.id,
        toSocket: "metallic",
      },
    );

    const evaluated = evaluateMaterialNodeGraph(graph, material);
    expect(evaluated).toMatchObject({
      ok: true,
      surface: { baseColor: "#800000" },
    });
    expect(evaluated.surface.metallic).toBeCloseTo(0.6);

    const ramp = graph.nodes.find((node) => node.id === "ramp")!;
    ramp.values.interpolation = "constant";
    expect(evaluateMaterialNodeGraph(graph, material).surface.baseColor).toBe("#000000");
  });

  it("evaluates Transform values and retains added nodes through graph normalization", () => {
    const material = createMaterialAsset({ id: "material-transform-node" });
    const graph = createDefaultMaterialNodeGraph(material);
    const principled = graph.nodes.find((node) => node.type === "principled_bsdf")!;
    const textureUrl = "data:image/png;base64,aGVsbG8=";
    graph.nodes.push(
      {
        id: "uv",
        type: "texture_coordinate",
        position: { x: 0, y: 0 },
        values: {},
      },
      {
        id: "transform",
        type: "transform",
        position: { x: 120, y: 0 },
        values: {
          location: [0.2, 0.3, 0],
          rotation: [0, 0, 90],
          scale: [2, 3, 1],
        },
      },
      {
        id: "image",
        type: "image_texture",
        position: { x: 360, y: 0 },
        values: { dataUrl: textureUrl, textureName: "mapped.png" },
      },
    );
    graph.links.push(
      {
        id: "uv-transform",
        fromNodeId: "uv",
        fromSocket: "uv",
        toNodeId: "transform",
        toSocket: "vector",
      },
      {
        id: "transform-image",
        fromNodeId: "transform",
        fromSocket: "vector",
        toNodeId: "image",
        toSocket: "vector",
      },
      {
        id: "image-color",
        fromNodeId: "image",
        fromSocket: "color",
        toNodeId: principled.id,
        toSocket: "baseColor",
      },
    );

    expect(evaluateMaterialNodeGraph(graph, material)).toMatchObject({
      ok: true,
      surface: {
        baseColorTextureUrl: textureUrl,
        textureTransform: {
          location: [0.2, 0.3, 0],
          rotation: [0, 0, Math.PI / 2],
          scale: [2, 3, 1],
        },
      },
    });

    const normalized = normalizeMaterialNodeGraph(graph, material);
    expect(normalized.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "transform" }),
        expect.objectContaining({ type: "texture_coordinate" }),
        expect.objectContaining({ type: "image_texture" }),
      ]),
    );
    expect(normalized.links).toHaveLength(graph.links.length);
  });

  it("validates connections using socket data types", () => {
    const material = createMaterialAsset({ id: "material-socket-types" });
    const graph = createDefaultMaterialNodeGraph(material);
    const principled = graph.nodes.find((node) => node.type === "principled_bsdf")!;
    graph.nodes.push(
      {
        id: "integer",
        type: "value_integer",
        position: { x: 0, y: 0 },
        values: { value: 1 },
      },
      {
        id: "color",
        type: "value_color",
        position: { x: 0, y: 100 },
        values: { value: "#123456" },
      },
      {
        id: "boolean",
        type: "value_boolean",
        position: { x: 0, y: 200 },
        values: { value: true },
      },
    );

    expect(
      connectMaterialNodeSockets(graph, "integer", "value", principled.id, "metallic")?.links,
    ).toContainEqual(
      expect.objectContaining({
        fromNodeId: "integer",
        toNodeId: principled.id,
        toSocket: "metallic",
      }),
    );
    expect(
      connectMaterialNodeSockets(graph, "integer", "value", principled.id, "baseColor"),
    ).toBeNull();
    expect(
      connectMaterialNodeSockets(graph, "color", "color", principled.id, "metallic"),
    ).toBeNull();
    expect(
      connectMaterialNodeSockets(graph, "boolean", "value", principled.id, "metallic"),
    ).not.toBeNull();
  });

  it("evaluates normal and bump map connections", () => {
    const material = createMaterialAsset({ id: "material-maps" });
    const graph = createDefaultMaterialNodeGraph(material);
    const principled = graph.nodes.find((node) => node.type === "principled_bsdf")!;
    const imageDataUrl = "data:image/png;base64,aGVsbG8=";
    graph.nodes.push(
      {
        id: "normal-image",
        type: "image_texture",
        position: { x: 0, y: 0 },
        values: { dataUrl: imageDataUrl },
      },
      {
        id: "normal",
        type: "normal_map",
        position: { x: 100, y: 0 },
        values: { strength: 0.7 },
      },
      {
        id: "height-image",
        type: "image_texture",
        position: { x: 0, y: 200 },
        values: { dataUrl: imageDataUrl },
      },
      {
        id: "bump",
        type: "bump",
        position: { x: 100, y: 200 },
        values: { strength: 0.8, distance: 0.5 },
      },
    );
    graph.links.push(
      {
        id: "image-normal",
        fromNodeId: "normal-image",
        fromSocket: "color",
        toNodeId: "normal",
        toSocket: "color",
      },
      {
        id: "normal-surface",
        fromNodeId: "normal",
        fromSocket: "normal",
        toNodeId: principled.id,
        toSocket: "normal",
      },
    );
    expect(evaluateMaterialNodeGraph(graph, material)).toMatchObject({
      ok: true,
      surface: { normalTextureUrl: imageDataUrl },
    });

    graph.links = graph.links.filter(
      (link) => link.toNodeId !== principled.id || link.toSocket !== "normal",
    );
    graph.links.push(
      {
        id: "height-bump",
        fromNodeId: "height-image",
        fromSocket: "alpha",
        toNodeId: "bump",
        toSocket: "height",
      },
      {
        id: "bump-surface",
        fromNodeId: "bump",
        fromSocket: "normal",
        toNodeId: principled.id,
        toSocket: "normal",
      },
    );

    expect(evaluateMaterialNodeGraph(graph, material)).toMatchObject({
      ok: true,
      surface: {
        bumpTextureUrl: imageDataUrl,
        bumpScale: 0.4,
      },
    });
  });

  it("rejects cycles and normalizes legacy materials to a default graph", () => {
    const material = createMaterialAsset({ id: "material-cycle" });
    const graph = createDefaultMaterialNodeGraph(material);
    graph.nodes.push(
      {
        id: "math-a",
        type: "math",
        position: { x: 0, y: 0 },
        values: {},
      },
      {
        id: "math-b",
        type: "math",
        position: { x: 0, y: 100 },
        values: {},
      },
    );
    graph.links.push(
      {
        id: "cycle-a",
        fromNodeId: "math-a",
        fromSocket: "value",
        toNodeId: "math-b",
        toSocket: "a",
      },
      {
        id: "cycle-b",
        fromNodeId: "math-b",
        fromSocket: "value",
        toNodeId: "math-a",
        toSocket: "a",
      },
    );

    expect(validateMaterialNodeGraph(graph)).toContain(
      "El grafo contiene un ciclo y no se puede evaluar.",
    );
    expect(normalizeMaterialNodeGraph(undefined, material).nodes).toHaveLength(2);
  });

  it("preserves node collapsed state across normalization", () => {
    const material = createMaterialAsset({ id: "material-collapse-norm" });
    const graph = createDefaultMaterialNodeGraph(material);
    graph.nodes[0].collapsed = true;

    const normalized = normalizeMaterialNodeGraph(graph, material);
    expect(normalized.nodes[0].collapsed).toBe(true);
    expect(normalized.nodes[1].collapsed).toBeUndefined();
  });

  it("evaluates procedural Noise Texture into Base Color, Color Ramp, Roughness, and Bump maps", () => {
    const material = createMaterialAsset({ id: "material-noise" });
    const graph = createDefaultMaterialNodeGraph(material);
    const principled = graph.nodes.find((node) => node.type === "principled_bsdf")!;

    graph.nodes.push(
      {
        id: "texcoord",
        type: "texture_coordinate",
        position: { x: -200, y: 0 },
        values: {},
      },
      {
        id: "noise",
        type: "noise_texture",
        position: { x: 0, y: 0 },
        values: {
          dimensions: "4D",
          w: 0.4,
          scale: 6,
          detail: 3.5,
          roughness: 0.55,
          lacunarity: 2.1,
          offset: 0,
          distortion: 0.4,
          normalize: true,
        },
      },
      {
        id: "ramp",
        type: "color_ramp",
        position: { x: 180, y: 0 },
        values: {
          factor: 0.5,
          interpolation: "linear",
          stops: [
            { position: 0.2, color: "#102030", alpha: 1 },
            { position: 0.8, color: "#f0d040", alpha: 1 },
          ],
        },
      },
      {
        id: "bump",
        type: "bump",
        position: { x: 180, y: 180 },
        values: { strength: 0.75, distance: 0.4 },
      },
    );

    graph.links.push(
      {
        id: "coord-noise",
        fromNodeId: "texcoord",
        fromSocket: "generated",
        toNodeId: "noise",
        toSocket: "vector",
      },
      {
        id: "noise-ramp",
        fromNodeId: "noise",
        fromSocket: "factor",
        toNodeId: "ramp",
        toSocket: "factor",
      },
      {
        id: "ramp-base",
        fromNodeId: "ramp",
        fromSocket: "color",
        toNodeId: principled.id,
        toSocket: "baseColor",
      },
      {
        id: "noise-roughness",
        fromNodeId: "noise",
        fromSocket: "factor",
        toNodeId: principled.id,
        toSocket: "roughness",
      },
      {
        id: "noise-bump",
        fromNodeId: "noise",
        fromSocket: "factor",
        toNodeId: "bump",
        toSocket: "height",
      },
      {
        id: "bump-normal",
        fromNodeId: "bump",
        fromSocket: "normal",
        toNodeId: principled.id,
        toSocket: "normal",
      },
    );

    const eval1 = evaluateMaterialNodeGraph(graph, material);
    expect(eval1.ok).toBe(true);
    expect(eval1.surface.baseColorTextureUrl).toMatch(/^data:image\/png;base64,/);
    expect(eval1.surface.roughnessTextureUrl).toMatch(/^data:image\/png;base64,/);
    expect(eval1.surface.bumpTextureUrl).toMatch(/^data:image\/png;base64,/);
    expect(eval1.surface.bumpScale).toBeCloseTo(0.3);

    // Changing Noise scale regenerates a distinct procedural PNG texture
    const noiseNode = graph.nodes.find((n) => n.id === "noise")!;
    noiseNode.values.scale = 14;
    const eval2 = evaluateMaterialNodeGraph(graph, material);
    expect(eval2.surface.baseColorTextureUrl).not.toBe(eval1.surface.baseColorTextureUrl);
    expect(eval2.surface.roughnessTextureUrl).not.toBe(eval1.surface.roughnessTextureUrl);
    expect(eval2.surface.bumpTextureUrl).not.toBe(eval1.surface.bumpTextureUrl);

    const normalized = normalizeMaterialNodeGraph(graph, material);
    expect(normalized.nodes.find((n) => n.id === "noise")?.values).toMatchObject({
      dimensions: "4D",
      scale: 14,
      distortion: 0.4,
    });
  });

  it("evaluates procedural Voronoi Texture across features and distance metrics", () => {
    const material = createMaterialAsset({ id: "material-voronoi" });
    const graph = createDefaultMaterialNodeGraph(material);
    const principled = graph.nodes.find((node) => node.type === "principled_bsdf")!;

    graph.nodes.push({
      id: "voronoi",
      type: "voronoi_texture",
      position: { x: 0, y: 0 },
      values: {
        dimensions: "3D",
        feature: "f1",
        distanceMetric: "euclidean",
        w: 0,
        scale: 5,
        detail: 1.5,
        roughness: 0.5,
        lacunarity: 2,
        smoothness: 0.5,
        exponent: 1.5,
        randomness: 1,
        normalize: true,
      },
    });
    graph.links.push(
      {
        id: "voronoi-color",
        fromNodeId: "voronoi",
        fromSocket: "color",
        toNodeId: principled.id,
        toSocket: "baseColor",
      },
      {
        id: "voronoi-rough",
        fromNodeId: "voronoi",
        fromSocket: "distance",
        toNodeId: principled.id,
        toSocket: "roughness",
      },
    );

    const evalEuclideanF1 = evaluateMaterialNodeGraph(graph, material);
    expect(evalEuclideanF1.ok).toBe(true);
    expect(evalEuclideanF1.surface.baseColorTextureUrl).toMatch(/^data:image\/png;base64,/);
    expect(evalEuclideanF1.surface.roughnessTextureUrl).toMatch(/^data:image\/png;base64,/);

    const voronoiNode = graph.nodes.find((n) => n.id === "voronoi")!;
    voronoiNode.values.feature = "distance_to_edge";
    voronoiNode.values.distanceMetric = "minkowski";
    const evalEdge = evaluateMaterialNodeGraph(graph, material);
    expect(evalEdge.ok).toBe(true);
    expect(evalEdge.surface.roughnessTextureUrl).not.toBe(
      evalEuclideanF1.surface.roughnessTextureUrl,
    );
  });
});
