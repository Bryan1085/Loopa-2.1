import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_TOUCH_SETTINGS } from "../core/project/storage";
import { FloatingRadialPair } from "./FloatingRadialPair";

function createPairProps(
  overrides: Partial<React.ComponentProps<typeof FloatingRadialPair>> = {},
): React.ComponentProps<typeof FloatingRadialPair> {
  return {
    activeWorkspace: "materials",
    boundsClassName: "left-80 right-0",
    floatingMenusEnabled: false,
    touchSettings: {
      ...DEFAULT_TOUCH_SETTINGS,
      modifierPanelEnabled: true,
      modifierPanelMode: "toggle",
    },
    onUpdateTouchSettings: vi.fn(),
    onUpdateRadialSlot: vi.fn(),
    onResetRadialSlot: vi.fn(),
    onResetRadialLayout: vi.fn(),
    workMode: "object",
    editSelectionMode: "vertex",
    activeTool: "select",
    axisConstraint: "none",
    projection: "perspective",
    displayMode: "solid",
    xrayTransparency: 0.5,
    showFaceOrientation: false,
    showGrid: true,
    showAxes: true,
    showLiner: false,
    barhomeVisible: true,
    multiSelectTouch: false,
    screenShiftActive: false,
    effectiveModifiers: { shift: false, ctrl: false, alt: false },
    screenModifiers: { shift: false, ctrl: false, alt: false },
    hasSelectedObject: true,
    canEditSelected: true,
    hasSelectedComponents: false,
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
    saveStatus: "saved",
    proportionalEnabled: false,
    proportionalConnectedOnly: false,
    onAddPrimitive: vi.fn(),
    onSelectTool: vi.fn(),
    onGQuickTapMove: vi.fn(),
    onChangeAxisConstraint: vi.fn(),
    onDuplicateObject: vi.fn(),
    onApplyObjectTransform: vi.fn(),
    onCenterObjectOrigin: vi.fn(),
    onSeparateSelectedGeometry: vi.fn(),
    onDeleteObject: vi.fn(),
    onSetCameraPreset: vi.fn(),
    onFocusSelected: vi.fn(),
    onToggleProjection: vi.fn(),
    onToggleWorkMode: vi.fn(),
    onChangeEditSelectionMode: vi.fn(),
    onChangeEdgeSelectionTool: vi.fn(),
    onSelectEdgeTopology: vi.fn(),
    onToggleXray: vi.fn(),
    onSelectDisplayMode: vi.fn(),
    onChangeXrayTransparency: vi.fn(),
    onToggleFaceOrientation: vi.fn(),
    onToggleGrid: vi.fn(),
    onToggleAxes: vi.fn(),
    onToggleLiner: vi.fn(),
    onToggleBarhome: vi.fn(),
    onToggleMultiSelectTouch: vi.fn(),
    onToggleScreenShift: vi.fn(),
    onSetModifier: vi.fn(),
    onToggleModifier: vi.fn(),
    onReleaseAllModifiers: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onStartOperator: vi.fn(),
    onFillSelection: vi.fn(),
    onConnectVertexPath: vi.fn(),
    onRecalculateOutside: vi.fn(),
    onFlipNormals: vi.fn(),
    onQuickDissolve: vi.fn(),
    onExecuteContextualDelete: vi.fn(),
    onMarkSeams: vi.fn(),
    onSelectSeams: vi.fn(),
    onDeselectSeams: vi.fn(),
    onToggleProportional: vi.fn(),
    onToggleProportionalConnected: vi.fn(),
    onCycleProportionalFalloff: vi.fn(),
    onSelectAll: vi.fn(),
    onDeselectAll: vi.fn(),
    onSelectAllObjects: vi.fn(),
    onDeselectAllObjects: vi.fn(),
    onSelectConnected: vi.fn(),
    onSetSelectedObjectShading: vi.fn(),
    onCreateProjectModal: vi.fn(),
    onOpenProjectModal: vi.fn(),
    onSaveProject: vi.fn(),
    onSaveAsProjectModal: vi.fn(),
    onImportNativeProject: vi.fn(),
    onExportNativeProject: vi.fn(),
    onImportExternal: vi.fn(),
    onExportExternal: vi.fn(),
    onImportObj: vi.fn(),
    onImportStl: vi.fn(),
    onImportJpg: vi.fn(),
    onImportPng: vi.fn(),
    onExportSelected: vi.fn(),
    onExportScene: vi.fn(),
    onExportObj: vi.fn(),
    onExportStl: vi.fn(),
    onReturnToGallery: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  };
}

