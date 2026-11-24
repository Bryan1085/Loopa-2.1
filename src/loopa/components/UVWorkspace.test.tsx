import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createCubeMesh } from "../core/mesh/primitives";
import { createMaterialAsset } from "../core/project/hierarchy";
import { buildPbrMaterialPayload } from "../core/materials/pbrImport";
import { useModelerStore } from "../state/useModelerStore";
import { UVWorkspace } from "./UVWorkspace";

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const TEST_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TEST_PNG_DATA_URL_2 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

// Mock UVSync3DViewport so jsdom tests do not require a WebGL context while
// still capturing the exact multi-material & PBR props passed to the 3D viewport.
const sync3DPropsSpy = vi.fn();
vi.mock("./UVSync3DViewport", () => ({
  UVSync3DViewport: React.forwardRef((props: any, _ref) => {
    sync3DPropsSpy(props);
    return (
      <div
        data-testid="mock-uv-sync-3d"
        data-active-material={props.activeMaterialId ?? ""}
        data-preview-unassigned={String(Boolean(props.previewUnassignedMaterial))}
        data-materials-count={String(props.materials?.length ?? 0)}
      />
    );
  }),
}));

vi.mock("../core/materials/pbrImport", async () => {
  const actual = await vi.importActual<typeof import("../core/materials/pbrImport")>(
    "../core/materials/pbrImport",
  );
  return {
    ...actual,
    loadPbrTextureFile: vi.fn(async (file: File) => ({
      fileName: file.name,
      dataUrl: file.name.includes("rough") ? TEST_PNG_DATA_URL_2 : TEST_PNG_DATA_URL,
      width: 1024,
      height: 1024,
      wasResizedForWebGL: false,
    })),
  };
});

