import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMaterialAsset } from "../core/project/hierarchy";
import { MaterialNodeViewport } from "./MaterialNodeViewport";
import { MaterialWorkspaceSplit } from "./MaterialWorkspaceSplit";

if (!window.PointerEvent) {
  class PointerEventForTests extends MouseEvent {
    pointerId: number;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  Object.defineProperty(window, "PointerEvent", {
    value: PointerEventForTests,
  });
}

describe("MaterialWorkspaceSplit", () => {
  it("keeps the 3D scene and node editor visible and lets the divider resize them", () => {
    render(
      <MaterialWorkspaceSplit enabled editor={<aside>Editor de nodos</aside>}>
        <main>World 3D</main>
      </MaterialWorkspaceSplit>,
    );

    expect(screen.getByText("World 3D")).toBeVisible();
    expect(screen.getByText("Editor de nodos")).toBeVisible();

    const split = screen.getByTestId("material-workspace-split");
    Object.defineProperty(split, "getBoundingClientRect", {
      value: () =>
        ({
          left: 0,
          right: 1000,
          top: 0,
          bottom: 600,
          width: 1000,
          height: 600,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    });

    const divider = screen.getByRole("separator", {
      name: "Ajustar tamaño de los visores de Materials",
    });
    fireEvent.pointerDown(divider, {
      pointerId: 7,
      button: 0,
      clientX: 580,
    });
    fireEvent.pointerMove(divider, { pointerId: 7, clientX: 680 });
    expect(divider).toHaveAttribute("aria-valuenow", "68");
    fireEvent.pointerUp(divider, { pointerId: 7, clientX: 680 });

    fireEvent.keyDown(divider, { key: "ArrowLeft" });
    expect(divider).toHaveAttribute("aria-valuenow", "65");
  });

  it("toggles the 3D viewport closed and keeps a single visible restore button", () => {
    render(
      <MaterialWorkspaceSplit enabled editor={<aside>Editor de nodos</aside>}>
        <main>World 3D</main>
      </MaterialWorkspaceSplit>,
    );

    const hideBtn = screen.getByTestId("material-toggle-3d-viewport");
    expect(hideBtn).toHaveAttribute("aria-label", "Ocultar visor 3D");
    expect(hideBtn.className).toContain("top-3");
    expect(hideBtn.className).toContain("h-11");

    fireEvent.click(hideBtn);

    expect(screen.getByTestId("material-world-viewport")).toHaveStyle({
      display: "none",
    });
    const showButtons = screen.getAllByTestId("material-toggle-3d-viewport");
    expect(showButtons).toHaveLength(1);
    expect(showButtons[0]).toHaveAttribute("aria-label", "Mostrar visor 3D");
    expect(showButtons[0]).toBeVisible();

    fireEvent.click(showButtons[0]);
    expect(screen.getByTestId("material-world-viewport")).toHaveStyle({
      display: "block",
    });
  });

  it("places the toggle button inline in the node editor toolbar with clear size and clears top-left quick controls", () => {
    const material = createMaterialAsset({ id: "split-mat", name: "Madera" });
    render(
      <MaterialWorkspaceSplit
        enabled
        reserveTopLeftCorner
        reserveTopLeftWrench
        editor={
          <MaterialNodeViewport
            selectedObject={null}
            materials={[material]}
            onPushMaterialHistory={vi.fn()}
            onUpdateMaterial={vi.fn()}
          />
        }
      >
        <main>World 3D</main>
      </MaterialWorkspaceSplit>,
    );

    const openToggles = screen.getAllByTestId("material-toggle-3d-viewport");
    expect(openToggles).toHaveLength(1);
    expect(openToggles[0]).toHaveAttribute("aria-label", "Ocultar visor 3D");
    expect(openToggles[0].className).toContain("min-h-10");
    fireEvent.click(openToggles[0]);

    const restoreBtns = screen.getAllByTestId("material-toggle-3d-viewport");
    expect(restoreBtns).toHaveLength(1);
    const restoreBtn = restoreBtns[0];
    expect(restoreBtn).toHaveAttribute("aria-label", "Mostrar visor 3D");
    expect(restoreBtn).toBeVisible();

    const materialSelect = screen.getByLabelText("Material para editar");
    expect(restoreBtn.parentElement).toBe(materialSelect.closest("div"));
    const toolbarRow = restoreBtn.parentElement?.parentElement;
    expect(toolbarRow?.className).toContain("sm:left-[196px]");

    fireEvent.click(restoreBtn);
    expect(screen.getByTestId("material-world-viewport")).toHaveStyle({
      display: "block",
    });
  });

  it("does not add a split when disabled outside Materials", () => {
    render(
      <MaterialWorkspaceSplit enabled={false} editor={<aside>Editor de nodos</aside>}>
        <main>World 3D</main>
      </MaterialWorkspaceSplit>,
    );

    expect(screen.getByText("World 3D")).toBeVisible();
    expect(screen.queryByText("Editor de nodos")).not.toBeInTheDocument();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });
});