describe("FloatingRadialPair modifiers in LOOPA Materials", () => {
  it("renders the same Shift, Alt and Ctrl modifier buttons as LOOPA Modeler in toggle mode without blocking the node canvas", () => {
    const onToggleModifier = vi.fn();
    const onReleaseAllModifiers = vi.fn();
    const props = createPairProps({
      activeWorkspace: "materials",
      onToggleModifier,
      onReleaseAllModifiers,
      effectiveModifiers: { shift: true, ctrl: false, alt: false },
      screenModifiers: { shift: true, ctrl: false, alt: false },
    });

    const { container, rerender } = render(<FloatingRadialPair {...props} />);
    const trigger = screen.getByTestId("floating-radial-modifiers-btn");
    expect(trigger).toHaveClass("h-12", "w-12", "rounded-full");

    fireEvent.click(trigger);

    const shiftBtn = screen.getByTestId("floating-radial-modifier-shift");
    const ctrlBtn = screen.getByTestId("floating-radial-modifier-ctrl");
    const altBtn = screen.getByTestId("floating-radial-modifier-alt");
    expect(shiftBtn).toHaveTextContent("SHIFT");
    expect(ctrlBtn).toHaveTextContent("CTRL");
    expect(altBtn).toHaveTextContent("ALT");
    expect(shiftBtn).toHaveAttribute("aria-pressed", "true");
    expect(ctrlBtn).toHaveAttribute("aria-pressed", "false");
    expect(altBtn).toHaveAttribute("aria-pressed", "false");

    // No invisible inset-0 backdrop blocking node gestures in Materials
    expect(container.querySelector(".inset-0.z-20.pointer-events-auto")).toBeNull();

    fireEvent.click(shiftBtn);
    fireEvent.click(ctrlBtn);
    fireEvent.click(altBtn);
    expect(onToggleModifier).toHaveBeenNthCalledWith(1, "shift");
    expect(onToggleModifier).toHaveBeenNthCalledWith(2, "ctrl");
    expect(onToggleModifier).toHaveBeenNthCalledWith(3, "alt");

    fireEvent.click(screen.getByTestId("floating-radial-modifiers-release-all"));
    expect(onReleaseAllModifiers).toHaveBeenCalledOnce();

    // Matches Modeler design classes for the Shift/Ctrl/Alt pills
    rerender(<FloatingRadialPair {...createPairProps({ activeWorkspace: "layout" })} />);
    expect(screen.getByTestId("floating-radial-modifier-shift").className).toContain(
      "h-10 w-[68px] rounded-full",
    );
  });

  it("supports hold mode activation and release for Shift, Ctrl and Alt in Materials", () => {
    const onSetModifier = vi.fn();
    render(
      <FloatingRadialPair
        {...createPairProps({
          activeWorkspace: "materials",
          touchSettings: {
            ...DEFAULT_TOUCH_SETTINGS,
            modifierPanelEnabled: true,
            modifierPanelMode: "hold",
          },
          onSetModifier,
        })}
      />,
    );

    fireEvent.click(screen.getByTestId("floating-radial-modifiers-btn"));
    const shiftBtn = screen.getByTestId("floating-radial-modifier-shift");
    fireEvent.pointerDown(shiftBtn, { pointerId: 21 });
    expect(onSetModifier).toHaveBeenCalledWith("shift", true);
    fireEvent.pointerUp(shiftBtn, { pointerId: 21 });
    expect(onSetModifier).toHaveBeenCalledWith("shift", false);
  });
});
