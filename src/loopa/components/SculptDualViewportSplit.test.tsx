import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SculptDualViewportSplit } from "./SculptDualViewportSplit";

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

describe("SculptDualViewportSplit", () => {
  it("renders both viewports, allows resizing with the divider, and restores split ratio on hide/show", () => {
    render(
      <SculptDualViewportSplit enabled secondary={<div>Visor 2</div>}>
        <div>Visor 1</div>
      </SculptDualViewportSplit>,
    );

    expect(screen.getByText("Visor 1")).toBeVisible();
    expect(screen.getByText("Visor 2")).toBeVisible();

    const split = screen.getByTestId("sculpt-dual-viewport-split");
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

    const divider = screen.getByTestId("sculpt-dual-viewport-divider");
    fireEvent.pointerDown(divider, {
      pointerId: 5,
      button: 0,
      clientX: 540,
    });
    fireEvent.pointerMove(divider, { pointerId: 5, clientX: 660 });
    expect(divider).toHaveAttribute("aria-valuenow", "66");
    fireEvent.pointerUp(divider, { pointerId: 5, clientX: 660 });

    fireEvent.keyDown(divider, { key: "ArrowLeft" });
    expect(divider).toHaveAttribute("aria-valuenow", "63");

    // Hide Visor 2 via button inside divider
    const hideBtn = screen.getByTestId("sculpt-toggle-second-viewport");
    expect(hideBtn).toHaveAttribute("aria-label", "Ocultar segundo visor 3D");
    fireEvent.click(hideBtn);

    const secondaryContainer = screen.getByTestId("sculpt-secondary-viewport");
    expect(secondaryContainer).toHaveStyle({ display: "none" });
    expect(screen.getByText("Visor 2")).toBeInTheDocument();

    // Restore button remains visible when Visor 2 is closed
    const restoreBtn = screen.getByTestId("sculpt-toggle-second-viewport");
    expect(restoreBtn).toHaveAttribute("aria-label", "Mostrar segundo visor 3D");
    expect(restoreBtn).toBeVisible();

    fireEvent.click(restoreBtn);
    expect(secondaryContainer).toHaveStyle({ display: "flex" });
    expect(screen.getByTestId("sculpt-dual-viewport-divider")).toHaveAttribute(
      "aria-valuenow",
      "63",
    );
  });

  it("does not mount split container or secondary viewport when disabled outside Sculpt mode", () => {
    render(
      <SculptDualViewportSplit enabled={false} secondary={<div>Visor 2</div>}>
        <div>Visor 1</div>
      </SculptDualViewportSplit>,
    );

    expect(screen.getByText("Visor 1")).toBeVisible();
    expect(screen.queryByText("Visor 2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sculpt-dual-viewport-split")).not.toBeInTheDocument();
  });
});
