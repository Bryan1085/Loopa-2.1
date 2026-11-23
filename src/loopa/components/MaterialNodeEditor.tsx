import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Plus, Search, Trash2, X } from "lucide-react";
import {
  areMaterialSocketTypesCompatible,
  connectMaterialNodeSockets,
  getMaterialNodeDefinition,
  MaterialNodeDefinition,
  evaluateMaterialNodeGraph,
  getNodeCategoryColor,
  MaterialNodeCategory,
  MaterialSocketType,
} from "../core/materials/nodeGraph";
import { doesSegmentIntersectLink, Point2D } from "../core/materials/nodeLinkCut";
import {
  MaterialAsset,
  MaterialNode,
  MaterialNodeGraph,
  MaterialNodeType,
  MaterialNodeValue,
  TouchModifierState,
} from "../core/project/types";

interface MaterialNodeEditorProps {
  material: MaterialAsset;
  graph: MaterialNodeGraph;
  onChange: (graph: MaterialNodeGraph) => void;
  onBeginEdit: () => void;
  variant?: "panel" | "canvas";
  screenModifiers?: TouchModifierState;
  toolbarStart?: React.ReactNode;
  onUndo?: () => void;
  onRedo?: () => void;
}

const editableNodeTypes: MaterialNodeType[] = [
  "principled_bsdf",
  "material_output",
  "image_texture",
  "texture_coordinate",
  "mapping",
  "normal_map",
  "bump",
  "math",
  "mix_color",
  "mix_float",
  "mix_vector",
  "color_ramp",
  "transform",
  "value_float",
  "value_integer",
  "value_boolean",
  "value_color",
  "value_vector",
];

function createNodeId(graph: MaterialNodeGraph, type: MaterialNodeType): string {
  let id = `${type}-${Math.random().toString(36).slice(2, 9)}`;
  while (graph.nodes.some((node) => node.id === id)) {
    id = `${type}-${Math.random().toString(36).slice(2, 9)}`;
  }
  return id;
}

function createNode(
  graph: MaterialNodeGraph,
  type: MaterialNodeType,
  material: MaterialAsset,
): MaterialNode {
  const index = graph.nodes.length;
  const values: Record<string, MaterialNodeValue> =
    type === "material_output"
      ? {}
      : type === "principled_bsdf"
        ? {
            baseColor: material.baseColor,
            metallic: material.metallic,
            roughness: material.roughness,
            ior: 1.45,
            specular: 0.5,
            alpha: material.opacity ?? 1,
            emission: material.emissiveColor ?? "#000000",
            emissionStrength: material.emissiveIntensity ?? 0,
          }
        : type === "image_texture"
          ? { dataUrl: "", textureName: "" }
          : type === "mapping"
            ? {
                location: [0, 0, 0],
                rotation: [0, 0, 0],
                scale: [1, 1, 1],
              }
            : type === "normal_map"
              ? { strength: 1 }
              : type === "bump"
                ? { strength: 1, distance: 1 }
                : type === "math"
                  ? { operation: "add", a: 0, b: 0 }
                  : type === "mix_color"
                    ? {
                        factor: 0.5,
                        colorA: "#000000",
                        colorB: "#ffffff",
                      }
                    : type === "mix_float" || type === "mix_vector"
                      ? type === "mix_vector"
                        ? {
                            operation: "mix",
                            factor: 0.5,
                            a: [0, 0, 0],
                            b: [1, 1, 1],
                          }
                        : { operation: "mix", factor: 0.5, a: 0, b: 1 }
                      : type === "transform"
                        ? {
                            location: [0, 0, 0],
                            rotation: [0, 0, 0],
                            scale: [1, 1, 1],
                          }
                        : type === "value_float"
                          ? { value: 0.5 }
                          : type === "value_integer"
                            ? { value: 0 }
                            : type === "value_boolean"
                              ? { value: false }
                              : type === "value_color"
                                ? { value: "#ffffff" }
                                : type === "value_vector"
                                  ? { value: [0, 0, 0] }
                                  : {
                                      factor: 0.5,
                                      interpolation: "linear",
                                      stops: [
                                        { position: 0, color: "#000000", alpha: 1 },
                                        { position: 1, color: "#ffffff", alpha: 1 },
                                      ],
                                    };
  return {
    id: createNodeId(graph, type),
    type,
    position: { x: 120 + (index % 2) * 280, y: 120 + index * 160 },
    values,
  };
}

function getNodeDefinition(type: MaterialNodeType): MaterialNodeDefinition {
  return getMaterialNodeDefinition(type);
}

function getNodeDescription(type: MaterialNodeType): string {
  switch (type) {
    case "principled_bsdf":
      return "Shader PBR principal con color, rugosidad y normales.";
    case "material_output":
      return "Salida final de superficie para el material 3D.";
    case "image_texture":
      return "Carga y mapea imágenes PNG o JPEG como texturas.";
    case "texture_coordinate":
      return "Proporciona coordenadas UV y generadas.";
    case "mapping":
      return "Transforma coordenadas UV (traslación, rotación, escala).";
    case "normal_map":
      return "Convierte mapas de normales RGB en vectores.";
    case "bump":
      return "Genera normales a partir de alturas.";
    case "color_ramp":
      return "Mapea factores a gradientes de color.";
    case "math":
      return "Realiza operaciones matemáticas escalares.";
    case "mix_color":
      return "Mezcla dos colores según un factor.";
    case "mix_float":
      return "Mezcla dos flotantes según un factor.";
    case "mix_vector":
      return "Mezcla dos vectores según un factor.";
    case "transform":
      return "Transforma vectores espaciales.";
    case "value_float":
      return "Proporciona un valor flotante.";
    case "value_integer":
      return "Proporciona un valor entero.";
    case "value_boolean":
      return "Proporciona un valor booleano.";
    case "value_color":
      return "Proporciona un color constante.";
    case "value_vector":
      return "Proporciona un vector constante.";
  }
}

function getSocketKey(nodeId: string, socketId: string, direction: "input" | "output"): string {
  return `${direction}:${nodeId}:${socketId}`;
}

function getSocketColor(type: MaterialNodeDefinition["outputs"][number]["type"]): string {
  switch (type) {
    case "float":
    case "integer":
      return "#72a7ff";
    case "boolean":
      return "#e8c35a";
    case "color":
      return "#dc8bff";
    case "vector":
      return "#6edb8b";
    case "geometry":
      return "#e4e6eb";
    case "shader":
    case "material":
      return "#ff9b59";
  }
}

function cloneNodeValue(value: MaterialNodeValue): MaterialNodeValue {
  if (Array.isArray(value)) return value.map(cloneNodeValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneNodeValue(item)]),
    );
  }
  return value;
}

