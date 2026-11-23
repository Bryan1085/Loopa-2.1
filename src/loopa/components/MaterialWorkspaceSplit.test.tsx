import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
