import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMaterialAsset } from "../core/project/hierarchy";
import { MaterialAsset, SceneObjectData } from "../core/project/types";
import { MaterialNodeViewport } from "./MaterialNodeViewport";

function createMeshObject(primary: MaterialAsset, secondary: MaterialAsset): SceneObjectData {
  return {
    id: "material-mesh",
    name: "Escultura",
    objectType: "mesh",
    primitiveType: "cube",
    collectionId: "collection_default",
    visible: true,
    locked: false,
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    mesh: {
      vertices: [],
      edges: [],
      faces: [
        { id: "face-primary", vertexIds: [], materialId: primary.id },
        { id: "face-secondary", vertexIds: [], materialId: secondary.id },
      ],
      nextVertexNum: 0,
      nextEdgeNum: 0,
      nextFaceNum: 2,
    },
    material: {
      color: primary.baseColor,
      roughness: primary.roughness,
      metalness: primary.metallic,
    },
    materialId: primary.id,
    modifiers: [],
  };
}

describe("MaterialNodeViewport", () => {
  it("shows assigned material slots and persists edits to the selected shared material", () => {
    const primary = createMaterialAsset({
      id: "material-primary",
      name: "Primary",
    });
    const secondary = createMaterialAsset({
      id: "material-secondary",
      name: "Secondary",
    });
    const unassigned = createMaterialAsset({
      id: "material-unassigned",
      name: "Unassigned",
    });
    const onUpdateMaterial = vi.fn();
    const onSelectMaterial = vi.fn();

    render(
      <MaterialNodeViewport
        selectedObject={createMeshObject(primary, secondary)}
        materials={[primary, secondary, unassigned]}
        onSelectMaterial={onSelectMaterial}
        onPushMaterialHistory={vi.fn()}
        onUpdateMaterial={onUpdateMaterial}
      />,
    );

    const materialSelect = screen.getByLabelText("Material para editar");
    expect(screen.getByRole("option", { name: /Primary/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Secondary/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Unassigned/ })).toBeInTheDocument();
    expect(materialSelect).toHaveValue(primary.id);

    fireEvent.change(materialSelect, { target: { value: secondary.id } });
    expect(onSelectMaterial).toHaveBeenCalledWith(secondary.id);
    fireEvent.change(screen.getByLabelText("Tipo de nodo para añadir"), {
      target: { value: "math" },
    });

    expect(onUpdateMaterial).toHaveBeenCalledWith(
      secondary.id,
      expect.objectContaining({
        nodeGraph: expect.objectContaining({
          nodes: expect.arrayContaining([expect.objectContaining({ type: "math" })]),
        }),
      }),
      false,
    );
  });

  it("removes decorative headers and notes so the node canvas occupies the full viewport area", () => {
    const primary = createMaterialAsset({
      id: "material-primary",
      name: "Primary",
    });

    const { container } = render(
      <MaterialNodeViewport
        selectedObject={createMeshObject(primary, primary)}
        materials={[primary]}
        onPushMaterialHistory={vi.fn()}
        onUpdateMaterial={vi.fn()}
        screenModifiers={{ shift: true, ctrl: false, alt: false }}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
      />,
    );

    expect(screen.queryByText("Editor de nodos")).not.toBeInTheDocument();
    expect(screen.queryByText("Grafo de nodos")).not.toBeInTheDocument();
    expect(screen.queryByText(/Los nodos usan el mismo grafo persistente/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Grafo conectado y evaluado/i)).not.toBeInTheDocument();

    expect(screen.getByTestId("material-node-canvas-shell")).toBeInTheDocument();
    expect(screen.getByTestId("material-node-canvas-viewport")).toHaveAttribute(
      "data-shift-active",
      "true",
    );
    expect(screen.getByLabelText("Material para editar")).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo de nodo para añadir")).toBeInTheDocument();
    expect(screen.getByLabelText("Acercar el editor de nodos")).toBeInTheDocument();
    expect(container.querySelector("header h2")).toBeNull();
  });
});