function ColorRampControls({
  node,
  onBeginEdit,
  onChange,
}: {
  node: MaterialNode;
  onBeginEdit: () => void;
  onChange: (values: Record<string, MaterialNodeValue>) => void;
}) {
  const rawStops = Array.isArray(node.values.stops) ? node.values.stops : [];
  const stops = rawStops.map((rawStop, index) => {
    const stop =
      rawStop !== null && typeof rawStop === "object" && !Array.isArray(rawStop) ? rawStop : {};
    const rawAlpha = Number(stop.alpha ?? 1);
    const color =
      typeof stop.color === "string" && /^#[0-9a-f]{6}$/i.test(stop.color)
        ? stop.color
        : index === 0
          ? "#000000"
          : "#ffffff";
    const rawPosition = Number(stop.position ?? index / Math.max(1, rawStops.length - 1));
    return {
      position: Number.isFinite(rawPosition)
        ? Math.max(0, Math.min(1, rawPosition))
        : index / Math.max(1, rawStops.length - 1),
      color,
      alpha: Number.isFinite(rawAlpha) ? Math.max(0, Math.min(1, rawAlpha)) : 1,
    };
  });
  const normalizedStops =
    stops.length >= 2
      ? stops
      : [
          { position: 0, color: "#000000", alpha: 1 },
          { position: 1, color: "#ffffff", alpha: 1 },
        ];
  const gradient = [...normalizedStops]
    .sort((a, b) => a.position - b.position)
    .map((stop) => `${stop.color} ${stop.position * 100}%`)
    .join(", ");

  const updateStop = (index: number, patch: Partial<(typeof normalizedStops)[number]>) => {
    onChange({
      stops: normalizedStops.map((stop, stopIndex) =>
        stopIndex === index ? { ...stop, ...patch } : stop,
      ),
    });
  };

  const addStop = () => {
    const sorted = [...normalizedStops].sort((a, b) => a.position - b.position);
    let largestGap = -1;
    let position = 0.5;
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const gap = sorted[index + 1].position - sorted[index].position;
      if (gap > largestGap) {
        largestGap = gap;
        position = (sorted[index].position + sorted[index + 1].position) / 2;
      }
    }
    onBeginEdit();
    onChange({
      stops: [...normalizedStops, { position, color: "#808080" }],
    });
  };

  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-[10px] text-[#aeb4c0]">
        Factor
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          aria-label="Factor Color Ramp"
          value={Number(node.values.factor ?? 0.5)}
          onFocus={onBeginEdit}
          onPointerDown={onBeginEdit}
          onChange={(event) => onChange({ factor: Number(event.target.value) })}
          className="h-3 w-full cursor-pointer accent-[#5ecd6e]"
        />
      </label>
      <div
        aria-label="Vista previa Color Ramp"
        className="h-4 rounded border border-[#343a46]"
        style={{ background: `linear-gradient(90deg, ${gradient})` }}
      />
      <label className="flex items-center justify-between gap-2 text-[10px] text-[#aeb4c0]">
        Interpolación
        <select
          aria-label="Interpolación Color Ramp"
          value={String(node.values.interpolation ?? "linear")}
          onFocus={onBeginEdit}
          onChange={(event) => onChange({ interpolation: event.target.value })}
          className="h-7 min-w-0 rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
        >
          <option value="linear">Lineal</option>
          <option value="ease">Suave</option>
          <option value="constant">Constante</option>
        </select>
      </label>
      <div className="space-y-1.5">
        {normalizedStops.map((stop, index) => (
          <div
            key={`${index}-${stop.position}`}
            className="grid grid-cols-[1fr_54px_54px_28px] items-center gap-1.5"
          >
            <label className="space-y-0.5 text-[9px] text-[#8e95a2]">
              Posición {index + 1}
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                aria-label={`Posición ${index + 1} Color Ramp`}
                value={stop.position}
                onFocus={onBeginEdit}
                onChange={(event) =>
                  updateStop(index, {
                    position: Math.max(0, Math.min(1, Number(event.target.value))),
                  })
                }
                className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
              />
            </label>
            <label className="space-y-0.5 text-[9px] text-[#8e95a2]">
              Color
              <input
                type="color"
                aria-label={`Color parada ${index + 1} Color Ramp`}
                value={stop.color}
                onPointerDown={onBeginEdit}
                onChange={(event) => updateStop(index, { color: event.target.value })}
                className="h-7 w-full cursor-pointer rounded border border-[#343a46] bg-[#121418] p-0.5"
              />
            </label>
            <label className="space-y-0.5 text-[9px] text-[#8e95a2]">
              Alpha
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                aria-label={`Alpha parada ${index + 1} Color Ramp`}
                value={stop.alpha}
                onFocus={onBeginEdit}
                onChange={(event) =>
                  updateStop(index, {
                    alpha: Math.max(0, Math.min(1, Number(event.target.value))),
                  })
                }
                className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1 text-[10px] text-[#cbd5e1]"
              />
            </label>
            <button
              type="button"
              aria-label={`Eliminar parada ${index + 1} Color Ramp`}
              disabled={normalizedStops.length <= 2}
              onClick={() => {
                onBeginEdit();
                onChange({
                  stops: normalizedStops.filter((_, stopIndex) => stopIndex !== index),
                });
              }}
              className="mt-4 flex h-7 w-7 items-center justify-center rounded text-[#8e95a2] hover:bg-[#292e38] hover:text-[#ff8c8c] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        aria-label="Agregar parada Color Ramp"
        onClick={addStop}
        className="flex h-7 w-full items-center justify-center gap-1 rounded border border-[#343a46] bg-[#181b22] text-[10px] text-[#cbd5e1] hover:border-[#5ecd6e]"
      >
        <Plus aria-hidden="true" className="h-3 w-3" />
        Agregar parada
      </button>
    </div>
  );
}

export const MaterialNodeEditor: React.FC<MaterialNodeEditorProps> = ({
  material,
  graph,
  onChange,
  onBeginEdit,
  variant = "panel",
  screenModifiers,
  toolbarStart,
  onUndo,
  onRedo,
}) => {
  const evaluation = useMemo(() => evaluateMaterialNodeGraph(graph, material), [graph, material]);
  const [fileError, setFileError] = useState("");
  const [dragPositions, setDragPositions] = useState<Record<
    string,
    { x: number; y: number }
  > | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(() => new Set());
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [spacePressed, setSpacePressed] = useState(false);
  const [physicalModifiers, setPhysicalModifiers] = useState<TouchModifierState>({
    shift: false,
    ctrl: false,
    alt: false,
  });
  const [connectionError, setConnectionError] = useState("");
  const [spawnPopup, setSpawnPopup] = useState<{
    fromNodeId: string;
    fromSocket: string;
    direction: "output" | "input";
    socketType: MaterialSocketType;
    canvasPos: Point2D;
  } | null>(null);
  const [spawnSearchQuery, setSpawnSearchQuery] = useState("");
  const headerPressRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTime: number;
    nodeId: string;
  } | null>(null);

  const spawnAndConnectNode = (nodeType: MaterialNodeType) => {
    if (!spawnPopup) return;
    onBeginEdit();
    const newNode = createNode(graph, nodeType, material);
    newNode.position = {
      x: Math.max(20, spawnPopup.canvasPos.x - 140),
      y: Math.max(20, spawnPopup.canvasPos.y - 60),
    };
    const newDef = getNodeDefinition(nodeType);
    const targetInput =
      spawnPopup.direction === "output"
        ? newDef.inputs.find((inp) => areMaterialSocketTypesCompatible(spawnPopup.socketType, inp.type)) ?? newDef.inputs[0]
        : null;
    const targetOutput =
      spawnPopup.direction === "input"
        ? newDef.outputs.find((outp) => areMaterialSocketTypesCompatible(outp.type, spawnPopup.socketType)) ?? newDef.outputs[0]
        : null;

    let nextGraph: MaterialNodeGraph = {
      ...graph,
      nodes: [...graph.nodes, newNode],
    };

    if (spawnPopup.direction === "output" && targetInput) {
      const connected = connectMaterialNodeSockets(
        nextGraph,
        spawnPopup.fromNodeId,
        spawnPopup.fromSocket,
        newNode.id,
        targetInput.id,
      );
      if (connected) nextGraph = connected;
    } else if (spawnPopup.direction === "input" && targetOutput) {
      const connected = connectMaterialNodeSockets(
        nextGraph,
        newNode.id,
        targetOutput.id,
        spawnPopup.fromNodeId,
        spawnPopup.fromSocket,
      );
      if (connected) nextGraph = connected;
    }

    onChange(nextGraph);
    setSpawnPopup(null);
    setSpawnSearchQuery("");
  };
  const [connectionDrag, setConnectionDrag] = useState<{
    fromNodeId: string;
    fromSocket: string;
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const [cutTrail, setCutTrail] = useState<Point2D[] | null>(null);
  const [cutFlashes, setCutFlashes] = useState<
    Array<{
      id: string;
      x: number;
      y: number;
      startX: number;
      startY: number;
      endX: number;
      endY: number;
    }>
  >([]);
  const [socketPositions, setSocketPositions] = useState<Record<string, { x: number; y: number }>>(
    {},
  );
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const nodePlaneRef = useRef<HTMLDivElement | null>(null);
  const latestGraphRef = useRef(graph);
  latestGraphRef.current = graph;
  const socketPositionsRef = useRef(socketPositions);
  socketPositionsRef.current = socketPositions;
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const physicalModifiersRef = useRef(physicalModifiers);
  physicalModifiersRef.current = physicalModifiers;
  const screenModifiersRef = useRef(screenModifiers);
  screenModifiersRef.current = screenModifiers;
  const activePointersRef = useRef(new Map<number, { clientX: number; clientY: number }>());
  const multiTouchRef = useRef<{
    maxCount: number;
    startTime: number;
    prevMid: Point2D;
    prevDist: number;
    totalMidMovement: number;
    totalPinchChange: number;
  } | null>(null);
  const cutStrokeRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    lastCanvasPoint: Point2D;
    points: Point2D[];
    historyPushed: boolean;
    cutLinkIds: Set<string>;
    pendingFromNodeBody: boolean;
  } | null>(null);
  const flashTimersRef = useRef<number[]>([]);
  const navigationRef = useRef<{
    pointerId: number;
    pointerX: number;
    pointerY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const dragStateRef = useRef<{
    nodeIds: string[];
    pointerId: number;
    pointerX: number;
    pointerY: number;
    positions: Record<string, { x: number; y: number }>;
    moved: boolean;
  } | null>(null);
  const connectionDragRef = useRef<typeof connectionDrag>(null);
  const isCanvas = variant === "canvas";
  const effectiveShift = physicalModifiers.shift || Boolean(screenModifiers?.shift);
  const effectiveCtrl = physicalModifiers.ctrl || Boolean(screenModifiers?.ctrl);

  useEffect(() => {
    if (!isCanvas) return;
    const syncModifiers = (event: KeyboardEvent) => {
      setPhysicalModifiers({
        shift: event.shiftKey,
        ctrl: event.ctrlKey || event.metaKey,
        alt: event.altKey,
      });
    };
    const clearModifiers = () => {
      setPhysicalModifiers({ shift: false, ctrl: false, alt: false });
      setSpacePressed(false);
    };
    window.addEventListener("keydown", syncModifiers);
    window.addEventListener("keyup", syncModifiers);
    window.addEventListener("blur", clearModifiers);
    return () => {
      window.removeEventListener("keydown", syncModifiers);
      window.removeEventListener("keyup", syncModifiers);
      window.removeEventListener("blur", clearModifiers);
    };
  }, [isCanvas]);

  useEffect(() => {
    return () => {
      for (const timer of flashTimersRef.current) {
        window.clearTimeout(timer);
      }
      flashTimersRef.current = [];
    };
  }, []);

  const getNodePosition = useCallback(
    (node: MaterialNode) => dragPositions?.[node.id] ?? node.position,
    [dragPositions],
  );

  const canvasSize = useMemo(
    () =>
      graph.nodes.reduce(
        (size, node) => {
          const position = getNodePosition(node);
          return {
            width: Math.max(size.width, position.x + 340),
            height: Math.max(size.height, position.y + 380),
          };
        },
        { width: 900, height: 620 },
      ),
    [getNodePosition, graph.nodes],
  );

  const measureSocketPositions = useCallback(() => {
    const viewport = canvasViewportRef.current;
    const plane = nodePlaneRef.current;
    if (!viewport || !plane) return;
    const viewportRect = viewport.getBoundingClientRect();
    const next: Record<string, { x: number; y: number }> = {};
    plane.querySelectorAll<HTMLElement>("[data-socket-key]").forEach((element) => {
      const key = element.dataset.socketKey;
      if (!key) return;
      const rect = element.getBoundingClientRect();
      next[key] = {
        x: (rect.left + rect.width / 2 - viewportRect.left - pan.x) / zoom,
        y: (rect.top + rect.height / 2 - viewportRect.top - pan.y) / zoom,
      };
    });
    setSocketPositions((current) => {
      const keys = Object.keys(next);
      if (
        keys.length === Object.keys(current).length &&
        keys.every(
          (key) =>
            current[key] &&
            Math.abs(current[key].x - next[key].x) < 0.5 &&
            Math.abs(current[key].y - next[key].y) < 0.5,
        )
      ) {
        return current;
      }
      return next;
    });
  }, [pan.x, pan.y, zoom]);

  useLayoutEffect(() => {
    if (!isCanvas) return;
    measureSocketPositions();
  }, [
    canvasSize.height,
    canvasSize.width,
    dragPositions,
    graph.links,
    graph.nodes,
    isCanvas,
    measureSocketPositions,
  ]);

  useEffect(() => {
    if (!isCanvas || !canvasViewportRef.current || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measureSocketPositions);
    observer.observe(canvasViewportRef.current);
    return () => observer.disconnect();
  }, [isCanvas, measureSocketPositions]);

  const clientToCanvas = useCallback((clientX: number, clientY: number) => {
    const bounds = canvasViewportRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: (clientX - bounds.left - panRef.current.x) / zoomRef.current,
      y: (clientY - bounds.top - panRef.current.y) / zoomRef.current,
    };
  }, []);

  const updateNode = (nodeId: string, values: Record<string, MaterialNodeValue>) => {
    onChange({
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === nodeId ? { ...node, values: { ...node.values, ...values } } : node,
      ),
    });
  };

  const setInputLink = (node: MaterialNode, socketId: string, source: string) => {
    const remaining = graph.links.filter(
      (link) => link.toNodeId !== node.id || link.toSocket !== socketId,
    );
    if (!source) {
      onBeginEdit();
      setConnectionError("");
      onChange({ ...graph, links: remaining });
      return;
    }
    const [fromNodeId, fromSocket] = source.split("::");
    const next = connectMaterialNodeSockets(
      { ...graph, links: remaining },
      fromNodeId,
      fromSocket,
      node.id,
      socketId,
    );
    if (!next) {
      setConnectionError("La conexión no es compatible o produciría un ciclo.");
      return;
    }
    onBeginEdit();
    setConnectionError("");
    onChange(next);
  };

  const connectToSocket = (
    fromNodeId: string,
    fromSocket: string,
    toNodeId: string,
    toSocket: string,
  ) => {
    const next = connectMaterialNodeSockets(graph, fromNodeId, fromSocket, toNodeId, toSocket);
    if (!next) {
      setConnectionError("La conexión no es compatible o produciría un ciclo.");
      return;
    }
    onBeginEdit();
    setConnectionError("");
    onChange(next);
  };

  const addNode = (type: MaterialNodeType) => {
    onBeginEdit();
    onChange({
      ...graph,
      nodes: [...graph.nodes, createNode(graph, type, material)],
    });
  };

  const removeNode = (nodeId: string) => {
    onBeginEdit();
    onChange({
      ...graph,
      nodes: graph.nodes.filter((node) => node.id !== nodeId),
      links: graph.links.filter((link) => link.fromNodeId !== nodeId && link.toNodeId !== nodeId),
    });
    setSelectedNodeIds((current) => {
      const next = new Set(current);
      next.delete(nodeId);
      return next;
    });
  };

  const duplicateNode = (node: MaterialNode) => {
    onBeginEdit();
    const duplicate: MaterialNode = {
      ...node,
      id: createNodeId(graph, node.type),
      position: { x: node.position.x + 36, y: node.position.y + 36 },
      values: Object.fromEntries(
        Object.entries(node.values).map(([key, value]) => [key, cloneNodeValue(value)]),
      ),
    };
    onChange({ ...graph, nodes: [...graph.nodes, duplicate] });
  };

  const startNodeDrag = (event: React.PointerEvent<HTMLElement>, node: MaterialNode) => {
    if (!isCanvas || event.button !== 0) return;
    if (event.target instanceof HTMLElement && event.target.closest("button")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    headerPressRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: Date.now(),
      nodeId: node.id,
    };
    const preserveSelection =
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      effectiveShift ||
      effectiveCtrl;
    const nextSelection =
      selectedNodeIds.has(node.id) || preserveSelection
        ? new Set([...selectedNodeIds, node.id])
        : new Set([node.id]);
    const nodeIds = [...nextSelection];
    if (
      !selectedNodeIds.has(node.id) ||
      (!preserveSelection && nodeIds.length !== selectedNodeIds.size)
    ) {
      setSelectedNodeIds(nextSelection);
    }
    const positions = Object.fromEntries(
      graph.nodes
        .filter((item) => nodeIds.includes(item.id))
        .map((item) => [item.id, getNodePosition(item)]),
    );
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStateRef.current = {
      nodeIds,
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      positions,
      moved: false,
    };
  };

  const moveNodeDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.moved = true;
    const deltaX = (event.clientX - drag.pointerX) / zoom;
    const deltaY = (event.clientY - drag.pointerY) / zoom;
    setDragPositions(
      Object.fromEntries(
        drag.nodeIds.map((nodeId) => [
          nodeId,
          {
            x: drag.positions[nodeId].x + deltaX,
            y: drag.positions[nodeId].y + deltaY,
          },
        ]),
      ),
    );
  };

  const finishNodeDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved && dragPositions) {
      onBeginEdit();
      onChange({
        ...graph,
        nodes: graph.nodes.map((node) =>
          drag.nodeIds.includes(node.id) && dragPositions[node.id]
            ? {
                ...node,
                position: dragPositions[node.id],
              }
            : node,
        ),
      });
    } else {
      const hp = headerPressRef.current;
      if (hp && hp.pointerId === event.pointerId) {
        const movedPx = Math.hypot(event.clientX - hp.startX, event.clientY - hp.startY);
        const duration = Date.now() - hp.startTime;
        if (movedPx < 6 && duration < 350) {
          onBeginEdit();
          const currNode = graph.nodes.find((n) => n.id === hp.nodeId);
          const isCollapsed = Boolean(currNode?.collapsed);
          updateNode(hp.nodeId, { collapsed: !isCollapsed });
        }
        headerPressRef.current = null;
      }
    }
    dragStateRef.current = null;
    setDragPositions(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const startConnectionDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    node: MaterialNode,
    socketId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const point = clientToCanvas(event.clientX, event.clientY);
    const next = {
      fromNodeId: node.id,
      fromSocket: socketId,
      pointerId: event.pointerId,
      ...point,
    };
    connectionDragRef.current = next;
    setConnectionDrag(next);
    setConnectionError("");
    canvasViewportRef.current?.setPointerCapture?.(event.pointerId);
  };

  const isShiftActiveForEvent = (event?: { shiftKey?: boolean }) =>
    Boolean(event?.shiftKey) ||
    physicalModifiersRef.current.shift ||
    Boolean(screenModifiersRef.current?.shift);

  const spawnCutFlash = (
    hitPoint: Point2D,
    start: Point2D,
    end: Point2D,
  ) => {
    const id = `cut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setCutFlashes((prev) => [
      ...prev,
      {
        id,
        x: hitPoint.x,
        y: hitPoint.y,
        startX: start.x,
        startY: start.y,
        endX: end.x,
        endY: end.y,
      },
    ]);
    const timer = window.setTimeout(() => {
      setCutFlashes((prev) => prev.filter((item) => item.id !== id));
    }, 420);
    flashTimersRef.current.push(timer);
  };

  const cutLinksAlongSegment = (segStart: Point2D, segEnd: Point2D) => {
    const stroke = cutStrokeRef.current;
    if (!stroke) return;
    const currentGraph = latestGraphRef.current;
    const sockets = socketPositionsRef.current;
    const tolerance = Math.max(10, 14 / zoomRef.current);
    const hitLinks: Array<{
      id: string;
      hitPoint: Point2D;
      start: Point2D;
      end: Point2D;
    }> = [];

    for (const link of currentGraph.links) {
      if (stroke.cutLinkIds.has(link.id)) continue;
      const start = sockets[getSocketKey(link.fromNodeId, link.fromSocket, "output")];
      const end = sockets[getSocketKey(link.toNodeId, link.toSocket, "input")];
      if (!start || !end) continue;
      const result = doesSegmentIntersectLink(segStart, segEnd, start, end, tolerance);
      if (result.hit) {
        hitLinks.push({
          id: link.id,
          hitPoint: result.hitPoint ?? {
            x: (segStart.x + segEnd.x) / 2,
            y: (segStart.y + segEnd.y) / 2,
          },
          start,
          end,
        });
      }
    }

    if (hitLinks.length === 0) return;

    if (!stroke.historyPushed) {
      stroke.historyPushed = true;
      onBeginEdit();
    }

    const removedIds = new Set(hitLinks.map((item) => item.id));
    for (const item of hitLinks) {
      stroke.cutLinkIds.add(item.id);
      spawnCutFlash(item.hitPoint, item.start, item.end);
    }

    const nextGraph: MaterialNodeGraph = {
      ...currentGraph,
      links: currentGraph.links.filter((link) => !removedIds.has(link.id)),
    };
    latestGraphRef.current = nextGraph;
    onChange(nextGraph);
  };

  const startCanvasPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isCanvas) return;
    const target = event.target as HTMLElement;
    const isInteractiveControl = Boolean(target.closest("button, input, select, textarea"));
    const isNodeCard = Boolean(target.closest("[data-node-card]"));
    const shiftActive = isShiftActiveForEvent(event);

    if (isInteractiveControl) return;
    if (
      isNodeCard &&
      !spacePressed &&
      !shiftActive &&
      activePointersRef.current.size === 0
    ) {
      return;
    }
    if (event.button !== 0 && event.button !== 1) return;

    activePointersRef.current.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });

    if (activePointersRef.current.size >= 2) {
      navigationRef.current = null;
      if (cutStrokeRef.current) {
        cutStrokeRef.current = null;
        setCutTrail(null);
      }
      const pts = Array.from(activePointersRef.current.values());
      const prevMid: Point2D = {
        x: (pts[0].clientX + pts[1].clientX) / 2,
        y: (pts[0].clientY + pts[1].clientY) / 2,
      };
      const prevDist = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
      multiTouchRef.current = {
        maxCount: Math.max(multiTouchRef.current?.maxCount ?? 0, activePointersRef.current.size),
        startTime: multiTouchRef.current?.startTime ?? Date.now(),
        prevMid,
        prevDist,
        totalMidMovement: multiTouchRef.current?.totalMidMovement ?? 0,
        totalPinchChange: multiTouchRef.current?.totalPinchChange ?? 0,
      };
      event.preventDefault();
      return;
    }

    if (multiTouchRef.current) return;

    if (shiftActive && !spacePressed && event.button === 0) {
      const point = clientToCanvas(event.clientX, event.clientY);
      if (!isNodeCard) {
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      cutStrokeRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        lastCanvasPoint: point,
        points: [point],
        historyPushed: false,
        cutLinkIds: new Set(),
        pendingFromNodeBody: isNodeCard,
      };
      if (!isNodeCard) {
        setCutTrail([point]);
      }
      return;
    }

    if (isNodeCard && !spacePressed) return;

    event.preventDefault();
    if (!spacePressed && !shiftActive && !effectiveCtrl && !event.ctrlKey && !event.metaKey) {
      setSelectedNodeIds(new Set());
    }
    navigationRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveCanvasPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
    }

    if (activePointersRef.current.size >= 2 && multiTouchRef.current) {
      if (activePointersRef.current.size === 2) {
        const pts = Array.from(activePointersRef.current.values());
        const mid: Point2D = {
          x: (pts[0].clientX + pts[1].clientX) / 2,
          y: (pts[0].clientY + pts[1].clientY) / 2,
        };
        const dist = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
        const mt = multiTouchRef.current;
        const dMid = Math.hypot(mid.x - mt.prevMid.x, mid.y - mt.prevMid.y);
        const dDist = Math.abs(dist - mt.prevDist);
        mt.totalMidMovement += dMid;
        mt.totalPinchChange += dDist;

        if (mt.totalMidMovement > 8 || mt.totalPinchChange > 8) {
          const bounds = event.currentTarget.getBoundingClientRect();
          const prevZoom = zoomRef.current;
          const prevPan = panRef.current;
          const factor = mt.prevDist > 10 ? dist / mt.prevDist : 1;
          const nextZoom = Math.min(3, Math.max(0.25, prevZoom * factor));
          const canvasMidX = (mt.prevMid.x - bounds.left - prevPan.x) / prevZoom;
          const canvasMidY = (mt.prevMid.y - bounds.top - prevPan.y) / prevZoom;
          const nextPan = {
            x: mid.x - bounds.left - canvasMidX * nextZoom,
            y: mid.y - bounds.top - canvasMidY * nextZoom,
          };
          panRef.current = nextPan;
          zoomRef.current = nextZoom;
          setPan(nextPan);
          setZoom(nextZoom);
        }

        mt.prevMid = mid;
        mt.prevDist = dist;
      }
      return;
    }

    const cut = cutStrokeRef.current;
    if (cut?.pointerId === event.pointerId) {
      if (cut.pendingFromNodeBody) {
        const movedPx = Math.hypot(
          event.clientX - cut.startClientX,
          event.clientY - cut.startClientY,
        );
        if (movedPx < 6) return;
        cut.pendingFromNodeBody = false;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      const nextPoint = clientToCanvas(event.clientX, event.clientY);
      cut.points.push(nextPoint);
      setCutTrail([...cut.points]);
      cutLinksAlongSegment(cut.lastCanvasPoint, nextPoint);
      cut.lastCanvasPoint = nextPoint;
      return;
    }

    const navigation = navigationRef.current;
    if (navigation?.pointerId === event.pointerId) {
      const nextPan = {
        x: navigation.panX + event.clientX - navigation.pointerX,
        y: navigation.panY + event.clientY - navigation.pointerY,
      };
      panRef.current = nextPan;
      setPan(nextPan);
    }
    const connection = connectionDragRef.current;
    if (connection?.pointerId === event.pointerId) {
      const point = clientToCanvas(event.clientX, event.clientY);
      setConnectionDrag({ ...connection, ...point });
    }
  };

  const finishCanvasPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);

    const cut = cutStrokeRef.current;
    if (cut?.pointerId === event.pointerId) {
      if (!cut.pendingFromNodeBody) {
        const movedPx = Math.hypot(
          event.clientX - cut.startClientX,
          event.clientY - cut.startClientY,
        );
        if (movedPx < 6) {
          cutLinksAlongSegment(cut.lastCanvasPoint, cut.lastCanvasPoint);
        }
      }
      cutStrokeRef.current = null;
      setCutTrail(null);
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    if (navigationRef.current?.pointerId === event.pointerId) {
      navigationRef.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    const mt = multiTouchRef.current;
    if (mt && activePointersRef.current.size === 0) {
      const duration = Date.now() - mt.startTime;
      const totalMotion = mt.totalMidMovement + mt.totalPinchChange;
      multiTouchRef.current = null;
      if (mt.maxCount === 2 && totalMotion < 14 && duration < 450) {
        onUndo?.();
      } else if (mt.maxCount >= 3 && totalMotion < 18 && duration < 500) {
        onRedo?.();
      }
    }

    const connection = connectionDragRef.current;
    if (connection?.pointerId !== event.pointerId) return;
    const element = document.elementFromPoint?.(event.clientX, event.clientY);
    const pointerTarget =
      element instanceof HTMLElement
        ? element.closest<HTMLElement>("[data-node-input-socket]")
        : null;
    const eventTarget =
      event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>("[data-node-input-socket]")
        : null;
    const target = pointerTarget ?? eventTarget;
    if (target?.dataset.nodeId && target.dataset.socketId) {
      connectToSocket(
        connection.fromNodeId,
        connection.fromSocket,
        target.dataset.nodeId,
        target.dataset.socketId,
      );
    } else {
      const fromNode = graph.nodes.find((n) => n.id === connection.fromNodeId);
      if (fromNode) {
        const fromDef = getNodeDefinition(fromNode.type);
        const outSocket = fromDef.outputs.find((o) => o.id === connection.fromSocket);
        const inSocket = fromDef.inputs.find((i) => i.id === connection.fromSocket);
        const socketType = outSocket?.type ?? inSocket?.type;
        const direction = outSocket ? "output" : "input";
        if (socketType) {
          const canvasPos = clientToCanvas(event.clientX, event.clientY);
          setSpawnPopup({
            fromNodeId: connection.fromNodeId,
            fromSocket: connection.fromSocket,
            direction,
            socketType,
            canvasPos,
          });
        }
      }
    }
    connectionDragRef.current = null;
    setConnectionDrag(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const cancelCanvasPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);
    if (activePointersRef.current.size === 0) {
      multiTouchRef.current = null;
    }
    if (cutStrokeRef.current?.pointerId === event.pointerId) {
      cutStrokeRef.current = null;
      setCutTrail(null);
    }
    if (navigationRef.current?.pointerId === event.pointerId) {
      navigationRef.current = null;
    }
    if (connectionDragRef.current?.pointerId === event.pointerId) {
      connectionDragRef.current = null;
      setConnectionDrag(null);
    }
  };

  const handleCanvasWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!isCanvas) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const pointerX = event.clientX - bounds.left;
      const pointerY = event.clientY - bounds.top;
      const nextZoom = Math.min(3, Math.max(0.25, zoom * Math.exp(-event.deltaY * 0.001)));
      setPan({
        x: pointerX - ((pointerX - pan.x) / zoom) * nextZoom,
        y: pointerY - ((pointerY - pan.y) / zoom) * nextZoom,
      });
      setZoom(nextZoom);
      return;
    }
    setPan((current) => ({
      x: current.x - event.deltaX,
      y: current.y - event.deltaY,
    }));
  };

  const zoomBy = (amount: number) => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    const bounds = viewport.getBoundingClientRect();
    const pointX = bounds.width / 2;
    const pointY = bounds.height / 2;
    const nextZoom = Math.min(3, Math.max(0.25, zoom + amount));
    setPan({
      x: pointX - ((pointX - pan.x) / zoom) * nextZoom,
      y: pointY - ((pointY - pan.y) / zoom) * nextZoom,
    });
    setZoom(nextZoom);
  };

  const selectNode = (event: React.MouseEvent<HTMLElement>, nodeId: string) => {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("button, input, select, textarea")
    ) {
      return;
    }
    if (
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      effectiveShift ||
      effectiveCtrl
    ) {
      setSelectedNodeIds((current) => {
        const next = new Set(current);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
      });
    } else {
      setSelectedNodeIds(new Set([nodeId]));
    }
  };

  const handleCanvasKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === " ") {
      event.preventDefault();
      setSpacePressed(true);
    }
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      selectedNodeIds.size > 0 &&
      !(event.target instanceof HTMLElement && event.target.closest("input, select, textarea"))
    ) {
      event.preventDefault();
      onBeginEdit();
      const removedIds = selectedNodeIds;
      onChange({
        ...graph,
        nodes: graph.nodes.filter((node) => !removedIds.has(node.id)),
        links: graph.links.filter(
          (link) => !removedIds.has(link.fromNodeId) && !removedIds.has(link.toNodeId),
        ),
      });
      setSelectedNodeIds(new Set());
    }
  };

  const addNodeSelect = (
    <label className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="sr-only">Añadir nodo</span>
      <select
        aria-label="Tipo de nodo para añadir"
        defaultValue=""
        onChange={(event) => {
          const type = event.target.value as MaterialNodeType;
          if (type) addNode(type);
          event.currentTarget.value = "";
        }}
        className="h-8 min-w-0 flex-1 rounded border border-[#2f3440] bg-[#181b22] px-2 text-[10px] text-[#cbd5e1] outline-none focus:border-[#5ecd6e]"
      >
        <option value="">Añadir nodo…</option>
        {(
          [
            ["input", "Entradas"],
            ["shader", "Shader"],
            ["texture", "Texturas"],
            ["color", "Color"],
            ["vector", "Vectores"],
            ["output", "Salidas"],
          ] as const
        ).map(([category, label]) => {
          const definitions = editableNodeTypes
            .map(getNodeDefinition)
            .filter((definition) => definition.category === category);
          if (definitions.length === 0) return null;
          return (
            <optgroup key={category} label={label}>
              {definitions.map((definition) => (
                <option key={definition.id} value={definition.id}>
                  {definition.label}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
      <Plus aria-hidden="true" className="h-4 w-4 shrink-0 text-[#5ecd6e]" />
    </label>
  );

  const canvasViewportContent = (
    <div
      ref={isCanvas ? canvasViewportRef : undefined}
      data-testid={isCanvas ? "material-node-canvas-viewport" : undefined}
      data-zoom={isCanvas ? zoom : undefined}
      data-pan-x={isCanvas ? pan.x : undefined}
      data-pan-y={isCanvas ? pan.y : undefined}
      data-shift-active={isCanvas && effectiveShift ? "true" : "false"}
      tabIndex={isCanvas ? 0 : undefined}
      onPointerDown={isCanvas ? startCanvasPointer : undefined}
      onPointerMove={isCanvas ? moveCanvasPointer : undefined}
      onPointerUp={isCanvas ? finishCanvasPointer : undefined}
      onPointerCancel={isCanvas ? cancelCanvasPointer : undefined}
      onWheel={isCanvas ? handleCanvasWheel : undefined}
      onKeyDown={isCanvas ? handleCanvasKeyDown : undefined}
      onKeyUp={
        isCanvas
          ? (event) => {
              if (event.key === " ") setSpacePressed(false);
            }
          : undefined
      }
      onBlur={isCanvas ? () => setSpacePressed(false) : undefined}
      style={
        isCanvas
          ? {
              backgroundImage:
                "radial-gradient(circle, rgba(174,180,192,0.22) 1px, transparent 1px)",
              backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
              backgroundPosition: `${pan.x}px ${pan.y}px`,
            }
          : undefined
      }
      className={
        isCanvas
          ? `relative h-full min-h-0 w-full flex-1 overflow-hidden outline-none touch-none ${
              effectiveShift ? "cursor-crosshair" : ""
            }`
          : "space-y-2"
      }
    >
      <div
        ref={isCanvas ? nodePlaneRef : undefined}
        className={isCanvas ? "relative" : "space-y-2"}
        style={
          isCanvas
            ? {
                width: canvasSize.width,
                height: canvasSize.height,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                willChange: "transform",
              }
            : undefined
        }
      >
        {isCanvas && (
          <svg
            aria-label="Conexiones entre nodos"
            data-testid="material-node-links"
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={canvasSize.width}
            height={canvasSize.height}
          >
            {graph.links.map((link) => {
              const start =
                socketPositions[getSocketKey(link.fromNodeId, link.fromSocket, "output")];
              const end = socketPositions[getSocketKey(link.toNodeId, link.toSocket, "input")];
              if (!start || !end) return null;
              const startX = start.x;
              const startY = start.y;
              const endX = end.x;
              const endY = end.y;
              const curve = Math.max(48, Math.abs(endX - startX) * 0.45);
              return (
                <path
                  key={link.id}
                  data-testid="material-node-link"
                  d={`M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`}
                  fill="none"
                  stroke="#5ecd6e"
                  strokeWidth="2"
                />
              );
            })}
            {cutFlashes.map((flash) => {
              const curve = Math.max(48, Math.abs(flash.endX - flash.startX) * 0.45);
              return (
                <g key={flash.id} data-testid="material-node-cut-feedback">
                  <path
                    d={`M ${flash.startX} ${flash.startY} C ${flash.startX + curve} ${flash.startY}, ${flash.endX - curve} ${flash.endY}, ${flash.endX} ${flash.endY}`}
                    fill="none"
                    stroke="#f87171"
                    strokeOpacity="0.65"
                    strokeDasharray="6 4"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx={flash.x}
                    cy={flash.y}
                    r={8}
                    fill="#f87171"
                    fillOpacity="0.25"
                    stroke="#f87171"
                    strokeWidth="2"
                  />
                </g>
              );
            })}
            {cutTrail && cutTrail.length > 0 && (
              <path
                data-testid="material-node-cut-trail"
                d={cutTrail
                  .map((pt, index) => `${index === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
                  .join(" ")}
                fill="none"
                stroke="#f87171"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="6 4"
              />
            )}
            {connectionDrag && (
              <path
                data-testid="material-node-link-preview"
                d={`M ${socketPositions[getSocketKey(connectionDrag.fromNodeId, connectionDrag.fromSocket, "output")]?.x ?? connectionDrag.x} ${socketPositions[getSocketKey(connectionDrag.fromNodeId, connectionDrag.fromSocket, "output")]?.y ?? connectionDrag.y} C ${connectionDrag.x + 48} ${socketPositions[getSocketKey(connectionDrag.fromNodeId, connectionDrag.fromSocket, "output")]?.y ?? connectionDrag.y}, ${connectionDrag.x - 48} ${connectionDrag.y}, ${connectionDrag.x} ${connectionDrag.y}`}
                fill="none"
                stroke="#f6c453"
                strokeDasharray="5 4"
                strokeWidth="2"
              />
            )}
          </svg>
        )}
          {graph.nodes.map((node) => {
            const definition = getNodeDefinition(node.type);
            const position = getNodePosition(node);
            const categoryColor = getNodeCategoryColor(definition.category);
            const isCollapsed = Boolean(node.collapsed);
            return (
              <section
                key={node.id}
                aria-label={definition.label}
                onClick={(event) => selectNode(event, node.id)}
                data-testid="material-node-card"
                data-node-card="true"
                data-node-id={node.id}
                data-selected={selectedNodeIds.has(node.id) ? "true" : "false"}
                tabIndex={isCanvas ? 0 : undefined}
                className={`space-y-2 rounded-md border bg-[#181b22] p-2 ${
                  selectedNodeIds.has(node.id)
                    ? "ring-2 ring-[#5ecd6e]"
                    : "border-[#323846]"
                } ${isCanvas ? "absolute w-[280px] shadow-lg" : ""}`}
                style={{
                  ...(isCanvas ? { left: position.x, top: position.y } : {}),
                  borderColor: categoryColor,
                  borderLeftWidth: "4px",
                }}
              >
                <header
                  onPointerDown={(event) => startNodeDrag(event, node)}
                  onPointerMove={moveNodeDrag}
                  onPointerUp={finishNodeDrag}
                  onPointerCancel={finishNodeDrag}
                  onClick={(event) => event.stopPropagation()}
                  className={`flex items-center justify-between gap-2 border-b border-[#2f3440] pb-1.5 ${
                    isCanvas ? "cursor-grab touch-none active:cursor-grabbing" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      aria-hidden="true"
                      className="flex h-4 w-4 shrink-0 items-center justify-center text-[#8e95a2]"
                    >
                      {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </span>
                    <h3 className="text-[10px] font-bold uppercase tracking-wide text-[#d7dbe3] truncate">
                      {definition.label}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Duplicar nodo ${definition.label}`}
                      onClick={() => duplicateNode(node)}
                      className="rounded p-1 text-[#8e95a2] hover:bg-[#292e38] hover:text-[#d7dbe3]"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Eliminar nodo ${definition.label}`}
                      onClick={() => removeNode(node.id)}
                      className="rounded p-1 text-[#8e95a2] hover:bg-[#292e38] hover:text-[#ff8c8c]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </header>

                {!isCollapsed && definition.inputs.map((input) => {
                  const link = graph.links.find(
                    (item) => item.toNodeId === node.id && item.toSocket === input.id,
                  );
                  const choices = graph.nodes.flatMap((sourceNode) => {
                    if (sourceNode.id === node.id) return [];
                    const outputs = getNodeDefinition(sourceNode.type).outputs;
                    return outputs
                      .filter((output) => areMaterialSocketTypesCompatible(output.type, input.type))
                      .map((output) => ({
                        value: `${sourceNode.id}::${output.id}`,
                        label: `${getNodeDefinition(sourceNode.type).label} · ${output.label}`,
                      }));
                  });
                  return (
                    <div
                      key={input.id}
                      className="flex min-h-7 items-center gap-1.5 text-[10px] text-[#aeb4c0]"
                    >
                      <button
                        type="button"
                        data-node-input-socket="true"
                        data-node-id={node.id}
                        data-socket-id={input.id}
                        data-socket-key={getSocketKey(node.id, input.id, "input")}
                        aria-label={`Socket de entrada ${definition.label}: ${input.label}`}
                        title={`${input.label} · ${input.type}`}
                        className="flex h-5 w-4 shrink-0 items-center justify-center"
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full border border-[#111318]"
                          style={{ backgroundColor: getSocketColor(input.type) }}
                        />
                      </button>
                      <span className="min-w-0 flex-1 truncate">{input.label}</span>
                      <select
                        aria-label={`${definition.label}: ${input.label}`}
                        value={link ? `${link.fromNodeId}::${link.fromSocket}` : ""}
                        onFocus={onBeginEdit}
                        onChange={(event) => setInputLink(node, input.id, event.target.value)}
                        className="h-7 min-w-0 max-w-[50%] rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1] outline-none focus:border-[#5ecd6e]"
                      >
                        <option value="">Sin conexión</option>
                        {choices.map((choice) => (
                          <option key={choice.value} value={choice.value}>
                            {choice.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}

                {!isCollapsed && node.type === "principled_bsdf" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="col-span-2 flex items-center justify-between gap-2 text-[10px] text-[#aeb4c0]">
                      Color base
                      <input
                        type="color"
                        aria-label="Color base Principled BSDF"
                        value={String(node.values.baseColor ?? material.baseColor)}
                        onPointerDown={onBeginEdit}
                        onChange={(event) => updateNode(node.id, { baseColor: event.target.value })}
                        className="h-7 w-14 cursor-pointer rounded border border-[#343a46] bg-[#121418] p-0.5"
                      />
                    </label>
                    {(
                      [
                        ["metallic", "Metallic", 0, 1, 0.01, material.metallic],
                        ["roughness", "Rugosidad", 0, 1, 0.01, material.roughness],
                        ["alpha", "Opacidad", 0, 1, 0.01, material.opacity ?? 1],
                      ] as const
                    ).map(([key, label, min, max, step, fallback]) => (
                      <label key={key} className="space-y-1 text-[10px] text-[#aeb4c0]">
                        {label}
                        <input
                          type="number"
                          min={min}
                          max={max}
                          step={step}
                          aria-label={`${label} Principled BSDF`}
                          value={Number(node.values[key] ?? fallback)}
                          onFocus={onBeginEdit}
                          onChange={(event) =>
                            updateNode(node.id, {
                              [key]: Number(event.target.value),
                            })
                          }
                          className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                        />
                      </label>
                    ))}
                    {(
                      [
                        ["ior", "IOR", 1, 2.5, 0.01, 1.45],
                        ["specular", "Specular", 0, 1, 0.01, 0.5],
                        ["emissionStrength", "Emission Strength", 0, 20, 0.1, 0],
                      ] as const
                    ).map(([key, label, min, max, step, fallback]) => (
                      <label key={key} className="space-y-1 text-[10px] text-[#aeb4c0]">
                        {label}
                        <input
                          type="number"
                          min={min}
                          max={max}
                          step={step}
                          aria-label={label}
                          value={Number(node.values[key] ?? fallback)}
                          onFocus={onBeginEdit}
                          onChange={(event) =>
                            updateNode(node.id, {
                              [key]: Number(event.target.value),
                            })
                          }
                          className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                        />
                      </label>
                    ))}
                    <label className="col-span-2 flex items-center justify-between gap-2 text-[10px] text-[#aeb4c0]">
                      Emisión
                      <input
                        type="color"
                        aria-label="Color de emisión"
                        value={String(node.values.emission ?? "#000000")}
                        onPointerDown={onBeginEdit}
                        onChange={(event) => updateNode(node.id, { emission: event.target.value })}
                        className="h-7 w-14 cursor-pointer rounded border border-[#343a46] bg-[#121418] p-0.5"
                      />
                    </label>
                  </div>
                )}

                {!isCollapsed && node.type === "math" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="col-span-2 space-y-1 text-[10px] text-[#aeb4c0]">
                      Operación
                      <select
                        aria-label="Operación Math"
                        value={String(node.values.operation ?? "add")}
                        onFocus={onBeginEdit}
                        onChange={(event) => updateNode(node.id, { operation: event.target.value })}
                        className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                      >
                        {[
                          ["add", "Sumar"],
                          ["subtract", "Restar"],
                          ["multiply", "Multiplicar"],
                          ["divide", "Dividir"],
                          ["minimum", "Mínimo"],
                          ["maximum", "Máximo"],
                          ["power", "Potencia"],
                          ["sine", "Seno"],
                          ["cosine", "Coseno"],
                        ].map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(["a", "b"] as const).map((key) => (
                      <label key={key} className="space-y-1 text-[10px] text-[#aeb4c0]">
                        Valor {key.toUpperCase()}
                        <input
                          type="number"
                          aria-label={`Valor Math ${key.toUpperCase()}`}
                          value={Number(node.values[key] ?? 0)}
                          onFocus={onBeginEdit}
                          onChange={(event) =>
                            updateNode(node.id, {
                              [key]: Number(event.target.value),
                            })
                          }
                          className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                        />
                      </label>
                    ))}
                  </div>
                )}

                {!isCollapsed && node.type === "image_texture" && (
                  <div className="space-y-1.5">
                    <label className="block space-y-1 text-[10px] text-[#aeb4c0]">
                      Imagen base (PNG o JPEG)
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        aria-label="Cargar imagen para el nodo Image Texture"
                        onPointerDown={onBeginEdit}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          if (!/^image\/(?:png|jpeg)$/i.test(file.type)) {
                            setFileError("Selecciona una imagen PNG o JPEG.");
                            event.currentTarget.value = "";
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () => {
                            if (typeof reader.result !== "string") {
                              setFileError("No se pudo leer la imagen seleccionada.");
                              return;
                            }
                            setFileError("");
                            updateNode(node.id, {
                              dataUrl: reader.result,
                              textureName: file.name,
                            });
                          };
                          reader.onerror = () =>
                            setFileError("No se pudo leer la imagen seleccionada.");
                          reader.readAsDataURL(file);
                        }}
                        className="block w-full text-[10px] text-[#aeb4c0] file:mr-2 file:rounded file:border-0 file:bg-[#303640] file:px-2 file:py-1 file:text-[10px] file:text-[#e5e7eb]"
                      />
                    </label>
                    {((typeof node.values.dataUrl === "string" &&
                      node.values.dataUrl.startsWith("data:image/")) ||
                      (node.values.textureSlot === "baseColor" &&
                        Boolean(material.textureDataUrl))) && (
                      <p className="truncate text-[10px] text-[#81d88d]">
                        {String(
                          node.values.textureName || material.textureName || "Textura cargada",
                        )}
                      </p>
                    )}
                  </div>
                )}

                {!isCollapsed && node.type === "mapping" && (
                  <div className="space-y-2">
                    {(
                      [
                        ["location", "Desplazamiento", [0, 0, 0]],
                        ["rotation", "Rotación (rad)", [0, 0, 0]],
                        ["scale", "Escala", [1, 1, 1]],
                      ] as const
                    ).map(([key, label, defaults]) => {
                      const vector = Array.isArray(node.values[key]) ? node.values[key] : defaults;
                      return (
                        <fieldset key={key} className="space-y-1">
                          <legend className="text-[10px] text-[#aeb4c0]">{label}</legend>
                          <div className="grid grid-cols-3 gap-1">
                            {(["X", "Y", "Z"] as const).map((axis, index) => (
                              <input
                                key={axis}
                                type="number"
                                step="0.1"
                                aria-label={`${label} ${axis}`}
                                value={Number(vector[index] ?? defaults[index])}
                                onFocus={onBeginEdit}
                                onChange={(event) => {
                                  const nextVector = [...defaults].map((_, componentIndex) =>
                                    Number(vector[componentIndex] ?? defaults[componentIndex]),
                                  );
                                  nextVector[index] = Number(event.target.value);
                                  updateNode(node.id, { [key]: nextVector });
                                }}
                                className="h-7 min-w-0 w-full rounded border border-[#343a46] bg-[#121418] px-1 text-[10px] text-[#cbd5e1]"
                              />
                            ))}
                          </div>
                        </fieldset>
                      );
                    })}
                  </div>
                )}
                {!isCollapsed && node.type === "transform" && (
                  <div className="space-y-2">
                    {(
                      [
                        ["location", "Posición", [0, 0, 0]],
                        ["rotation", "Rotación (°)", [0, 0, 0]],
                        ["scale", "Escala", [1, 1, 1]],
                      ] as const
                    ).map(([key, label, defaults]) => {
                      const vector = Array.isArray(node.values[key]) ? node.values[key] : defaults;
                      return (
                        <fieldset key={key} className="space-y-1">
                          <legend className="text-[10px] text-[#aeb4c0]">{label}</legend>
                          <div className="grid grid-cols-3 gap-1">
                            {(["X", "Y", "Z"] as const).map((axis, index) => (
                              <input
                                key={axis}
                                type="number"
                                step={key === "rotation" ? "1" : "0.1"}
                                aria-label={`${label} ${axis}`}
                                value={Number(vector[index] ?? defaults[index])}
                                onFocus={onBeginEdit}
                                onChange={(event) => {
                                  const nextVector = [...defaults].map((_, componentIndex) =>
                                    Number(vector[componentIndex] ?? defaults[componentIndex]),
                                  );
                                  nextVector[index] = Number(event.target.value);
                                  updateNode(node.id, { [key]: nextVector });
                                }}
                                className="h-7 min-w-0 w-full rounded border border-[#343a46] bg-[#121418] px-1 text-[10px] text-[#cbd5e1]"
                              />
                            ))}
                          </div>
                        </fieldset>
                      );
                    })}
                  </div>
                )}
                {!isCollapsed && (node.type === "value_float" ||
                  node.type === "value_integer" ||
                  node.type === "value_boolean" ||
                  node.type === "value_color" ||
                  node.type === "value_vector") && (
                  <div className="space-y-2">
                    {node.type === "value_float" && (
                      <label className="block space-y-1 text-[10px] text-[#aeb4c0]">
                        Valor
                        <input
                          type="number"
                          step="0.01"
                          aria-label="Valor Float"
                          value={Number(node.values.value ?? 0)}
                          onFocus={onBeginEdit}
                          onChange={(event) =>
                            updateNode(node.id, { value: Number(event.target.value) })
                          }
                          className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                        />
                      </label>
                    )}
                    {node.type === "value_integer" && (
                      <label className="block space-y-1 text-[10px] text-[#aeb4c0]">
                        Valor entero
                        <input
                          type="number"
                          step="1"
                          aria-label="Valor Integer"
                          value={Math.trunc(Number(node.values.value ?? 0))}
                          onFocus={onBeginEdit}
                          onChange={(event) =>
                            updateNode(node.id, { value: Math.trunc(Number(event.target.value)) })
                          }
                          className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                        />
                      </label>
                    )}
                    {node.type === "value_boolean" && (
                      <label className="flex items-center justify-between gap-2 text-[10px] text-[#aeb4c0]">
                        Activado
                        <input
                          type="checkbox"
                          aria-label="Valor Boolean"
                          checked={Boolean(node.values.value)}
                          onChange={(event) => updateNode(node.id, { value: event.target.checked })}
                          className="accent-[#5ecd6e]"
                        />
                      </label>
                    )}
                    {node.type === "value_color" && (
                      <label className="flex items-center justify-between gap-2 text-[10px] text-[#aeb4c0]">
                        Color
                        <input
                          type="color"
                          aria-label="Valor Color"
                          value={
                            typeof node.values.value === "string" &&
                            /^#[0-9a-f]{6}$/i.test(node.values.value)
                              ? node.values.value
                              : "#ffffff"
                          }
                          onPointerDown={onBeginEdit}
                          onChange={(event) => updateNode(node.id, { value: event.target.value })}
                          className="h-7 w-14 cursor-pointer rounded border border-[#343a46] bg-[#121418] p-0.5"
                        />
                      </label>
                    )}
                    {node.type === "value_vector" &&
                      (() => {
                        const vector = Array.isArray(node.values.value)
                          ? node.values.value
                          : [0, 0, 0];
                        return (
                          <fieldset className="space-y-1">
                            <legend className="text-[10px] text-[#aeb4c0]">Vector</legend>
                            <div className="grid grid-cols-3 gap-1">
                              {(["X", "Y", "Z"] as const).map((axis, index) => (
                                <input
                                  key={axis}
                                  type="number"
                                  step="0.1"
                                  aria-label={`Valor Vector ${axis}`}
                                  value={Number(vector[index] ?? 0)}
                                  onFocus={onBeginEdit}
                                  onChange={(event) => {
                                    const next = [0, 1, 2].map((item) => Number(vector[item] ?? 0));
                                    next[index] = Number(event.target.value);
                                    updateNode(node.id, { value: next });
                                  }}
                                  className="h-7 min-w-0 w-full rounded border border-[#343a46] bg-[#121418] px-1 text-[10px] text-[#cbd5e1]"
                                />
                              ))}
                            </div>
                          </fieldset>
                        );
                      })()}
                  </div>
                )}

                {!isCollapsed && node.type === "normal_map" && (
                  <label className="block space-y-1 text-[10px] text-[#aeb4c0]">
                    Intensidad
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      aria-label="Intensidad Normal Map"
                      value={Number(node.values.strength ?? 1)}
                      onFocus={onBeginEdit}
                      onChange={(event) =>
                        updateNode(node.id, {
                          strength: Number(event.target.value),
                        })
                      }
                      className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                    />
                  </label>
                )}

                {!isCollapsed && node.type === "bump" && (
                  <div className="grid grid-cols-2 gap-2">
                    {(["strength", "distance"] as const).map((key) => (
                      <label key={key} className="space-y-1 text-[10px] text-[#aeb4c0]">
                        {key === "strength" ? "Intensidad" : "Distancia"}
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          aria-label={`Bump ${key === "strength" ? "intensidad" : "distancia"}`}
                          value={Number(node.values[key] ?? 1)}
                          onFocus={onBeginEdit}
                          onChange={(event) =>
                            updateNode(node.id, {
                              [key]: Number(event.target.value),
                            })
                          }
                          className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                        />
                      </label>
                    ))}
                  </div>
                )}

                {!isCollapsed && (node.type === "mix_color" ||
                  node.type === "mix_float" ||
                  node.type === "mix_vector") && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="col-span-2 flex items-center justify-between gap-2 text-[10px] text-[#aeb4c0]">
                      Operación
                      <select
                        aria-label={`Operación ${getNodeDefinition(node.type).label}`}
                        value={String(node.values.operation ?? "mix")}
                        onFocus={onBeginEdit}
                        onChange={(event) => updateNode(node.id, { operation: event.target.value })}
                        className="h-7 min-w-0 rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                      >
                        {[
                          ["mix", "Mezclar"],
                          ["add", "Sumar"],
                          ["subtract", "Restar"],
                          ["multiply", "Multiplicar"],
                          ...(node.type === "mix_float"
                            ? [
                                ["minimum", "Mínimo"],
                                ["maximum", "Máximo"],
                              ]
                            : []),
                        ].map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="col-span-2 space-y-1 text-[10px] text-[#aeb4c0]">
                      Factor
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        aria-label={`Factor ${getNodeDefinition(node.type).label}`}
                        value={Number(node.values.factor ?? 0.5)}
                        onPointerDown={onBeginEdit}
                        onChange={(event) =>
                          updateNode(node.id, {
                            factor: Number(event.target.value),
                          })
                        }
                        className="h-3 w-full cursor-pointer accent-[#5ecd6e]"
                      />
                    </label>
                    {node.type === "mix_color" &&
                      (["colorA", "colorB"] as const).map((key) => (
                        <label key={key} className="space-y-1 text-[10px] text-[#aeb4c0]">
                          Color {key === "colorA" ? "A" : "B"}
                          <input
                            type="color"
                            aria-label={`Color ${key === "colorA" ? "A" : "B"} Mix Color`}
                            value={String(node.values[key] ?? "#ffffff")}
                            onPointerDown={onBeginEdit}
                            onChange={(event) => updateNode(node.id, { [key]: event.target.value })}
                            className="h-7 w-full cursor-pointer rounded border border-[#343a46] bg-[#121418] p-0.5"
                          />
                        </label>
                      ))}
                    {node.type === "mix_float" &&
                      (["a", "b"] as const).map((key) => (
                        <label key={key} className="space-y-1 text-[10px] text-[#aeb4c0]">
                          Valor {key.toUpperCase()}
                          <input
                            type="number"
                            aria-label={`Mix Float ${key.toUpperCase()}`}
                            value={Number(node.values[key] ?? 0)}
                            onFocus={onBeginEdit}
                            onChange={(event) =>
                              updateNode(node.id, { [key]: Number(event.target.value) })
                            }
                            className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                          />
                        </label>
                      ))}
                    {node.type === "mix_vector" &&
                      (["a", "b"] as const).map((key) => {
                        const vector = Array.isArray(node.values[key])
                          ? node.values[key]
                          : [0, 0, 0];
                        return (
                          <fieldset key={key} className="space-y-1">
                            <legend className="text-[10px] text-[#aeb4c0]">
                              Vector {key.toUpperCase()}
                            </legend>
                            <div className="grid grid-cols-3 gap-1">
                              {(["X", "Y", "Z"] as const).map((axis, index) => (
                                <input
                                  key={axis}
                                  type="number"
                                  aria-label={`Mix Vector ${key.toUpperCase()} ${axis}`}
                                  value={Number(vector[index] ?? 0)}
                                  onFocus={onBeginEdit}
                                  onChange={(event) => {
                                    const next = [0, 1, 2].map((item) => Number(vector[item] ?? 0));
                                    next[index] = Number(event.target.value);
                                    updateNode(node.id, { [key]: next });
                                  }}
                                  className="h-7 min-w-0 w-full rounded border border-[#343a46] bg-[#121418] px-1 text-[10px] text-[#cbd5e1]"
                                />
                              ))}
                            </div>
                          </fieldset>
                        );
                      })}
                  </div>
                )}

                {!isCollapsed && node.type === "color_ramp" && (
                  <ColorRampControls
                    node={node}
                    onBeginEdit={onBeginEdit}
                    onChange={(values) => updateNode(node.id, values)}
                  />
                )}
                {definition.outputs.length > 0 && (
                  <div className={`space-y-1 ${!isCollapsed ? "border-t border-[#2f3440] pt-1.5" : ""}`}>
                    {definition.outputs.map((output) => (
                      <div
                        key={output.id}
                        className="flex items-center justify-end gap-1.5 text-[10px] text-[#aeb4c0]"
                      >
                        <span>{output.label}</span>
                        <button
                          type="button"
                          data-node-output-socket="true"
                          data-node-id={node.id}
                          data-socket-id={output.id}
                          data-socket-key={getSocketKey(node.id, output.id, "output")}
                          aria-label={`Socket de salida ${definition.label}: ${output.label}`}
                          title={`${output.label} · ${output.type} (arrastra a una entrada)`}
                          className="flex h-5 w-4 shrink-0 items-center justify-center"
                          onPointerDown={(event) => startConnectionDrag(event, node, output.id)}
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full border border-[#111318]"
                            style={{ backgroundColor: getSocketColor(output.type) }}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
          );
        })}
        {spawnPopup && (
          <div
            data-testid="material-node-spawn-popup"
            className="absolute z-30 w-72 rounded-lg border border-[#343a46] bg-[#181b22] p-3 shadow-2xl"
            style={{
              left: Math.min(canvasSize.width - 300, Math.max(20, spawnPopup.canvasPos.x)),
              top: Math.min(canvasSize.height - 300, Math.max(20, spawnPopup.canvasPos.y)),
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#2f3440]">
              <span className="text-[11px] font-bold text-[#d7dbe3]">
                Añadir nodo compatible ({spawnPopup.direction === "output" ? "Entrada" : "Salida"}: {spawnPopup.socketType})
              </span>
              <button
                type="button"
                aria-label="Cerrar menú de nodos"
                onClick={() => {
                  setSpawnPopup(null);
                  setSpawnSearchQuery("");
                }}
                className="rounded p-1 text-[#8e95a2] hover:bg-[#292e38] hover:text-[#d7dbe3]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="py-2">
              <input
                type="text"
                placeholder="Buscar nodo…"
                aria-label="Buscar nodo compatible"
                value={spawnSearchQuery}
                onChange={(event) => setSpawnSearchQuery(event.target.value)}
                className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-2 text-[10px] text-[#cbd5e1] outline-none focus:border-[#5ecd6e]"
                autoFocus
              />
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {editableNodeTypes
                .map(getNodeDefinition)
                .filter((def) => {
                  const isCompatible =
                    spawnPopup.direction === "output"
                      ? def.inputs.some((inp) => areMaterialSocketTypesCompatible(spawnPopup.socketType, inp.type))
                      : def.outputs.some((outp) => areMaterialSocketTypesCompatible(outp.type, spawnPopup.socketType));
                  if (!isCompatible) return false;
                  if (spawnSearchQuery.trim()) {
                    const q = spawnSearchQuery.toLowerCase();
                    return (
                      def.label.toLowerCase().includes(q) ||
                      def.category.toLowerCase().includes(q) ||
                      getNodeDescription(def.id).toLowerCase().includes(q)
                    );
                  }
                  return true;
                })
                .map((def) => (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => spawnAndConnectNode(def.id)}
                    className="flex w-full flex-col gap-0.5 rounded p-1.5 text-left hover:bg-[#252a35]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-[#cbd5e1]">{def.label}</span>
                      <span
                        className="rounded px-1.5 py-0.5 text-[8px] uppercase font-semibold text-[#111318]"
                        style={{ backgroundColor: getNodeCategoryColor(def.category) }}
                      >
                        {def.category}
                      </span>
                    </div>
                    <span className="text-[9px] text-[#8e95a2]">{getNodeDescription(def.id)}</span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (!isCanvas) {
    return (
      <details className="space-y-2 rounded-lg border border-[#272b34] bg-[#121418] p-2.5">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-[#aeb4c0]">
          Grafo de nodos
        </summary>
        <p className="text-[10px] leading-snug text-[#8e95a2]">
          Las entradas conectadas se evalúan y actualizan el material del visor.
        </p>
        {evaluation.ok ? (
          <p role="status" className="text-[10px] text-[#81d88d]">
            Grafo conectado y evaluado.
          </p>
        ) : (
          <p
            role="alert"
            className="rounded border border-[#f87171]/30 bg-[#3b2024] px-2 py-1.5 text-[10px] leading-snug text-[#fecaca]"
          >
            {evaluation.errors.join(" ")}
          </p>
        )}
        {fileError && (
          <p role="alert" className="text-[10px] text-[#fecaca]">
            {fileError}
          </p>
        )}
        <div className="flex shrink-0 items-center gap-1.5 pb-1">{addNodeSelect}</div>
        {connectionError && (
          <p role="alert" className="shrink-0 pb-1 text-[10px] text-[#fecaca]">
            {connectionError}
          </p>
        )}
        {canvasViewportContent}
      </details>
    );
  }

  return (
    <div
      data-testid="material-node-canvas-shell"
      className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#121418]"
    >
      <div className="pointer-events-none absolute top-2 left-2 right-2 z-10 flex flex-wrap items-center justify-between gap-2">
        <div
          onPointerDown={(event) => event.stopPropagation()}
          className="pointer-events-auto flex min-w-0 max-w-full flex-wrap items-center gap-1.5 rounded-md border border-[#2b2e36] bg-[#16181d]/90 p-1 shadow-md backdrop-blur-sm"
        >
          {toolbarStart}
          {addNodeSelect}
        </div>
        <div
          onPointerDown={(event) => event.stopPropagation()}
          className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-md border border-[#2b2e36] bg-[#16181d]/90 p-1 shadow-md backdrop-blur-sm"
        >
          <button
            type="button"
            aria-label="Alejar el editor de nodos"
            onClick={() => zoomBy(-0.15)}
            className="h-8 w-8 rounded border border-[#343a46] bg-[#181b22] text-sm text-[#cbd5e1] hover:border-[#5ecd6e]"
          >
            −
          </button>
          <button
            type="button"
            aria-label="Restablecer zoom y paneo"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="h-8 min-w-12 rounded border border-[#343a46] bg-[#181b22] px-1 text-[10px] text-[#cbd5e1] hover:border-[#5ecd6e]"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label="Acercar el editor de nodos"
            onClick={() => zoomBy(0.15)}
            className="h-8 w-8 rounded border border-[#343a46] bg-[#181b22] text-sm text-[#cbd5e1] hover:border-[#5ecd6e]"
          >
            +
          </button>
        </div>
      </div>

      {(!evaluation.ok || connectionError || fileError) && (
        <div className="pointer-events-none absolute bottom-2 left-2 z-10 max-w-[calc(100%-5rem)] space-y-1">
          {!evaluation.ok && (
            <p
              role="alert"
              className="rounded border border-[#f87171]/40 bg-[#3b2024]/95 px-2.5 py-1.5 text-[10px] leading-snug text-[#fecaca] shadow-md"
            >
              {evaluation.errors.join(" ")}
            </p>
          )}
          {connectionError && (
            <p
              role="alert"
              className="rounded border border-[#f87171]/40 bg-[#3b2024]/95 px-2.5 py-1 text-[10px] text-[#fecaca] shadow-md"
            >
              {connectionError}
            </p>
          )}
          {fileError && (
            <p
              role="alert"
              className="rounded border border-[#f87171]/40 bg-[#3b2024]/95 px-2.5 py-1 text-[10px] text-[#fecaca] shadow-md"
            >
              {fileError}
            </p>
          )}
        </div>
      )}

      {canvasViewportContent}
    </div>
  );
};
