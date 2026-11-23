import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MODELER_SETTINGS } from "../core/project/storage";
import { Viewport3D } from "./Viewport3D";

vi.mock("../engine/ViewportEngine", () => ({
  ViewportEngine: class MockViewportEngine {
    syncScene = vi.fn();
    dispose = vi.fn();
    setCameraPreset = vi.fn();
    focusSelected = vi.fn();
    setOrbitFromDelta = vi.fn();
  },
}));

vi.mock("./AxisGizmoWidget", () => ({
  AxisGizmoWidget: () => null,
}));

function createViewportProps(
  overrides: Partial<React.ComponentProps<typeof Viewport3D>> = {},
): React.ComponentProps<typeof Viewport3D> {
  return {
    objects: [],
    materials: [],
    selectedObject: null,
    selectedObjectId: null,
    selectedObjectIds: new Set(),
    workMode: "object",
    editSelectionMode: "vertex",
    selectedComponentIds: new Set(),
    activeTool: "select",
    axisConstraint: "none",
    projection: "perspective",
    settings: DEFAULT_MODELER_SETTINGS,
    meshRevision: 0,
    toastMessage: null,
    screenShiftActive: false,
    screenModifiers: { shift: false, ctrl: false, alt: false },
    operatorSession: null,
    canUndo: false,
    canRedo: false,
    onSelectObject: vi.fn(),
    onSelectComponent: vi.fn(),
    onPickLoopCutEdge: vi.fn(),
    onTwoFingerUndo: vi.fn(),
    onThreeFingerRedo: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onLiveObjectTransform: vi.fn(),
    onCommitObjectTransform: vi.fn(),
    onCommitObjectTransforms: vi.fn(),
    onCommitMeshEdit: vi.fn(),
    onUpdateOperatorConfig: vi.fn(),
    onConfirmOperator: vi.fn(),
    onCancelOperator: vi.fn(),
    onChangeAxisConstraint: vi.fn(),
    onToggleProjection: vi.fn(),
    onToggleXray: vi.fn(),
    onToggleFaceOrientation: vi.fn(),
    onToggleGrid: vi.fn(),
    onToggleMultiSelectTouch: vi.fn(),
    onToggleScreenShift: vi.fn(),
    onReleaseScreenModifiers: vi.fn(),
    onUpdateTouchSettings: vi.fn(),
    onUpdateRadialSlot: vi.fn(),
    onResetRadialSlot: vi.fn(),
    onResetRadialLayout: vi.fn(),
    onAddPrimitive: vi.fn(),
    onSelectTool: vi.fn(),
    onDuplicateObject: vi.fn(),
    onApplyObjectTransform: vi.fn(),
    onCenterObjectOrigin: vi.fn(),
    onSeparateSelectedGeometry: vi.fn(),
    onHideObject: vi.fn(),
    onDeleteObject: vi.fn(),
    onToggleWorkMode: vi.fn(),
    onChangeEditSelectionMode: vi.fn(),
    onSelectAll: vi.fn(),
    onDeselectAll: vi.fn(),
    onStartOperator: vi.fn(),
    onFillSelection: vi.fn(),
    onConnectVertexPath: vi.fn(),
    onRecalculateOutside: vi.fn(),
    onFlipNormals: vi.fn(),
    onQuickDissolve: vi.fn(),
    onExecuteContextualDelete: vi.fn(),
    onToggleProportional: vi.fn(),
    onToggleProportionalConnected: vi.fn(),
    onChangeProportionalRadius: vi.fn(),
    onSaveProject: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  };
}

describe("Viewport3D modifier combo menu guard", () => {
  it("does not open Modeler Ctrl+Shift or Ctrl+Alt combo menus when allowModifierComboMenus is false (Materials workspace)", () => {
    const { rerender } = render(
      <Viewport3D
        {...createViewportProps({
          allowModifierComboMenus: false,
          screenModifiers: { shift: true, ctrl: true, alt: false },
        })}
      />,
    );

    expect(screen.queryByText(/Primitivas/i)).not.toBeInTheDocument();

    rerender(
      <Viewport3D
        {...createViewportProps({
          allowModifierComboMenus: false,
          screenModifiers: { shift: false, ctrl: true, alt: true },
        })}
      />,
    );
    expect(screen.queryByText(/Operaciones/i)).not.toBeInTheDocument();
  });
});