describe("UVWorkspace & LOOPA UVs improvements", () => {
  it("renders a safe empty state when no mesh object is selected", () => {
    render(
      <UVWorkspace
        toolbarVisible={true}
        workMode="edit"
        mesh={null}
      />,
    );

    expect(screen.getByText("Ningún objeto de malla seleccionado")).toBeInTheDocument();
  });

  it("opens in Edit Mode automatically via store.enterAppWorkMode('uvs') without changing Modeler or Sculpt defaults", () => {
    const { result } = renderHook(() => useModelerStore());

    // Modeler starts in Object Mode by default
    expect(result.current.workMode).toBe("object");

    // Entering UVs activates Edit Mode automatically on a valid mesh
    act(() => {
      const ok = result.current.enterAppWorkMode("uvs");
      expect(ok).toBe(true);
    });
    expect(result.current.workMode).toBe("edit");

    // Manual toggle back to Object Mode works inside UVs
    act(() => {
      result.current.toggleWorkMode("object");
    });
    expect(result.current.workMode).toBe("object");

    // Sculpt still enters 'sculpt' independently
    act(() => {
      const ok = result.current.enterAppWorkMode("sculpt");
      expect(ok).toBe(true);
    });
    expect(result.current.workMode).toBe("sculpt");

    // Returning to Modeler exits 'sculpt' to 'object'
    act(() => {
      result.current.enterAppWorkMode("modeler");
    });
    expect(result.current.workMode).toBe("object");
  });

  it("lists shared LOOPA Materials, handles multi-material zones without overwriting assignments, and updates 2D/3D previews", () => {
    sync3DPropsSpy.mockClear();
    const cube = createCubeMesh();
    const matA = createMaterialAsset({
      id: "mat-a",
      name: "Madera PBR",
      ...buildPbrMaterialPayload(null, "Madera PBR", {
        baseColor: { fileName: "wood_albedo.png", dataUrl: TEST_PNG_DATA_URL },
        roughness: { fileName: "wood_roughness.png", dataUrl: TEST_PNG_DATA_URL_2 },
      }),
    });
    const matB = createMaterialAsset({
      id: "mat-b",
      name: "Metal Cobre",
      baseColor: "#b87333",
      metallic: 0.9,
      roughness: 0.25,
    });
    const matLibraryOnly = createMaterialAsset({
      id: "mat-c",
      name: "Mármol Librería",
      baseColor: "#e5e7eb",
    });

    // Assign 2 faces to matB while leaving remaining faces on primary matA
    cube.faces[0].materialId = matB.id;
    cube.faces[1].materialId = matB.id;

    const onSelectFacesByMaterial = vi.fn();
    const onAssignMaterialToFaces = vi.fn();

    render(
      <UVWorkspace
        toolbarVisible={true}
        workMode="edit"
        objectId="obj-cube"
        objectName="Cubo Multi"
        mesh={cube}
        materialAsset={matA}
        materials={[matA, matB, matLibraryOnly]}
        objectPrimaryMaterialId={matA.id}
        onUpdateMaterial={vi.fn()}
        onSelectFacesByMaterial={onSelectFacesByMaterial}
        onAssignMaterialToFaces={onAssignMaterialToFaces}
      />,
    );

    const selector = screen.getByTestId("uv-material-selector") as HTMLSelectElement;
    expect(selector.value).toBe(matA.id);
    expect(screen.getByText(/2 zonas/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Madera PBR \(Principal · 4 caras\)/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Metal Cobre \(2 caras\)/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Mármol Librería" })).toBeInTheDocument();

    // Can switch which loaded PBR channel is displayed in the 2D UV canvas
    const channel2dSelect = screen.getByTestId("uv-2d-texture-channel") as HTMLSelectElement;
    expect(channel2dSelect.value).toBe("auto");
    fireEvent.change(channel2dSelect, { target: { value: "roughness" } });
    expect(channel2dSelect.value).toBe("roughness");

    // Switch to matB (assigned to 2 faces) — does NOT overwrite faces or primary material
    fireEvent.change(selector, { target: { value: matB.id } });
    expect(screen.getByTestId("mock-uv-sync-3d")).toHaveAttribute("data-active-material", matB.id);
    expect(screen.getByTestId("mock-uv-sync-3d")).toHaveAttribute("data-preview-unassigned", "false");
    expect(cube.faces[0].materialId).toBe(matB.id);
    expect(cube.faces[2].materialId).toBeUndefined();

    // Selecting faces of matB invokes callback & updates selection
    fireEvent.click(screen.getByTestId("uv-select-material-faces"));
    expect(onSelectFacesByMaterial).toHaveBeenCalledWith("obj-cube", matB.id);

    // Switch to matLibraryOnly (not assigned to any face) — previews without overwriting
    fireEvent.change(selector, { target: { value: matLibraryOnly.id } });
    expect(screen.getByTestId("mock-uv-sync-3d")).toHaveAttribute("data-preview-unassigned", "true");
    expect(screen.getByText(/Previsualizando/)).toBeInTheDocument();

    // Can assign selected faces to matLibraryOnly explicitly
    fireEvent.click(screen.getByTestId("uv-assign-material-faces"));
    expect(onAssignMaterialToFaces).toHaveBeenCalledWith(
      "obj-cube",
      new Set([cube.faces[0].id, cube.faces[1].id]),
      matLibraryOnly.id,
    );
  });

  it("imports PBR textures with multi-file auto-detection, manual channel assignment/reassignment, and incomplete-set support", async () => {
    const cube = createCubeMesh();
    const baseMat = createMaterialAsset({ id: "mat-default", name: "Default" });
    const createdMat = createMaterialAsset({ id: "mat-created-pbr", name: "Piedra" });
    const onCreateMaterial = vi.fn(() => createdMat);
    const onUpdateMaterial = vi.fn();

    render(
      <UVWorkspace
        toolbarVisible={true}
        workMode="edit"
        objectId="obj-cube"
        objectName="Cubo"
        mesh={cube}
        materialAsset={baseMat}
        materials={[baseMat]}
        objectPrimaryMaterialId={baseMat.id}
        onCreateMaterial={onCreateMaterial}
        onUpdateMaterial={onUpdateMaterial}
      />,
    );

    // Open PBR import modal
    fireEvent.click(screen.getByTestId("uv-import-pbr-btn"));
    expect(screen.getByTestId("pbr-import-modal")).toBeInTheDocument();

    // Upload an incomplete PBR set (albedo + roughness + unrecognized filename queued for manual pick)
    const multiInput = screen.getByTestId("pbr-multi-file-input") as HTMLInputElement;
    const files = [
      new File(["a"], "piedra_albedo.png", { type: "image/png" }),
      new File(["r"], "piedra_roughness.png", { type: "image/png" }),
      new File(["u"], "custom_scan_map.png", { type: "image/png" }),
    ];
    fireEvent.change(multiInput, { target: { files } });

    await waitFor(() => {
      expect(screen.getByTestId("pbr-status-baseColor")).toHaveTextContent("Cargado");
      expect(screen.getByTestId("pbr-status-roughness")).toHaveTextContent("Cargado");
    });
    expect(screen.getByTestId("pbr-status-metallic")).toHaveTextContent("No cargado");

    // Assign unrecognized queued file manually to Metallic channel
    const unassignedSelect = screen.getByLabelText("Asignar canal para custom_scan_map.png");
    fireEvent.change(unassignedSelect, { target: { value: "metallic" } });
    expect(screen.getByTestId("pbr-status-metallic")).toHaveTextContent("Cargado");

    // Reassign roughness map manually to AO channel to test manual reassignment
    const moveSelect = screen.getByTestId("pbr-channel-move-roughness");
    fireEvent.change(moveSelect, { target: { value: "ao" } });
    expect(screen.getByTestId("pbr-status-ao")).toHaveTextContent("Cargado");
    expect(screen.getByTestId("pbr-status-roughness")).toHaveTextContent("No cargado");

    // Confirm incomplete PBR import -> creates shared MaterialAsset via LOOPA CORE
    fireEvent.click(screen.getByTestId("pbr-import-confirm"));
    expect(onCreateMaterial).toHaveBeenCalledTimes(1);
    expect(onCreateMaterial).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Piedra",
        textureDataUrl: TEST_PNG_DATA_URL,
        nodeGraph: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({ type: "image_texture" }),
          ]),
        }),
      }),
      true,
    );
  });

  it("can update an existing LOOPA Materials asset directly from the PBR importer", async () => {
    const cube = createCubeMesh();
    const activeMat = createMaterialAsset({ id: "mat-active", name: "Metal Base" });
    const onUpdateMaterial = vi.fn();

    render(
      <UVWorkspace
        toolbarVisible={true}
        workMode="edit"
        objectId="obj-cube"
        objectName="Cubo"
        mesh={cube}
        materialAsset={activeMat}
        materials={[activeMat]}
        objectPrimaryMaterialId={activeMat.id}
        onCreateMaterial={vi.fn()}
        onUpdateMaterial={onUpdateMaterial}
      />,
    );

    fireEvent.click(screen.getByTestId("uv-import-pbr-btn"));
    fireEvent.click(screen.getByTestId("pbr-mode-update"));

    const multiInput = screen.getByTestId("pbr-multi-file-input") as HTMLInputElement;
    fireEvent.change(multiInput, {
      target: {
        files: [new File(["n"], "metal_normal.png", { type: "image/png" })],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("pbr-status-normal")).toHaveTextContent("Cargado");
    });

    fireEvent.click(screen.getByTestId("pbr-import-confirm"));
    expect(onUpdateMaterial).toHaveBeenCalledTimes(1);
    expect(onUpdateMaterial).toHaveBeenCalledWith(
      "mat-active",
      expect.objectContaining({
        nodeGraph: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({ type: "normal_map" }),
          ]),
        }),
      }),
    );
  });
});
