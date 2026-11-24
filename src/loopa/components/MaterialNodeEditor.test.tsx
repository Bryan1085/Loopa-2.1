import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
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

  it("collapses and expands a node on short header tap while keeping sockets, category color, links and drag intact", () => {
    const material = createMaterialAsset({ id: "collapse-tap-material" });
    const baseGraph = createDefaultMaterialNodeGraph(material);
    const onBeginEdit = vi.fn();
    let latestGraph = baseGraph;

    const Harness = () => {
      const [g, setG] = useState(baseGraph);
      return (
        <MaterialNodeEditor
          material={material}
          graph={g}
          variant="canvas"
          onBeginEdit={onBeginEdit}
          onChange={(next) => {
            latestGraph = next;
            setG(next);
          }}
        />
      );
    };

    render(<Harness />);
    const principledCard = screen
      .getByRole("heading", { name: "Principled BSDF" })
      .closest<HTMLElement>('[data-testid="material-node-card"]')!;
    const header = principledCard.querySelector("header")!;

    expect(principledCard).toHaveAttribute("data-collapsed", "false");
    expect(screen.getByLabelText("Color base Principled BSDF")).toBeInTheDocument();
    expect(principledCard.style.borderColor).toBeTruthy();

    // Short tap collapses without moving
    fireEvent.pointerDown(header, { pointerId: 1, button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(header, { pointerId: 1, clientX: 52, clientY: 51 });
    fireEvent.pointerUp(header, { pointerId: 1, button: 0, clientX: 52, clientY: 51 });

    expect(principledCard).toHaveAttribute("data-collapsed", "true");
    expect(latestGraph.nodes.find((n) => n.type === "principled_bsdf")?.collapsed).toBe(true);
    expect(screen.queryByLabelText("Color base Principled BSDF")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Socket de entrada Principled BSDF: Base Color")).toBeInTheDocument();
    expect(screen.getByLabelText("Socket de salida Principled BSDF: BSDF")).toBeInTheDocument();
    expect(screen.getAllByTestId("material-node-link")).toHaveLength(1);

    // Dragging header >= 6px moves node WITHOUT expanding
    fireEvent.pointerDown(header, { pointerId: 2, button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(header, { pointerId: 2, clientX: 110, clientY: 90 });
    fireEvent.pointerUp(header, { pointerId: 2, button: 0, clientX: 110, clientY: 90 });

    expect(principledCard).toHaveAttribute("data-collapsed", "true");
    expect(latestGraph.nodes.find((n) => n.type === "principled_bsdf")?.position).toEqual({
      x: 180,
      y: 160,
    });

    // Second short tap expands again and preserves all values
    fireEvent.pointerDown(header, { pointerId: 3, button: 0, clientX: 110, clientY: 90 });
    fireEvent.pointerUp(header, { pointerId: 3, button: 0, clientX: 110, clientY: 90 });

    expect(principledCard).toHaveAttribute("data-collapsed", "false");
    expect(screen.getByLabelText("Color base Principled BSDF")).toBeInTheDocument();
    expect(onBeginEdit).toHaveBeenCalledTimes(3);
  });

  it("auto-pans near viewport edges during connection drag and cancels cleanly on Escape", () => {
    const material = createMaterialAsset({ id: "autopan-material" });
    const baseGraph = createDefaultMaterialNodeGraph(material);
    const graph = {
      ...baseGraph,
      nodes: [
        ...baseGraph.nodes,
        {
          id: "math-node",
          type: "math" as const,
          position: { x: 40, y: 300 },
          values: { operation: "add", a: 0.2, b: 0.3 },
        },
      ],
    };

    const rafCallbacks: FrameRequestCallback[] = [];
    const origRaf = window.requestAnimationFrame;
    const origCancelRaf = window.cancelAnimationFrame;
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = vi.fn();

    const onChange = vi.fn();
    try {
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
      Object.defineProperty(viewport, "getBoundingClientRect", {
        configurable: true,
        value: () =>
          ({
            left: 0,
            top: 0,
            right: 800,
            bottom: 600,
            width: 800,
            height: 600,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          }) as DOMRect,
      });

      fireEvent.change(screen.getByLabelText("Velocidad de paneo automático"), {
        target: { value: "1.8" },
      });

      const outSocket = screen.getByLabelText("Socket de salida Math: Value");
      fireEvent.pointerDown(outSocket, {
        pointerId: 88,
        button: 0,
        clientX: 300,
        clientY: 320,
      });
      expect(screen.getByTestId("material-node-link-preview")).toBeInTheDocument();

      // Move near right and bottom viewport edges
      fireEvent.pointerMove(viewport, {
        pointerId: 88,
        clientX: 790,
        clientY: 590,
      });

      // Step RAF frames manually to verify auto-pan shifts pan negative on X & Y
      const panXBefore = Number(viewport.getAttribute("data-pan-x"));
      const panYBefore = Number(viewport.getAttribute("data-pan-y"));
      for (let i = 0; i < 3; i += 1) {
        const cb = rafCallbacks.shift();
        act(() => {
          cb?.(performance.now() + 16 * (i + 1));
        });
      }
      expect(Number(viewport.getAttribute("data-pan-x"))).toBeLessThan(panXBefore);
      expect(Number(viewport.getAttribute("data-pan-y"))).toBeLessThan(panYBefore);
      expect(screen.getByTestId("material-node-link-preview")).toBeInTheDocument();

      // Escape cancels drag cleanly without altering links
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByTestId("material-node-link-preview")).not.toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      window.requestAnimationFrame = origRaf;
      window.cancelAnimationFrame = origCancelRaf;
    }
  });

  it("adds and configures Noise Texture and Voronoi Texture nodes with LOOPA numeric bar controllers", () => {
    const material = createMaterialAsset({ id: "proc-ui-material" });
    const initialGraph = createDefaultMaterialNodeGraph(material);

    const Harness = () => {
      const [g, setG] = useState(initialGraph);
      return (
        <MaterialNodeEditor
          material={material}
          graph={g}
          variant="canvas"
          onBeginEdit={vi.fn()}
          onChange={setG}
        />
      );
    };

    render(<Harness />);
    const addSelect = screen.getByLabelText("Tipo de nodo para añadir");
    fireEvent.change(addSelect, { target: { value: "noise_texture" } });
    fireEvent.change(addSelect, { target: { value: "voronoi_texture" } });

    expect(screen.getByRole("heading", { name: "Noise Texture" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Voronoi Texture" })).toBeInTheDocument();

    // Switch Noise Texture to 4D so W numeric bar appears and updates
    fireEvent.change(screen.getByLabelText("Dimensiones Noise Texture"), {
      target: { value: "4D" },
    });
    expect(screen.getByLabelText("W Noise Texture")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Deslizador Escala Noise Texture"), {
      target: { value: "12.5" },
    });
    expect(screen.getByLabelText("Escala Noise Texture")).toHaveValue("12.5");

    // Switch Voronoi feature to Smooth F1 & metric to Minkowski -> conditional bars appear
    fireEvent.change(screen.getByLabelText("Característica Voronoi Texture"), {
      target: { value: "smooth_f1" },
    });
    fireEvent.change(screen.getByLabelText("Métrica Voronoi Texture"), {
      target: { value: "minkowski" },
    });
    expect(screen.getByLabelText("Suavizado Voronoi Texture")).toBeInTheDocument();
    expect(screen.getByLabelText("Exponente Voronoi Texture")).toBeInTheDocument();
  });

  it("supports double-tap and drag box selection, group move, group duplication preserving links, and group deletion", () => {
    const material = createMaterialAsset({ id: "marquee-material" });
    const baseGraph = createDefaultMaterialNodeGraph(material);
    let latestGraph = baseGraph;

    const Harness = () => {
      const [g, setG] = useState(baseGraph);
      return (
        <MaterialNodeEditor
          material={material}
          graph={g}
          variant="canvas"
          onBeginEdit={vi.fn()}
          onChange={(next) => {
            latestGraph = next;
            setG(next);
          }}
        />
      );
    };

    render(<Harness />);
    const viewport = screen.getByTestId("material-node-canvas-viewport");
    Object.defineProperty(viewport, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({
          left: 0,
          top: 0,
          right: 1200,
          bottom: 800,
          width: 1200,
          height: 800,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    });

    // First tap on empty canvas
    fireEvent.pointerDown(viewport, { pointerId: 1, button: 0, clientX: 60, clientY: 60 });
    fireEvent.pointerUp(viewport, { pointerId: 1, button: 0, clientX: 60, clientY: 60 });
    expect(viewport).toHaveAttribute("data-pan-x", "0");

    // Second tap + drag draws marquee rectangle over both nodes (at x=120..400 and x=520..800, y=120..380)
    fireEvent.pointerDown(viewport, { pointerId: 2, button: 0, clientX: 62, clientY: 62 });
    fireEvent.pointerMove(viewport, { pointerId: 2, clientX: 850, clientY: 450 });
    expect(screen.getByTestId("material-node-selection-box")).toBeInTheDocument();

    fireEvent.pointerUp(viewport, { pointerId: 2, button: 0, clientX: 850, clientY: 450 });
    expect(screen.queryByTestId("material-node-selection-box")).not.toBeInTheDocument();

    // Did not pan while box-selecting; both cards are selected and multi-selection bar shows
    expect(viewport).toHaveAttribute("data-pan-x", "0");
    const cards = screen.getAllByTestId("material-node-card");
    expect(cards.every((c) => c.getAttribute("data-selected") === "true")).toBe(true);
    expect(screen.getByTestId("material-node-multiselection-bar")).toHaveTextContent(
      "2 nodos seleccionados",
    );

    // Move both nodes together by dragging header of first node
    const header = screen.getByRole("heading", { name: "Principled BSDF" }).parentElement!;
    fireEvent.pointerDown(header, { pointerId: 3, button: 0, clientX: 140, clientY: 140 });
    fireEvent.pointerMove(header, { pointerId: 3, clientX: 190, clientY: 160 });
    fireEvent.pointerUp(header, { pointerId: 3, button: 0, clientX: 190, clientY: 160 });
    expect(latestGraph.nodes.find((n) => n.type === "principled_bsdf")?.position).toEqual({
      x: 170,
      y: 140,
    });
    expect(latestGraph.nodes.find((n) => n.type === "material_output")?.position).toEqual({
      x: 570,
      y: 140,
    });

    // Duplicate selection together -> 4 nodes and 2 links (internal link preserved between duplicates)
    fireEvent.click(screen.getByLabelText("Duplicar selección"));
    expect(latestGraph.nodes).toHaveLength(4);
    expect(latestGraph.links).toHaveLength(2);

    // Delete duplicated selection together -> back to 2 nodes and 1 link
    fireEvent.click(screen.getByLabelText("Eliminar selección"));
    expect(latestGraph.nodes).toHaveLength(2);
    expect(latestGraph.links).toHaveLength(1);
  });

  it("keeps SVG link paths anchored to socket centers under zoom, pan, and collapse/expand", () => {
    const material = createMaterialAsset({ id: "zoom-align-material" });
    const initialGraph = createDefaultMaterialNodeGraph(material);
    let latestGraph = initialGraph;

    const Harness = () => {
      const [g, setG] = useState(initialGraph);
      return (
        <MaterialNodeEditor
          material={material}
          graph={g}
          variant="canvas"
          onBeginEdit={vi.fn()}
          onChange={(next) => {
            latestGraph = next;
            setG(next);
          }}
        />
      );
    };

    const { container } = render(<Harness />);
    const viewport = screen.getByTestId("material-node-canvas-viewport");
    const plane = container.querySelector(
      'div[style*="transform: translate("]',
    ) as HTMLElement;
    expect(plane).not.toBeNull();

    Object.defineProperty(viewport, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({
          left: 40,
          top: 20,
          right: 1040,
          bottom: 720,
          width: 1000,
          height: 700,
          x: 40,
          y: 20,
          toJSON: () => ({}),
        }) as DOMRect,
    });

    // Simulate layout offset positions on socket pins relative to the node plane
    const outPin = plane.querySelector(
      '[data-socket-key$=":bsdf"]',
    ) as HTMLElement;
    const inPin = plane.querySelector(
      '[data-socket-key$=":surface"]',
    ) as HTMLElement;
    expect(outPin).not.toBeNull();
    expect(inPin).not.toBeNull();

    const assignLocalOffsets = (el: HTMLElement, left: number, top: number) => {
      Object.defineProperty(el, "offsetWidth", { configurable: true, value: 16 });
      Object.defineProperty(el, "offsetHeight", { configurable: true, value: 16 });
      Object.defineProperty(el, "offsetLeft", { configurable: true, value: left });
      Object.defineProperty(el, "offsetTop", { configurable: true, value: top });
      Object.defineProperty(el, "offsetParent", { configurable: true, value: plane });
    };

    assignLocalOffsets(outPin, 380, 180);
    assignLocalOffsets(inPin, 512, 160);

    // Zoom in and zoom out -> SVG link endpoints must stay anchored at (388, 188) -> (520, 168)
    const zoomInBtn = screen.getByLabelText("Acercar el editor de nodos");
    fireEvent.click(zoomInBtn);
    fireEvent.click(zoomInBtn);

    const linkBeforePan = screen.getByTestId("material-node-link");
    const dAtZoom = linkBeforePan.getAttribute("d") ?? "";
    expect(dAtZoom).toContain("M 388 188");
    expect(dAtZoom).toContain("520 168");

    // Pan the viewport by dragging empty space
    fireEvent.pointerDown(viewport, { pointerId: 21, button: 0, clientX: 60, clientY: 60 });
    fireEvent.pointerMove(viewport, { pointerId: 21, clientX: 190, clientY: 135 });
    fireEvent.pointerUp(viewport, { pointerId: 21, button: 0, clientX: 190, clientY: 135 });

    const dAfterPan = screen.getByTestId("material-node-link").getAttribute("d") ?? "";
    expect(dAfterPan).toBe(dAtZoom);

    // Collapse node via chevron button -> socket moves upward, path updates cleanly to new offset
    assignLocalOffsets(outPin, 380, 148);
    const collapseBtn = screen.getByLabelText("Contraer nodo Principled BSDF");
    fireEvent.click(collapseBtn);
    expect(latestGraph.nodes.find((n) => n.type === "principled_bsdf")?.collapsed).toBe(true);
    const dCollapsed = screen.getByTestId("material-node-link").getAttribute("d") ?? "";
    expect(dCollapsed).toContain("M 388 156");
    expect(dCollapsed).toContain("520 168");
  });

  it("exposes LOOPA numeric bar sliders across Math, Bump, Normal Map, Mapping, Value Integer, Mix Float, and Emission", () => {
    const material = createMaterialAsset({ id: "sliders-material" });
    const initialGraph = createDefaultMaterialNodeGraph(material);
    let latestGraph = initialGraph;

    const Harness = () => {
      const [g, setG] = useState(initialGraph);
      return (
        <MaterialNodeEditor
          material={material}
          graph={g}
          variant="canvas"
          onBeginEdit={vi.fn()}
          onChange={(next) => {
            latestGraph = next;
            setG(next);
          }}
        />
      );
    };

    render(<Harness />);
    const addSelect = screen.getByLabelText("Tipo de nodo para añadir");

    for (const type of [
      "emission",
      "math",
      "normal_map",
      "bump",
      "mapping",
      "value_integer",
      "mix_float",
    ] as const) {
      fireEvent.change(addSelect, { target: { value: type } });
    }

    fireEvent.change(screen.getByLabelText("Deslizador Fuerza Emission"), {
      target: { value: "4.25" },
    });
    expect(latestGraph.nodes.find((n) => n.type === "emission")?.values.strength).toBeCloseTo(4.25);

    fireEvent.change(screen.getByLabelText("Deslizador Valor Math A"), {
      target: { value: "0.75" },
    });
    expect(latestGraph.nodes.find((n) => n.type === "math")?.values.a).toBeCloseTo(0.75);

    fireEvent.change(screen.getByLabelText("Deslizador Intensidad Normal Map"), {
      target: { value: "1.6" },
    });
    expect(latestGraph.nodes.find((n) => n.type === "normal_map")?.values.strength).toBeCloseTo(1.6);

    fireEvent.change(screen.getByLabelText("Deslizador Bump distancia"), {
      target: { value: "0.35" },
    });
    expect(latestGraph.nodes.find((n) => n.type === "bump")?.values.distance).toBeCloseTo(0.35);

    fireEvent.change(screen.getByLabelText("Deslizador Escala X"), {
      target: { value: "2.5" },
    });
    expect(latestGraph.nodes.find((n) => n.type === "mapping")?.values.scale).toEqual([2.5, 1, 1]);

    fireEvent.change(screen.getByLabelText("Deslizador Valor Integer"), {
      target: { value: "12" },
    });
    expect(latestGraph.nodes.find((n) => n.type === "value_integer")?.values.value).toBe(12);

    fireEvent.change(screen.getByLabelText("Deslizador Factor Mix Float"), {
      target: { value: "0.8" },
    });
    expect(latestGraph.nodes.find((n) => n.type === "mix_float")?.values.factor).toBeCloseTo(0.8);
  });

  it("supports node header selection, double-tap/double-click inline rename preserving ID & links, duplicate, and delete", () => {
    const material = createMaterialAsset({ id: "header-ops-material" });
    const initialGraph = createDefaultMaterialNodeGraph(material);
    let latestGraph = initialGraph;

    const Harness = () => {
      const [g, setG] = useState(initialGraph);
      return (
        <MaterialNodeEditor
          material={material}
          graph={g}
          variant="canvas"
          onBeginEdit={vi.fn()}
          onChange={(next) => {
            latestGraph = next;
            setG(next);
          }}
        />
      );
    };

    render(<Harness />);
    const principledCard = screen
      .getByRole("heading", { name: "Principled BSDF" })
      .closest('[data-testid="material-node-card"]') as HTMLElement;
    const titleEl = screen.getByRole("heading", { name: "Principled BSDF" });
    const originalId = latestGraph.nodes[0].id;
    const originalLinksSnapshot = JSON.stringify(latestGraph.links);

    // Single tap on title selects node without collapsing it
    fireEvent.pointerDown(titleEl, { pointerId: 10, button: 0, clientX: 140, clientY: 140 });
    fireEvent.pointerUp(titleEl, { pointerId: 10, button: 0, clientX: 140, clientY: 140 });
    expect(principledCard).toHaveAttribute("data-selected", "true");
    expect(principledCard).toHaveAttribute("data-collapsed", "false");

    // Double click on title opens inline rename input
    fireEvent.doubleClick(titleEl);
    const renameInput = screen.getByTestId("material-node-rename-input") as HTMLInputElement;
    fireEvent.change(renameInput, { target: { value: "Madera Barnizada" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });

    expect(screen.getByRole("heading", { name: "Madera Barnizada" })).toBeInTheDocument();
    expect(latestGraph.nodes[0].id).toBe(originalId);
    expect(latestGraph.nodes[0].label).toBe("Madera Barnizada");
    expect(JSON.stringify(latestGraph.links)).toBe(originalLinksSnapshot);

    // Double-tap on renamed title + Escape cancels without changing label
    const renamedTitle = screen.getByRole("heading", { name: "Madera Barnizada" });
    fireEvent.pointerDown(renamedTitle, { pointerId: 11, button: 0, clientX: 140, clientY: 140 });
    fireEvent.pointerUp(renamedTitle, { pointerId: 11, button: 0, clientX: 140, clientY: 140 });
    fireEvent.pointerDown(renamedTitle, { pointerId: 12, button: 0, clientX: 141, clientY: 140 });
    fireEvent.pointerUp(renamedTitle, { pointerId: 12, button: 0, clientX: 141, clientY: 140 });

    const secondRenameInput = screen.getByTestId("material-node-rename-input");
    fireEvent.change(secondRenameInput, { target: { value: "Descartado" } });
    fireEvent.keyDown(secondRenameInput, { key: "Escape" });
    expect(screen.getByRole("heading", { name: "Madera Barnizada" })).toBeInTheDocument();
    expect(latestGraph.nodes[0].label).toBe("Madera Barnizada");

    // Chevron button collapses & expands explicitly
    fireEvent.click(screen.getByLabelText("Contraer nodo Madera Barnizada"));
    expect(principledCard).toHaveAttribute("data-collapsed", "true");
    fireEvent.click(screen.getByLabelText("Expandir nodo Madera Barnizada"));
    expect(principledCard).toHaveAttribute("data-collapsed", "false");

    // Duplicate & delete from header buttons
    fireEvent.click(screen.getByLabelText("Duplicar nodo Madera Barnizada"));
    expect(latestGraph.nodes).toHaveLength(3);
    expect(latestGraph.links).toHaveLength(1);

    const dupDeleteBtns = screen.getAllByLabelText("Eliminar nodo Madera Barnizada");
    fireEvent.click(dupDeleteBtns[1]);
    expect(latestGraph.nodes).toHaveLength(2);
    expect(latestGraph.links).toHaveLength(1);
  });

  it("supports multi-touch hold gestures for Shift (1-finger), Ctrl (2-finger), and Alt (3-finger) while suppressing Undo/Redo", () => {
    const material = createMaterialAsset({ id: "multitouch-mods-material" });
    const graph = createDefaultMaterialNodeGraph(material);
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const onEffectiveModifiersChange = vi.fn();

    vi.useFakeTimers();
    try {
      render(
        <MaterialNodeEditor
          material={material}
          graph={graph}
          variant="canvas"
          canUndo
          canRedo
          onUndo={onUndo}
          onRedo={onRedo}
          onEffectiveModifiersChange={onEffectiveModifiersChange}
          onBeginEdit={vi.fn()}
          onChange={vi.fn()}
        />,
      );

      const viewport = screen.getByTestId("material-node-canvas-viewport");

      // 1-finger empty hold >= 260ms -> Shift active & cut trail armed; clears on release
      fireEvent.pointerDown(viewport, { pointerId: 101, button: 0, clientX: 60, clientY: 60 });
      act(() => {
        vi.advanceTimersByTime(280);
      });
      expect(onEffectiveModifiersChange).toHaveBeenLastCalledWith({
        shift: true,
        ctrl: false,
        alt: false,
      });
      fireEvent.pointerUp(viewport, { pointerId: 101, button: 0, clientX: 60, clientY: 60 });
      expect(onEffectiveModifiersChange).toHaveBeenLastCalledWith({
        shift: false,
        ctrl: false,
        alt: false,
      });

      // 2-finger hold >= 260ms -> Ctrl active & suppresses 2-finger Undo
      fireEvent.pointerDown(viewport, { pointerId: 201, button: 0, clientX: 80, clientY: 80 });
      fireEvent.pointerDown(viewport, { pointerId: 202, button: 0, clientX: 120, clientY: 80 });
      act(() => {
        vi.advanceTimersByTime(280);
      });
      expect(viewport).toHaveAttribute("data-ctrl-active", "true");
      expect(onEffectiveModifiersChange).toHaveBeenLastCalledWith({
        shift: false,
        ctrl: true,
        alt: false,
      });
      fireEvent.pointerUp(viewport, { pointerId: 201, button: 0, clientX: 80, clientY: 80 });
      fireEvent.pointerUp(viewport, { pointerId: 202, button: 0, clientX: 120, clientY: 80 });
      expect(onUndo).not.toHaveBeenCalled();
      expect(viewport).toHaveAttribute("data-ctrl-active", "false");

      // 3-finger hold >= 260ms -> Alt active & suppresses 3-finger Redo
      fireEvent.pointerDown(viewport, { pointerId: 301, button: 0, clientX: 80, clientY: 80 });
      fireEvent.pointerDown(viewport, { pointerId: 302, button: 0, clientX: 120, clientY: 80 });
      fireEvent.pointerDown(viewport, { pointerId: 303, button: 0, clientX: 160, clientY: 80 });
      act(() => {
        vi.advanceTimersByTime(280);
      });
      expect(viewport).toHaveAttribute("data-alt-active", "true");
      expect(onEffectiveModifiersChange).toHaveBeenLastCalledWith({
        shift: false,
        ctrl: false,
        alt: true,
      });
      fireEvent.pointerUp(viewport, { pointerId: 301, button: 0, clientX: 80, clientY: 80 });
      fireEvent.pointerUp(viewport, { pointerId: 302, button: 0, clientX: 120, clientY: 80 });
      fireEvent.pointerUp(viewport, { pointerId: 303, button: 0, clientX: 160, clientY: 80 });
      expect(onRedo).not.toHaveBeenCalled();
      expect(viewport).toHaveAttribute("data-alt-active", "false");
    } finally {
      vi.useRealTimers();
    }
  });

  it("adds and connects the Emission shader node to Material Output in the canvas editor", () => {
    const material = createMaterialAsset({ id: "emission-ui-material" });
    const initialGraph = createDefaultMaterialNodeGraph(material);
    let latestGraph = initialGraph;

    const Harness = () => {
      const [g, setG] = useState(initialGraph);
      return (
        <MaterialNodeEditor
          material={material}
          graph={g}
          variant="canvas"
          onBeginEdit={vi.fn()}
          onChange={(next) => {
            latestGraph = next;
            setG(next);
          }}
        />
      );
    };

    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Tipo de nodo para añadir"), {
      target: { value: "emission" },
    });

    expect(screen.getByRole("heading", { name: "Emission" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Color Emission"), {
      target: { value: "#33ddff" },
    });

    // Connect Emission -> Material Output Surface via output surface selector
    const surfaceSelect = screen.getByLabelText("Material Output: Surface");
    const emissionOption = Array.from(surfaceSelect.querySelectorAll("option")).find((option) =>
      option.textContent?.includes("Emission · Emission"),
    );
    expect(emissionOption).toBeDefined();
    fireEvent.change(surfaceSelect, { target: { value: emissionOption!.value } });

    const emissionNode = latestGraph.nodes.find((n) => n.type === "emission")!;
    expect(emissionNode.values.color).toBe("#33ddff");
    expect(latestGraph.links).toContainEqual(
      expect.objectContaining({
        fromNodeId: emissionNode.id,
        fromSocket: "emission",
        toSocket: "surface",
      }),
    );
  });
});
