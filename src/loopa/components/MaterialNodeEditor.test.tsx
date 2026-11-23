import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMaterialAsset } from "../core/project/hierarchy";
import { createDefaultMaterialNodeGraph } from "../core/materials/nodeGraph";
import { MaterialNodeEditor } from "./MaterialNodeEditor";

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

describe("MaterialNodeEditor", () => {
  it("adds an evaluable node to the persisted graph", () => {
    const material = createMaterialAsset({ id: "editor-material" });
    const graph = createDefaultMaterialNodeGraph(material);
    const onChange = vi.fn();
    const onBeginEdit = vi.fn();

    render(
      <MaterialNodeEditor
        material={material}
        graph={graph}
        onChange={onChange}
        onBeginEdit={onBeginEdit}
      />,
    );

    fireEvent.click(screen.getByText("Grafo de nodos"));
    fireEvent.change(screen.getByLabelText("Tipo de nodo para añadir"), {
      target: { value: "math" },
    });

    expect(onBeginEdit).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0].nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "math" })]),
    );
  });

  it("renders graph links and supports moving, connecting, duplicating, and deleting canvas nodes", () => {
    const material = createMaterialAsset({ id: "canvas-material" });
    const graph = createDefaultMaterialNodeGraph(material);
    const onChange = vi.fn();
    const onBeginEdit = vi.fn();

    const EditorHarness = () => {
      const [currentGraph, setCurrentGraph] = useState(graph);
      return (
        <MaterialNodeEditor
          material={material}
          graph={currentGraph}
          variant="canvas"
          onChange={(nextGraph) => {
            onChange(nextGraph);
            setCurrentGraph(nextGraph);
          }}
          onBeginEdit={onBeginEdit}
        />
      );
    };

    render(<EditorHarness />);

    expect(screen.getAllByTestId("material-node-card")).toHaveLength(2);
    expect(screen.getByTestId("material-node-link")).toBeInTheDocument();

    const principledCard = screen
      .getByRole("heading", { name: "Principled BSDF" })
      .closest('[data-testid="material-node-card"]');
    expect(principledCard).not.toBeNull();
    const nodeHeader = screen.getByRole("heading", {
      name: "Principled BSDF",
    }).parentElement!;
    fireEvent.pointerDown(nodeHeader, {
      pointerId: 1,
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(nodeHeader, {
      pointerId: 1,
      clientX: 50,
      clientY: 70,
    });
    fireEvent.pointerUp(nodeHeader, {
      pointerId: 1,
      button: 0,
      clientX: 50,
      clientY: 70,
    });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: "canvas-material:principled",
            position: { x: 160, y: 180 },
          }),
        ]),
      }),
    );

    fireEvent.change(screen.getByLabelText("Color base Principled BSDF"), {
      target: { value: "#112233" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: "canvas-material:principled",
            values: expect.objectContaining({ baseColor: "#112233" }),
          }),
        ]),
      }),
    );

    fireEvent.click(screen.getByLabelText("Duplicar nodo Principled BSDF"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            type: "principled_bsdf",
            position: { x: 196, y: 216 },
          }),
        ]),
      }),
    );

    fireEvent.change(screen.getByLabelText("Material Output: Surface"), {
      target: { value: "canvas-material:principled::bsdf" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        links: [
          expect.objectContaining({
            fromNodeId: "canvas-material:principled",
            fromSocket: "bsdf",
            toNodeId: "canvas-material:output",
            toSocket: "surface",
          }),
        ],
      }),
    );

    fireEvent.change(screen.getByLabelText("Material Output: Surface"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ links: [] }));

    fireEvent.click(screen.getByLabelText("Eliminar nodo Material Output"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nodes: expect.not.arrayContaining([expect.objectContaining({ type: "material_output" })]),
        links: [],
      }),
    );
    expect(onBeginEdit).toHaveBeenCalled();
  });

  it("supports zooming and panning without changing persisted node positions", () => {
    const material = createMaterialAsset({ id: "navigation-material" });
    const graph = createDefaultMaterialNodeGraph(material);
    const onChange = vi.fn();

    render(
      <MaterialNodeEditor
        material={material}
        graph={graph}
        variant="canvas"
        onChange={onChange}
        onBeginEdit={vi.fn()}
      />,
    );

    const viewport = screen.getByTestId("material-node-canvas-viewport");
    const originalPositions = graph.nodes.map((node) => node.position);
    fireEvent.wheel(viewport, {
      ctrlKey: true,
      deltaY: -120,
      clientX: 200,
      clientY: 120,
    });
    expect(Number(viewport.getAttribute("data-zoom"))).toBeGreaterThan(1);
    const panXBeforeNavigation = Number(viewport.getAttribute("data-pan-x"));
    const panYBeforeNavigation = Number(viewport.getAttribute("data-pan-y"));

    fireEvent.keyDown(viewport, { key: " " });
    fireEvent.pointerDown(viewport, {
      pointerId: 7,
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 7,
      clientX: 140,
      clientY: 130,
    });
    fireEvent.pointerUp(viewport, {
      pointerId: 7,
      button: 0,
      clientX: 140,
      clientY: 130,
    });
    fireEvent.keyUp(viewport, { key: " " });

    expect(Number(viewport.getAttribute("data-pan-x"))).toBe(panXBeforeNavigation + 40);
    expect(Number(viewport.getAttribute("data-pan-y"))).toBe(panYBeforeNavigation + 30);
    expect(onChange).not.toHaveBeenCalled();
    expect(graph.nodes.map((node) => node.position)).toEqual(originalPositions);

    fireEvent.click(screen.getByLabelText("Restablecer zoom y paneo"));
    expect(viewport).toHaveAttribute("data-zoom", "1");
    expect(viewport).toHaveAttribute("data-pan-x", "0");
    expect(viewport).toHaveAttribute("data-pan-y", "0");
  });

  it("creates and edits real Color Ramp stops", () => {
    const material = createMaterialAsset({ id: "ramp-editor-material" });
    const baseGraph = createDefaultMaterialNodeGraph(material);
    const graph = {
      ...baseGraph,
      nodes: [
        ...baseGraph.nodes,
        {
          id: "ramp-editor",
          type: "color_ramp" as const,
          position: { x: 200, y: 120 },
          values: {
            factor: 0.5,
            interpolation: "linear",
            stops: [
              { position: 0, color: "#000000" },
              { position: 1, color: "#ffffff" },
            ],
          },
        },
      ],
    };
    const onChange = vi.fn();

    render(
      <MaterialNodeEditor
        material={material}
        graph={graph}
        variant="canvas"
        onChange={onChange}
        onBeginEdit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Agregar parada Color Ramp"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: "ramp-editor",
            values: expect.objectContaining({
              stops: expect.arrayContaining([
                expect.objectContaining({ position: 0.5, color: "#808080" }),
              ]),
            }),
          }),
        ]),
      }),
    );
    expect(screen.getByLabelText("Interpolación Color Ramp")).toBeInTheDocument();
    expect(screen.getByLabelText("Vista previa Color Ramp")).toBeInTheDocument();
  });

  it("connects typed sockets by dragging an output to an input", () => {
    const material = createMaterialAsset({ id: "socket-drag-material" });
    const baseGraph = createDefaultMaterialNodeGraph(material);
    const graph = {
      ...baseGraph,
      nodes: [
        ...baseGraph.nodes,
        {
          id: "drag-ramp",
          type: "color_ramp" as const,
          position: { x: 200, y: 120 },
          values: {
            factor: 0.5,
            interpolation: "linear",
            stops: [
              { position: 0, color: "#000000" },
              { position: 1, color: "#ffffff" },
            ],
          },
        },
      ],
    };
    const onChange = vi.fn();
    const priorDescriptor = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
    const inputSocketLabel = "Socket de entrada Principled BSDF: Base Color";
    let inputSocket: HTMLElement | null = null;
    const EditorHarness = () => {
      const [currentGraph, setCurrentGraph] = useState(graph);
      return (
        <MaterialNodeEditor
          material={material}
          graph={currentGraph}
          variant="canvas"
          onChange={(nextGraph) => {
            onChange(nextGraph);
            setCurrentGraph(nextGraph);
          }}
          onBeginEdit={vi.fn()}
        />
      );
    };

    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => inputSocket,
    });
    try {
      render(<EditorHarness />);
      inputSocket = screen.getByLabelText(inputSocketLabel);
      fireEvent.pointerDown(screen.getByLabelText("Socket de salida Color Ramp: Color"), {
        pointerId: 11,
        button: 0,
        clientX: 400,
        clientY: 200,
      });
      expect(screen.getByTestId("material-node-link-preview")).toBeInTheDocument();
      const viewport = screen.getByTestId("material-node-canvas-viewport");
      fireEvent.pointerMove(viewport, {
        pointerId: 11,
        clientX: 500,
        clientY: 220,
      });
      fireEvent.pointerUp(viewport, {
        pointerId: 11,
        button: 0,
        clientX: 500,
        clientY: 220,
      });
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          links: expect.arrayContaining([
            expect.objectContaining({
              fromNodeId: "drag-ramp",
              fromSocket: "color",
              toSocket: "baseColor",
            }),
          ]),
        }),
      );
      expect(screen.queryByTestId("material-node-link-preview")).not.toBeInTheDocument();
    } finally {
      if (priorDescriptor) {
        Object.defineProperty(document, "elementFromPoint", priorDescriptor);
      } else {
        Reflect.deleteProperty(document, "elementFromPoint");
      }
    }
  });

  it("cuts single and multiple connections with Shift while preserving nodes, node values, material evaluation and undo/redo", async () => {
    const { evaluateMaterialNodeGraph } = await import("../core/materials/nodeGraph");
    const material = createMaterialAsset({
      id: "cut-material",
      baseColor: "#808080",
      roughness: 0.7,
    });
    const baseGraph = createDefaultMaterialNodeGraph(material);
    const initialGraph = {
      ...baseGraph,
      nodes: [
        ...baseGraph.nodes,
        {
          id: "val-color",
          type: "value_color" as const,
          position: { x: 20, y: 80 },
          values: { value: "#ff2200" },
        },
        {
          id: "val-roughness",
          type: "value_float" as const,
          position: { x: 20, y: 260 },
          values: { value: 0.15 },
        },
      ],
      links: [
        ...baseGraph.links,
        {
          id: "link-color",
          fromNodeId: "val-color",
          fromSocket: "color",
          toNodeId: "cut-material:principled",
          toSocket: "baseColor",
        },
        {
          id: "link-rough",
          fromNodeId: "val-roughness",
          fromSocket: "value",
          toNodeId: "cut-material:principled",
          toSocket: "roughness",
        },
      ],
    };

    const socketCoords: Record<string, { x: number; y: number }> = {
      "output:val-color:color": { x: 180, y: 120 },
      "input:cut-material:principled:baseColor": { x: 420, y: 120 },
      "output:val-roughness:value": { x: 180, y: 260 },
      "input:cut-material:principled:roughness": { x: 420, y: 260 },
      "output:cut-material:principled:bsdf": { x: 640, y: 400 },
      "input:cut-material:output:surface": { x: 840, y: 400 },
    };

    const mockRect = (left: number, top: number, width: number, height: number): DOMRect =>
      ({
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
        x: left,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;

    const CutHarness = () => {
      const [history, setHistory] = useState<{
        past: (typeof initialGraph)[];
        present: typeof initialGraph;
        future: (typeof initialGraph)[];
      }>({
        past: [],
        present: initialGraph,
        future: [],
      });
      const [shiftModifier, setShiftModifier] = useState(true);
      const evaluated = evaluateMaterialNodeGraph(history.present, material);

      const handleUndo = () => {
        setHistory((h) => {
          if (h.past.length === 0) return h;
          const prev = h.past[h.past.length - 1];
          return {
            past: h.past.slice(0, -1),
            present: prev,
            future: [h.present, ...h.future],
          };
        });
      };

      const handleRedo = () => {
        setHistory((h) => {
          if (h.future.length === 0) return h;
          const [next, ...rest] = h.future;
          return {
            past: [...h.past, h.present],
            present: next,
            future: rest,
          };
        });
      };

      return (
        <div>
          <span data-testid="evaluated-color">{evaluated.surface.baseColor}</span>
          <span data-testid="evaluated-roughness">{evaluated.surface.roughness}</span>
          <button
            type="button"
            data-testid="toggle-shift-btn"
            onClick={() => setShiftModifier((s) => !s)}
          >
            Toggle Shift
          </button>
          <button type="button" data-testid="undo-btn" onClick={handleUndo}>
            Undo
          </button>
          <button type="button" data-testid="redo-btn" onClick={handleRedo}>
            Redo
          </button>
          <MaterialNodeEditor
            material={material}
            graph={history.present}
            variant="canvas"
            screenModifiers={{ shift: shiftModifier, ctrl: false, alt: false }}
            onBeginEdit={() => {
              setHistory((h) => ({
                past: [...h.past, h.present],
                present: h.present,
                future: [],
              }));
            }}
            onChange={(nextGraph) => {
              setHistory((h) => ({ ...h, present: nextGraph }));
            }}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />
        </div>
      );
    };

    const { container } = render(<CutHarness />);
    const viewport = screen.getByTestId("material-node-canvas-viewport");
    Object.defineProperty(viewport, "getBoundingClientRect", {
      configurable: true,
      value: () => mockRect(0, 0, 1000, 600),
    });
    container.querySelectorAll<HTMLElement>("[data-socket-key]").forEach((el) => {
      const key = el.dataset.socketKey!;
      const pos = socketCoords[key];
      if (!pos) return;
      Object.defineProperty(el, "getBoundingClientRect", {
        configurable: true,
        value: () => mockRect(pos.x - 4, pos.y - 4, 8, 8),
      });
    });

    // Force socket measurement by resizing or panning once and resetting
    fireEvent.click(screen.getByLabelText("Acercar el editor de nodos"));
    fireEvent.click(screen.getByLabelText("Restablecer zoom y paneo"));

    expect(screen.getAllByTestId("material-node-link")).toHaveLength(3);
    expect(screen.getByTestId("evaluated-color")).toHaveTextContent("#ff2200");
    expect(screen.getByTestId("evaluated-roughness")).toHaveTextContent("0.15");

    // 1. Cut BOTH link-color (y=120) and link-rough (y=260) in a single vertical swipe at x=300, keeping BSDF->Output (y=400, x=640..840) untouched
    fireEvent.pointerDown(viewport, {
      pointerId: 31,
      button: 0,
      clientX: 300,
      clientY: 60,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 31,
      clientX: 300,
      clientY: 180,
    });
    expect(screen.getByTestId("material-node-cut-trail")).toBeInTheDocument();
    expect(screen.getAllByTestId("material-node-link")).toHaveLength(2);
    expect(screen.getByTestId("evaluated-color")).toHaveTextContent("#808080");

    fireEvent.pointerMove(viewport, {
      pointerId: 31,
      clientX: 300,
      clientY: 320,
    });
    fireEvent.pointerUp(viewport, {
      pointerId: 31,
      button: 0,
      clientX: 300,
      clientY: 320,
    });

    // Only BSDF -> Output link remains; all 4 nodes & their values remain intact
    expect(screen.getAllByTestId("material-node-link")).toHaveLength(1);
    expect(screen.getAllByTestId("material-node-card")).toHaveLength(4);
    expect(screen.getByLabelText("Valor Color")).toHaveValue("#ff2200");
    expect(screen.getByLabelText("Valor Float")).toHaveValue(0.15);
    expect(screen.getByTestId("evaluated-roughness")).toHaveTextContent("0.7");
    expect(screen.getAllByTestId("material-node-cut-feedback").length).toBeGreaterThanOrEqual(2);
    // Shift cut must not have panned the canvas
    expect(viewport).toHaveAttribute("data-pan-x", "0");
    expect(viewport).toHaveAttribute("data-pan-y", "0");

    // 2. Undo restores both cut links and evaluated surface values
    fireEvent.click(screen.getByTestId("undo-btn"));
    expect(screen.getAllByTestId("material-node-link")).toHaveLength(3);
    expect(screen.getByTestId("evaluated-color")).toHaveTextContent("#ff2200");
    expect(screen.getByTestId("evaluated-roughness")).toHaveTextContent("0.15");

    // 3. Redo re-applies the cut
    fireEvent.click(screen.getByTestId("redo-btn"));
    expect(screen.getAllByTestId("material-node-link")).toHaveLength(1);
    expect(screen.getByTestId("evaluated-color")).toHaveTextContent("#808080");
    expect(screen.getByTestId("evaluated-roughness")).toHaveTextContent("0.7");
  });

  it("handles touch navigation priority: 1-finger pan, 2-finger pinch zoom, node header drag with Shift active, and 2/3-finger undo/redo taps", () => {
    const material = createMaterialAsset({ id: "gesture-material" });
    const baseGraph = createDefaultMaterialNodeGraph(material);
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const onChange = vi.fn();

    const GestureHarness = () => {
      const [currentGraph, setCurrentGraph] = useState(baseGraph);
      const [shift, setShift] = useState(false);
      return (
        <div>
          <button type="button" data-testid="shift-on" onClick={() => setShift(true)}>
            Shift On
          </button>
          <MaterialNodeEditor
            material={material}
            graph={currentGraph}
            variant="canvas"
            screenModifiers={{ shift, ctrl: false, alt: false }}
            onBeginEdit={vi.fn()}
            onChange={(g) => {
              onChange(g);
              setCurrentGraph(g);
            }}
            onUndo={onUndo}
            onRedo={onRedo}
          />
        </div>
      );
    };

    render(<GestureHarness />);
    const viewport = screen.getByTestId("material-node-canvas-viewport");
    Object.defineProperty(viewport, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({
          left: 0,
          top: 0,
          right: 1000,
          bottom: 600,
          width: 1000,
          height: 600,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    });

    // 1. One-finger drag on empty canvas pans without cutting links
    fireEvent.pointerDown(viewport, { pointerId: 1, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 245, clientY: 230 });
    fireEvent.pointerUp(viewport, { pointerId: 1, button: 0, clientX: 245, clientY: 230 });
    expect(viewport).toHaveAttribute("data-pan-x", "45");
    expect(viewport).toHaveAttribute("data-pan-y", "30");
    expect(screen.getAllByTestId("material-node-link")).toHaveLength(1);

    // 2. Two-finger pinch zoom increases zoom cleanly without firing undo
    fireEvent.pointerDown(viewport, { pointerId: 10, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerDown(viewport, { pointerId: 11, button: 0, clientX: 300, clientY: 200 });
    fireEvent.pointerMove(viewport, { pointerId: 10, clientX: 150, clientY: 200 });
    fireEvent.pointerMove(viewport, { pointerId: 11, clientX: 350, clientY: 200 });
    fireEvent.pointerUp(viewport, { pointerId: 10, button: 0, clientX: 150, clientY: 200 });
    fireEvent.pointerUp(viewport, { pointerId: 11, button: 0, clientX: 350, clientY: 200 });
    expect(Number(viewport.getAttribute("data-zoom"))).toBeGreaterThan(1);
    expect(onUndo).not.toHaveBeenCalled();

    // 3. Two-finger tap -> Undo; Three-finger tap -> Redo
    fireEvent.pointerDown(viewport, { pointerId: 20, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerDown(viewport, { pointerId: 21, button: 0, clientX: 240, clientY: 200 });
    fireEvent.pointerUp(viewport, { pointerId: 20, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(viewport, { pointerId: 21, button: 0, clientX: 240, clientY: 200 });
    expect(onUndo).toHaveBeenCalledOnce();

    fireEvent.pointerDown(viewport, { pointerId: 30, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerDown(viewport, { pointerId: 31, button: 0, clientX: 240, clientY: 200 });
    fireEvent.pointerDown(viewport, { pointerId: 32, button: 0, clientX: 280, clientY: 200 });
    fireEvent.pointerUp(viewport, { pointerId: 30, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(viewport, { pointerId: 31, button: 0, clientX: 240, clientY: 200 });
    fireEvent.pointerUp(viewport, { pointerId: 32, button: 0, clientX: 280, clientY: 200 });
    expect(onRedo).toHaveBeenCalledOnce();

    // 4. Touching node header with Shift active moves the node instead of cutting or panning
    fireEvent.click(screen.getByTestId("shift-on"));
    const panBefore = viewport.getAttribute("data-pan-x");
    const nodeHeader = screen.getByRole("heading", { name: "Principled BSDF" }).parentElement!;
    fireEvent.pointerDown(nodeHeader, { pointerId: 40, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(nodeHeader, { pointerId: 40, clientX: 140, clientY: 120 });
    fireEvent.pointerUp(nodeHeader, { pointerId: 40, button: 0, clientX: 140, clientY: 120 });
    expect(onChange).toHaveBeenCalled();
    expect(screen.getAllByTestId("material-node-link")).toHaveLength(1);
    expect(viewport).toHaveAttribute("data-pan-x", panBefore);
  });

  it("cuts a single connection using physical keyboard Shift key while leaving other connections intact", () => {
    const material = createMaterialAsset({ id: "kb-cut-material" });
    const graph = createDefaultMaterialNodeGraph(material);
    const onChange = vi.fn();
    const onBeginEdit = vi.fn();

    const { container } = render(
      <MaterialNodeEditor
        material={material}
        graph={graph}
        variant="canvas"
        onBeginEdit={onBeginEdit}
        onChange={onChange}
      />,
    );

    const mockRect = (left: number, top: number, width: number, height: number): DOMRect =>
      ({
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
        x: left,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;

    const viewport = screen.getByTestId("material-node-canvas-viewport");
    Object.defineProperty(viewport, "getBoundingClientRect", {
      configurable: true,
      value: () => mockRect(0, 0, 1000, 600),
    });

    const outSocket = container.querySelector<HTMLElement>(
      `[data-socket-key="output:${material.id}:principled:bsdf"]`,
    )!;
    const inSocket = container.querySelector<HTMLElement>(
      `[data-socket-key="input:${material.id}:output:surface"]`,
    )!;
    Object.defineProperty(outSocket, "getBoundingClientRect", {
      configurable: true,
      value: () => mockRect(200, 200, 8, 8),
    });
    Object.defineProperty(inSocket, "getBoundingClientRect", {
      configurable: true,
      value: () => mockRect(500, 200, 8, 8),
    });

    fireEvent.click(screen.getByLabelText("Acercar el editor de nodos"));
    fireEvent.click(screen.getByLabelText("Restablecer zoom y paneo"));

    fireEvent.keyDown(window, { key: "Shift", shiftKey: true });
    expect(viewport).toHaveAttribute("data-shift-active", "true");

    fireEvent.pointerDown(viewport, {
      pointerId: 55,
      button: 0,
      shiftKey: true,
      clientX: 350,
      clientY: 140,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 55,
      shiftKey: true,
      clientX: 350,
      clientY: 260,
    });
    fireEvent.pointerUp(viewport, {
      pointerId: 55,
      button: 0,
      shiftKey: true,
      clientX: 350,
      clientY: 260,
    });

    fireEvent.keyUp(window, { key: "Shift", shiftKey: false });
    expect(viewport).toHaveAttribute("data-shift-active", "false");
    expect(onBeginEdit).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ links: [] }));
  });
});
