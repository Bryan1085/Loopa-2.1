import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getObjectMaterialSlotsSummary } from "../core/project/hierarchy";
import { MaterialAsset, SceneObjectData, TouchModifierState } from "../core/project/types";
import { normalizeMaterialNodeGraph } from "../core/materials/nodeGraph";
import { MaterialNodeEditor } from "./MaterialNodeEditor";

interface MaterialNodeViewportProps {
  selectedObject: SceneObjectData | null;
  materials: MaterialAsset[];
  selectedMaterialId?: string | null;
  onSelectMaterial?: (materialId: string) => void;
  onPushMaterialHistory: () => void;
  onUpdateMaterial: (
    materialId: string,
    patch: Partial<Omit<MaterialAsset, "id">>,
    recordHistory?: boolean,
  ) => void;
  screenModifiers?: TouchModifierState;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const MaterialNodeViewport: React.FC<MaterialNodeViewportProps> = ({
  selectedObject,
  materials,
  selectedMaterialId,
  onSelectMaterial,
  onPushMaterialHistory,
  onUpdateMaterial,
  screenModifiers,
  onUndo,
  onRedo,
}) => {
  const objectMaterialSlots = useMemo(
    () =>
      selectedObject?.objectType === "mesh"
        ? getObjectMaterialSlotsSummary(selectedObject, materials)
        : [],
    [materials, selectedObject],
  );
  const availableMaterials = materials;
  const primaryMaterialId =
    objectMaterialSlots.find((slot) => slot.isPrimary)?.materialId ??
    availableMaterials[0]?.id ??
    "";
  const [localEditingMaterialId, setLocalEditingMaterialId] = useState(primaryMaterialId);
  const editingMaterialId = selectedMaterialId ?? localEditingMaterialId;
  const selectMaterial = useCallback(
    (materialId: string) => {
      setLocalEditingMaterialId(materialId);
      onSelectMaterial?.(materialId);
    },
    [onSelectMaterial],
  );

  useEffect(() => {
    selectMaterial(primaryMaterialId);
  }, [primaryMaterialId, selectMaterial, selectedObject?.id]);

  useEffect(() => {
    if (!availableMaterials.some((material) => material.id === editingMaterialId)) {
      selectMaterial(primaryMaterialId);
    }
  }, [availableMaterials, editingMaterialId, primaryMaterialId, selectMaterial]);

  const activeMaterial =
    availableMaterials.find((material) => material.id === editingMaterialId) ??
    availableMaterials[0] ??
    null;
  const nodeGraph = useMemo(
    () =>
      activeMaterial ? normalizeMaterialNodeGraph(activeMaterial.nodeGraph, activeMaterial) : null,
    [activeMaterial],
  );

  const materialSelector = (
    <label className="flex min-w-0 items-center">
      <span className="sr-only">Material para editar</span>
      <select
        aria-label="Material para editar"
        value={activeMaterial?.id ?? ""}
        disabled={availableMaterials.length === 0}
        onChange={(event) => selectMaterial(event.target.value)}
        className="h-8 max-w-44 rounded border border-[#343a46] bg-[#121418] px-2 text-[10px] text-[#cbd5e1] outline-none focus:border-[#5ecd6e] disabled:opacity-50"
      >
        {availableMaterials.length === 0 ? (
          <option value="">Sin materiales</option>
        ) : (
          availableMaterials.map((material) => {
            const slot = objectMaterialSlots.find((item) => item.materialId === material.id);
            return (
              <option key={material.id} value={material.id}>
                {material.name}
                {slot && slot.faceCount > 0 ? ` (${slot.faceCount} caras)` : ""}
              </option>
            );
          })
        )}
      </select>
    </label>
  );

  return (
    <section
      data-testid="material-node-editor-viewport"
      aria-label="Editor de nodos de materiales"
      className="flex h-full min-h-0 flex-col overflow-hidden border-l border-[#2b2e36] bg-[#121418]"
    >
      <div className="min-h-0 flex-1 flex flex-col">
        {activeMaterial && nodeGraph ? (
          <MaterialNodeEditor
            material={activeMaterial}
            graph={nodeGraph}
            variant="canvas"
            toolbarStart={materialSelector}
            screenModifiers={screenModifiers}
            onUndo={onUndo}
            onRedo={onRedo}
            onBeginEdit={onPushMaterialHistory}
            onChange={(nextGraph) =>
              onUpdateMaterial(activeMaterial.id, { nodeGraph: nextGraph }, false)
            }
          />
        ) : (
          <div className="relative flex h-full min-h-0 flex-1 flex-col p-2">
            <div className="flex shrink-0 items-center pb-2">{materialSelector}</div>
            <p
              role="status"
              className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[#343a46] px-4 text-center text-xs text-[#8e95a2]"
            >
              Crea un material en LOOPA Materials para comenzar a editar nodos.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
