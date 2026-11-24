import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy, Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import {
  areMaterialSocketTypesCompatible,
  connectMaterialNodeSockets,
  getMaterialNodeDefinition,
  getNodeNumericParamSpec,
  MaterialNodeDefinition,
  NodeNumericParamSpec,
  evaluateMaterialNodeGraph,
  getNodeCategoryColor,
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
import { useMaterialWorkspaceSplit } from "./MaterialWorkspaceSplit";
import { NumericFieldInput } from "./NumericFieldInput";

interface MaterialNodeEditorProps {
  material: MaterialAsset;
  graph: MaterialNodeGraph;
  onChange: (graph: MaterialNodeGraph) => void;
  onBeginEdit: () => void;
  variant?: "panel" | "canvas";
  screenModifiers?: TouchModifierState;
  onEffectiveModifiersChange?: (modifiers: TouchModifierState) => void;
  toolbarStart?: React.ReactNode;
  onUndo?: () => void;
  onRedo?: () => void;
}

const editableNodeTypes: MaterialNodeType[] = [
  "principled_bsdf",
  "emission",
  "material_output",
  "image_texture",
  "noise_texture",
  "voronoi_texture",
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
        : type === "emission"
          ? {
              color:
                material.emissiveColor && material.emissiveColor !== "#000000"
                  ? material.emissiveColor
                  : "#ffffff",
              strength: 1,
            }
          : type === "image_texture"
            ? { dataUrl: "", textureName: "" }
            : type === "noise_texture"
              ? {
                  dimensions: "3D",
                  w: 0,
                  scale: 5,
                  detail: 2,
                  roughness: 0.5,
                  lacunarity: 2,
                  offset: 0,
                  distortion: 0,
                  normalize: true,
                }
              : type === "voronoi_texture"
                ? {
                    dimensions: "3D",
                    feature: "f1",
                    distanceMetric: "euclidean",
                    w: 0,
                    scale: 5,
                    detail: 0,
                    roughness: 0.5,
                    lacunarity: 2,
                    smoothness: 1,
                    exponent: 0.5,
                    randomness: 1,
                    normalize: false,
                  }
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

function getNodeDisplayTitle(node: MaterialNode): string {
  const custom = typeof node.label === "string" ? node.label.trim() : "";
  return custom || getNodeDefinition(node.type).label;
}

function getNodeDescription(type: MaterialNodeType): string {
  switch (type) {
    case "principled_bsdf":
      return "Shader PBR principal con color, rugosidad y normales.";
    case "emission":
      return "Emite luz y color propio sin depender de iluminación externa.";
    case "material_output":
      return "Salida final de superficie para el material 3D.";
    case "image_texture":
      return "Carga y mapea imágenes PNG o JPEG como texturas.";
    case "noise_texture":
      return "Genera ruido fractal procedural (1D–4D) en tiempo real.";
    case "voronoi_texture":
      return "Genera patrones celulares Voronoi (F1, F2, Smooth F1, borde).";
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

function NodeNumericBar({
  label,
  ariaLabel,
  value,
  min,
  max,
  step,
  decimals = 2,
  clampMax,
  clampMin,
  connected,
  numericMode = "text",
  compact = false,
  className = "",
  onBeginEdit,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  clampMin?: number;
  clampMax?: number;
  connected?: boolean;
  numericMode?: "text" | "number";
  compact?: boolean;
  className?: string;
  onBeginEdit: () => void;
  onChange: (nextValue: number) => void;
}) {
  const safeVal = Number.isFinite(value) ? value : min;
  const sliderVal = Math.max(min, Math.min(max, safeVal));
  const normalizeValue = (candidate: number) => {
    if (!Number.isFinite(candidate)) return safeVal;
    let next = candidate;
    if (clampMin !== undefined) next = Math.max(clampMin, next);
    if (clampMax !== undefined) next = Math.min(clampMax, next);
    return next;
  };
  return (
    <div
      className={`space-y-1 rounded border border-[#282d38] bg-[#121419] ${
        compact ? "px-1 py-1" : "px-1.5 py-1"
      } ${connected ? "opacity-60" : ""} ${className}`}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="truncate text-[10px] font-medium text-[#aeb4c0]">
          {label}
          {connected ? " (conectado)" : ""}
        </span>
        {numericMode === "number" ? (
          <input
            type="number"
            step={step}
            min={clampMin}
            max={clampMax}
            aria-label={ariaLabel}
            disabled={connected}
            value={safeVal}
            onFocus={onBeginEdit}
            onChange={(event) => onChange(normalizeValue(Number(event.target.value)))}
            className={`h-6 ${
              compact ? "w-12" : "w-14"
            } rounded border border-[#343a46] bg-[#181b22] px-1 text-right text-[10px] font-mono-tabular text-[#f3f4f6] outline-none focus:border-[#5ecd6e] disabled:cursor-not-allowed`}
          />
        ) : (
          <NumericFieldInput
            ariaLabel={ariaLabel}
            value={safeVal}
            decimals={decimals}
            disabled={connected}
            onCommit={(nextValue) => {
              onBeginEdit();
              onChange(normalizeValue(nextValue));
            }}
            className={`h-6 ${
              compact ? "w-12" : "w-14"
            } rounded border border-[#343a46] bg-[#181b22] px-1 text-right text-[10px] font-mono-tabular text-[#f3f4f6] outline-none focus:border-[#5ecd6e] disabled:cursor-not-allowed`}
          />
        )}
      </div>
      <input
        type="range"
        aria-label={`Deslizador ${ariaLabel}`}
        min={min}
        max={max}
        step={step}
        disabled={connected}
        value={sliderVal}
        onPointerDown={(event) => {
          event.stopPropagation();
          onBeginEdit();
        }}
        onChange={(event) => onChange(normalizeValue(Number(event.target.value)))}
        className="h-2.5 w-full cursor-pointer accent-[#5ecd6e] disabled:cursor-not-allowed"
      />
    </div>
  );
}

function NodeVectorSliders({
  legend,
  ariaPrefix,
  vector,
  defaults,
  spec,
  connected,
  onBeginEdit,
  onChange,
}: {
  legend: string;
  ariaPrefix: string;
  vector: readonly number[];
  defaults: readonly [number, number, number];
  spec: NodeNumericParamSpec;
  connected?: boolean;
  onBeginEdit: () => void;
  onChange: (nextVector: [number, number, number]) => void;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-[10px] text-[#aeb4c0]">
        {legend}
        {connected ? " (conectado)" : ""}
      </legend>
      <div className="grid grid-cols-3 gap-1">
        {(["X", "Y", "Z"] as const).map((axis, index) => (
          <NodeNumericBar
            key={axis}
            label={axis}
            ariaLabel={`${ariaPrefix} ${axis}`}
            value={Number(vector[index] ?? defaults[index])}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            decimals={spec.decimals ?? 2}
            clampMin={spec.clampMin}
            clampMax={spec.clampMax}
            connected={connected}
            compact
            onBeginEdit={onBeginEdit}
            onChange={(nextVal) => {
              const nextVector: [number, number, number] = [
                Number(vector[0] ?? defaults[0]),
                Number(vector[1] ?? defaults[1]),
                Number(vector[2] ?? defaults[2]),
              ];
              nextVector[index] = nextVal;
              onChange(nextVector);
            }}
          />
        ))}
      </div>
    </fieldset>
  );
}

function ColorRampControls({
  node,
  factorConnected,
  onBeginEdit,
  onChange,
}: {
  node: MaterialNode;
  factorConnected?: boolean;
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

  const factorSpec = getNodeNumericParamSpec("color_ramp", "factor");
  const posSpec = getNodeNumericParamSpec("color_ramp", "position");
  const alphaSpec = getNodeNumericParamSpec("color_ramp", "alpha");

  return (
    <div className="space-y-2">
      <NodeNumericBar
        label="Factor"
        ariaLabel="Factor Color Ramp"
        value={Number(node.values.factor ?? 0.5)}
        min={factorSpec.min}
        max={factorSpec.max}
        step={factorSpec.step}
        decimals={factorSpec.decimals}
        clampMin={factorSpec.clampMin}
        clampMax={factorSpec.clampMax}
        connected={factorConnected}
        onBeginEdit={onBeginEdit}
        onChange={(val) => onChange({ factor: val })}
      />
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
            className="space-y-1 rounded border border-[#282d38] bg-[#14171e] p-1.5"
          >
            <div className="flex items-center justify-between gap-1.5">
              <label className="flex flex-1 items-center justify-between gap-1.5 text-[9px] text-[#8e95a2]">
                <span>Parada {index + 1}</span>
                <input
                  type="color"
                  aria-label={`Color parada ${index + 1} Color Ramp`}
                  value={stop.color}
                  onPointerDown={onBeginEdit}
                  onChange={(event) => updateStop(index, { color: event.target.value })}
                  className="h-6 w-12 cursor-pointer rounded border border-[#343a46] bg-[#121418] p-0.5"
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
                className="flex h-6 w-6 items-center justify-center rounded text-[#8e95a2] hover:bg-[#292e38] hover:text-[#ff8c8c] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Trash2 aria-hidden="true" className="h-3 w-3" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <NodeNumericBar
                label={`Pos ${index + 1}`}
                ariaLabel={`Posición ${index + 1} Color Ramp`}
                value={stop.position}
                min={posSpec.min}
                max={posSpec.max}
                step={posSpec.step}
                decimals={posSpec.decimals}
                clampMin={posSpec.clampMin}
                clampMax={posSpec.clampMax}
                compact
                onBeginEdit={onBeginEdit}
                onChange={(val) => updateStop(index, { position: val })}
              />
              <NodeNumericBar
                label="Alpha"
                ariaLabel={`Alpha parada ${index + 1} Color Ramp`}
                value={stop.alpha}
                min={alphaSpec.min}
                max={alphaSpec.max}
                step={alphaSpec.step}
                decimals={alphaSpec.decimals}
                clampMin={alphaSpec.clampMin}
                clampMax={alphaSpec.clampMax}
                compact
                onBeginEdit={onBeginEdit}
                onChange={(val) => updateStop(index, { alpha: val })}
              />
            </div>
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
  onEffectiveModifiersChange,
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
  const [holdModifiers, setHoldModifiers] = useState<TouchModifierState>({
    shift: false,
    ctrl: false,
    alt: false,
  });
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
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
    startedOnTitle: boolean;
  } | null>(null);
  const lastTitleTapRef = useRef<{
    nodeId: string;
    time: number;
    clientX: number;
    clientY: number;
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
    direction: "output" | "input";
    pointerId: number;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const [autoPanSpeed, setAutoPanSpeed] = useState<number>(1);
  const autoPanSpeedRef = useRef<number>(1);
  autoPanSpeedRef.current = autoPanSpeed;
  const connectionPointerClientRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const lastEmptyTapRef = useRef<{ time: number; clientX: number; clientY: number } | null>(null);
  const emptyTapCandidateRef = useRef<{ time: number; clientX: number; clientY: number } | null>(
    null,
  );
  const boxSelectionRef = useRef<{
    pointerId: number;
    startCanvas: Point2D;
    startClientX: number;
    startClientY: number;
    additive: boolean;
    baseSelectedIds: Set<string>;
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
  const holdModifiersRef = useRef(holdModifiers);
  holdModifiersRef.current = holdModifiers;
  const holdTimerRef = useRef<number | null>(null);
  const activePointersRef = useRef(new Map<number, { clientX: number; clientY: number }>());
  const multiTouchRef = useRef<{
    maxCount: number;
    startTime: number;
    prevMid: Point2D;
    prevDist: number;
    totalMidMovement: number;
    totalPinchChange: number;
    holdActivated: boolean;
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
  const effectiveShift =
    physicalModifiers.shift || Boolean(screenModifiers?.shift) || holdModifiers.shift;
  const effectiveCtrl =
    physicalModifiers.ctrl || Boolean(screenModifiers?.ctrl) || holdModifiers.ctrl;
  const effectiveAlt =
    physicalModifiers.alt || Boolean(screenModifiers?.alt) || holdModifiers.alt;
  const splitContext = useMaterialWorkspaceSplit();
  const registerInlineToggle = splitContext?.registerInlineToggle;

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isCanvas) return;
    onEffectiveModifiersChange?.({
      shift: effectiveShift,
      ctrl: effectiveCtrl,
      alt: effectiveAlt,
    });
  }, [effectiveAlt, effectiveCtrl, effectiveShift, isCanvas, onEffectiveModifiersChange]);

  useEffect(() => {
    if (!isCanvas || !registerInlineToggle) return;
    return registerInlineToggle();
  }, [isCanvas, registerInlineToggle]);

  useEffect(() => {
    if (!isCanvas) return;
    const syncModifiers = (event: KeyboardEvent) => {
      setPhysicalModifiers({
        shift: event.shiftKey,
        ctrl: event.ctrlKey || event.metaKey,
        alt: event.altKey,
      });
      if (event.key === "Escape") {
        if (connectionDragRef.current) {
          connectionDragRef.current = null;
          connectionPointerClientRef.current = null;
          setConnectionDrag(null);
        }
        if (boxSelectionRef.current) {
          boxSelectionRef.current = null;
          setSelectionBox(null);
        }
      }
    };
    const clearModifiers = () => {
      setPhysicalModifiers({ shift: false, ctrl: false, alt: false });
      setHoldModifiers({ shift: false, ctrl: false, alt: false });
      clearHoldTimer();
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
  }, [clearHoldTimer, isCanvas]);

  useEffect(() => {
    return () => {
      clearHoldTimer();
      for (const timer of flashTimersRef.current) {
        window.clearTimeout(timer);
      }
      flashTimersRef.current = [];
    };
  }, [clearHoldTimer]);

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
      if (element.offsetWidth > 0 && element.offsetHeight > 0) {
        let ox = element.offsetWidth / 2;
        let oy = element.offsetHeight / 2;
        let cur: HTMLElement | null = element;
        let reachedPlane = false;
        while (cur && cur !== plane) {
          const parent = cur.offsetParent as HTMLElement | null;
          ox += cur.offsetLeft;
          oy += cur.offsetTop;
          if (parent === plane) {
            reachedPlane = true;
            break;
          }
          if (parent) {
            ox += parent.clientLeft - parent.scrollLeft;
            oy += parent.clientTop - parent.scrollTop;
          }
          cur = parent;
        }
        if (reachedPlane) {
          next[key] = { x: ox, y: oy };
          return;
        }
      }
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
            Math.abs(current[key].x - next[key].x) < 0.05 &&
            Math.abs(current[key].y - next[key].y) < 0.05,
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
    renamingNodeId,
  ]);

  useEffect(() => {
    if (!isCanvas || !canvasViewportRef.current || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measureSocketPositions);
    observer.observe(canvasViewportRef.current);
    if (nodePlaneRef.current) {
      observer.observe(nodePlaneRef.current);
    }
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

  const isConnectionDragging = Boolean(connectionDrag);
  useEffect(() => {
    if (!isCanvas || !isConnectionDragging) return;
    let rafId = 0;
    let lastTime = performance.now();
    const EDGE_MARGIN = 52;
    const BASE_MAX_SPEED = 14;

    const tick = (now: number) => {
      const activeConn = connectionDragRef.current;
      const clientPt = connectionPointerClientRef.current;
      const viewport = canvasViewportRef.current;
      if (!activeConn || !clientPt || !viewport) return;

      const bounds = viewport.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0) {
        const dtScale = Math.min(3, Math.max(0.25, (now - lastTime) / 16.67));
        lastTime = now;

        const distLeft = clientPt.clientX - bounds.left;
        const distRight = bounds.right - clientPt.clientX;
        const distTop = clientPt.clientY - bounds.top;
        const distBottom = bounds.bottom - clientPt.clientY;

        let vx = 0;
        let vy = 0;
        const speed = BASE_MAX_SPEED * autoPanSpeedRef.current * dtScale;

        if (distLeft < EDGE_MARGIN) {
          const factor = Math.min(1.5, Math.max(0.1, (EDGE_MARGIN - distLeft) / EDGE_MARGIN));
          vx = speed * factor;
        } else if (distRight < EDGE_MARGIN) {
          const factor = Math.min(1.5, Math.max(0.1, (EDGE_MARGIN - distRight) / EDGE_MARGIN));
          vx = -speed * factor;
        }

        if (distTop < EDGE_MARGIN) {
          const factor = Math.min(1.5, Math.max(0.1, (EDGE_MARGIN - distTop) / EDGE_MARGIN));
          vy = speed * factor;
        } else if (distBottom < EDGE_MARGIN) {
          const factor = Math.min(1.5, Math.max(0.1, (EDGE_MARGIN - distBottom) / EDGE_MARGIN));
          vy = -speed * factor;
        }

        if (Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01) {
          const nextPan = {
            x: panRef.current.x + vx,
            y: panRef.current.y + vy,
          };
          panRef.current = nextPan;
          setPan(nextPan);
          const canvasPt = {
            x: (clientPt.clientX - bounds.left - nextPan.x) / zoomRef.current,
            y: (clientPt.clientY - bounds.top - nextPan.y) / zoomRef.current,
          };
          const updated = { ...activeConn, ...canvasPt };
          connectionDragRef.current = updated;
          setConnectionDrag(updated);
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isCanvas, isConnectionDragging]);

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

  const toggleNodeCollapsed = (nodeId: string) => {
    const currNode = graph.nodes.find((n) => n.id === nodeId);
    if (!currNode) return;
    onBeginEdit();
    onChange({
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === nodeId ? { ...node, collapsed: !Boolean(node.collapsed) } : node,
      ),
    });
  };

  const startNodeRename = (node: MaterialNode) => {
    setRenamingNodeId(node.id);
    setRenameDraft(getNodeDisplayTitle(node));
    setSelectedNodeIds(new Set([node.id]));
  };

  const commitNodeRename = (nodeId: string, rawDraft?: string) => {
    const targetNode = graph.nodes.find((node) => node.id === nodeId);
    setRenamingNodeId(null);
    if (!targetNode) return;
    const trimmed = (rawDraft ?? renameDraft).trim();
    const defaultLabel = getNodeDefinition(targetNode.type).label;
    const nextLabel = trimmed && trimmed !== defaultLabel ? trimmed : undefined;
    const prevLabel =
      typeof targetNode.label === "string" && targetNode.label.trim()
        ? targetNode.label.trim()
        : undefined;
    if (nextLabel === prevLabel) return;
    onBeginEdit();
    onChange({
      ...graph,
      nodes: graph.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        if (nextLabel) {
          return { ...node, label: nextLabel };
        }
        const rest = { ...node };
        delete rest.label;
        return rest;
      }),
    });
  };

  const cancelNodeRename = () => {
    setRenamingNodeId(null);
    setRenameDraft("");
  };

  const duplicateSelection = (anchorNode?: MaterialNode) => {
    const useMulti =
      selectedNodeIds.size > 1 && (!anchorNode || selectedNodeIds.has(anchorNode.id));
    const sourceNodes = useMulti
      ? graph.nodes.filter((node) => selectedNodeIds.has(node.id))
      : anchorNode
        ? [anchorNode]
        : [];
    if (sourceNodes.length === 0) return;

    onBeginEdit();
    const idMap = new Map<string, string>();
    const workingGraph: MaterialNodeGraph = {
      ...graph,
      nodes: [...graph.nodes],
      links: [...graph.links],
    };
    const newNodes: MaterialNode[] = [];

    for (const source of sourceNodes) {
      const nextId = createNodeId(workingGraph, source.type);
      idMap.set(source.id, nextId);
      const duplicate: MaterialNode = {
        ...source,
        id: nextId,
        position: { x: source.position.x + 36, y: source.position.y + 36 },
        values: Object.fromEntries(
          Object.entries(source.values).map(([key, value]) => [key, cloneNodeValue(value)]),
        ),
      };
      workingGraph.nodes.push(duplicate);
      newNodes.push(duplicate);
    }

    for (const link of graph.links) {
      const newFrom = idMap.get(link.fromNodeId);
      const newTo = idMap.get(link.toNodeId);
      if (newFrom && newTo) {
        workingGraph.links.push({
          id: `${newFrom}:${link.fromSocket}->${newTo}:${link.toSocket}`,
          fromNodeId: newFrom,
          fromSocket: link.fromSocket,
          toNodeId: newTo,
          toSocket: link.toSocket,
        });
      }
    }

    onChange(workingGraph);
    if (useMulti) {
      setSelectedNodeIds(new Set(newNodes.map((node) => node.id)));
    }
  };

  const removeSelectedNodes = () => {
    if (selectedNodeIds.size === 0) return;
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
  };

  const startNodeDrag = (event: React.PointerEvent<HTMLElement>, node: MaterialNode) => {
    if (!isCanvas || event.button !== 0) return;
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("button, input, select, textarea")
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const startedOnTitle =
      event.target instanceof HTMLElement
        ? Boolean(event.target.closest('[data-testid="material-node-title"]'))
        : false;
    headerPressRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: Date.now(),
      nodeId: node.id,
      startedOnTitle,
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
    const distPx = Math.hypot(event.clientX - drag.pointerX, event.clientY - drag.pointerY);
    if (!drag.moved && distPx < 6) {
      return;
    }
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
        const now = Date.now();
        const duration = now - hp.startTime;
        if (movedPx < 6 && duration < 500) {
          if (hp.startedOnTitle) {
            const prevTitleTap = lastTitleTapRef.current;
            if (
              prevTitleTap &&
              prevTitleTap.nodeId === hp.nodeId &&
              now - prevTitleTap.time <= 380 &&
              Math.hypot(event.clientX - prevTitleTap.clientX, event.clientY - prevTitleTap.clientY) <= 24
            ) {
              lastTitleTapRef.current = null;
              const targetNode = graph.nodes.find((n) => n.id === hp.nodeId);
              if (targetNode) startNodeRename(targetNode);
            } else {
              lastTitleTapRef.current = {
                nodeId: hp.nodeId,
                time: now,
                clientX: event.clientX,
                clientY: event.clientY,
              };
            }
          } else {
            toggleNodeCollapsed(hp.nodeId);
          }
        }
      }
    }
    headerPressRef.current = null;
    dragStateRef.current = null;
    setDragPositions(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const startConnectionDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    node: MaterialNode,
    socketId: string,
    direction: "output" | "input",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const point = clientToCanvas(event.clientX, event.clientY);
    connectionPointerClientRef.current = { clientX: event.clientX, clientY: event.clientY };
    const next = {
      fromNodeId: node.id,
      fromSocket: socketId,
      direction,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
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
    Boolean(screenModifiersRef.current?.shift) ||
    holdModifiersRef.current.shift;

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

  const getNodeCanvasBounds = (node: MaterialNode) => {
    const viewport = canvasViewportRef.current;
    const plane = nodePlaneRef.current;
    if (viewport && plane) {
      const cardEl = plane.querySelector<HTMLElement>(`[data-node-id="${node.id}"]`);
      const rect = cardEl?.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        return {
          x: (rect.left - viewportRect.left - panRef.current.x) / zoomRef.current,
          y: (rect.top - viewportRect.top - panRef.current.y) / zoomRef.current,
          width: rect.width / zoomRef.current,
          height: rect.height / zoomRef.current,
        };
      }
    }
    const pos = getNodePosition(node);
    return {
      x: pos.x,
      y: pos.y,
      width: 280,
      height: node.collapsed ? 100 : 260,
    };
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
      clearHoldTimer();
      navigationRef.current = null;
      emptyTapCandidateRef.current = null;
      if (holdModifiersRef.current.shift) {
        setHoldModifiers({ shift: false, ctrl: false, alt: false });
      }
      if (boxSelectionRef.current) {
        boxSelectionRef.current = null;
        setSelectionBox(null);
      }
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
      const pointerCount = activePointersRef.current.size;
      const nextMt = {
        maxCount: Math.max(multiTouchRef.current?.maxCount ?? 0, pointerCount),
        startTime: multiTouchRef.current?.startTime ?? Date.now(),
        prevMid,
        prevDist,
        totalMidMovement: multiTouchRef.current?.totalMidMovement ?? 0,
        totalPinchChange: multiTouchRef.current?.totalPinchChange ?? 0,
        holdActivated: multiTouchRef.current?.holdActivated ?? false,
      };
      multiTouchRef.current = nextMt;
      if (!nextMt.holdActivated) {
        if (pointerCount === 2) {
          holdTimerRef.current = window.setTimeout(() => {
            const mt = multiTouchRef.current;
            if (
              activePointersRef.current.size === 2 &&
              mt &&
              !mt.holdActivated &&
              mt.totalMidMovement + mt.totalPinchChange < 10
            ) {
              mt.holdActivated = true;
              setHoldModifiers({ shift: false, ctrl: true, alt: false });
            }
          }, 260);
        } else if (pointerCount >= 3) {
          holdTimerRef.current = window.setTimeout(() => {
            const mt = multiTouchRef.current;
            if (
              activePointersRef.current.size >= 3 &&
              mt &&
              !mt.holdActivated &&
              mt.totalMidMovement < 12
            ) {
              mt.holdActivated = true;
              setHoldModifiers({ shift: false, ctrl: false, alt: true });
            }
          }, 260);
        }
      }
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
    const additive = Boolean(effectiveCtrl || event.ctrlKey || event.metaKey);

    // Detect double-tap on empty canvas -> start marquee box selection on 2nd press + drag
    const prevTap = lastEmptyTapRef.current;
    const now = Date.now();
    if (
      !spacePressed &&
      event.button === 0 &&
      prevTap &&
      now - prevTap.time <= 380 &&
      Math.hypot(event.clientX - prevTap.clientX, event.clientY - prevTap.clientY) <= 32
    ) {
      lastEmptyTapRef.current = null;
      emptyTapCandidateRef.current = null;
      const startCanvas = clientToCanvas(event.clientX, event.clientY);
      const baseSelectedIds = additive ? new Set(selectedNodeIds) : new Set<string>();
      if (!additive) {
        setSelectedNodeIds(new Set());
      }
      boxSelectionRef.current = {
        pointerId: event.pointerId,
        startCanvas,
        startClientX: event.clientX,
        startClientY: event.clientY,
        additive,
        baseSelectedIds,
      };
      setSelectionBox({ x: startCanvas.x, y: startCanvas.y, width: 0, height: 0 });
      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }

    if (!spacePressed && !shiftActive && !additive) {
      setSelectedNodeIds(new Set());
    }
    if (!spacePressed && event.button === 0) {
      emptyTapCandidateRef.current = {
        time: now,
        clientX: event.clientX,
        clientY: event.clientY,
      };
    } else {
      emptyTapCandidateRef.current = null;
    }
    navigationRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
    if (!spacePressed && !shiftActive && event.button === 0) {
      clearHoldTimer();
      const holdPointerId = event.pointerId;
      const holdClientX = event.clientX;
      const holdClientY = event.clientY;
      holdTimerRef.current = window.setTimeout(() => {
        const nav = navigationRef.current;
        const activePt = activePointersRef.current.get(holdPointerId);
        if (
          activePointersRef.current.size === 1 &&
          nav?.pointerId === holdPointerId &&
          activePt &&
          Math.hypot(activePt.clientX - holdClientX, activePt.clientY - holdClientY) < 8
        ) {
          emptyTapCandidateRef.current = null;
          navigationRef.current = null;
          setHoldModifiers({ shift: true, ctrl: false, alt: false });
          const canvasPt = clientToCanvas(activePt.clientX, activePt.clientY);
          cutStrokeRef.current = {
            pointerId: holdPointerId,
            startClientX: activePt.clientX,
            startClientY: activePt.clientY,
            lastCanvasPoint: canvasPt,
            points: [canvasPt],
            historyPushed: false,
            cutLinkIds: new Set(),
            pendingFromNodeBody: false,
          };
          setCutTrail([canvasPt]);
        }
      }, 260);
    }
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
      const pts = Array.from(activePointersRef.current.values());
      const mt = multiTouchRef.current;
      if (activePointersRef.current.size === 2) {
        const mid: Point2D = {
          x: (pts[0].clientX + pts[1].clientX) / 2,
          y: (pts[0].clientY + pts[1].clientY) / 2,
        };
        const dist = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
        const dMid = Math.hypot(mid.x - mt.prevMid.x, mid.y - mt.prevMid.y);
        const dDist = Math.abs(dist - mt.prevDist);
        mt.totalMidMovement += dMid;
        mt.totalPinchChange += dDist;

        if (mt.totalMidMovement + mt.totalPinchChange >= 10 && !mt.holdActivated) {
          clearHoldTimer();
        }

        if (!mt.holdActivated && (mt.totalMidMovement > 8 || mt.totalPinchChange > 8)) {
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
      } else {
        const mid: Point2D = {
          x: pts.reduce((sum, pt) => sum + pt.clientX, 0) / pts.length,
          y: pts.reduce((sum, pt) => sum + pt.clientY, 0) / pts.length,
        };
        mt.totalMidMovement += Math.hypot(mid.x - mt.prevMid.x, mid.y - mt.prevMid.y);
        mt.prevMid = mid;
        if (mt.totalMidMovement >= 12 && !mt.holdActivated) {
          clearHoldTimer();
        }
      }
      return;
    }

    const boxSel = boxSelectionRef.current;
    if (boxSel?.pointerId === event.pointerId) {
      const currentCanvas = clientToCanvas(event.clientX, event.clientY);
      const rect = {
        x: Math.min(boxSel.startCanvas.x, currentCanvas.x),
        y: Math.min(boxSel.startCanvas.y, currentCanvas.y),
        width: Math.abs(currentCanvas.x - boxSel.startCanvas.x),
        height: Math.abs(currentCanvas.y - boxSel.startCanvas.y),
      };
      setSelectionBox(rect);
      const movedPx = Math.hypot(
        event.clientX - boxSel.startClientX,
        event.clientY - boxSel.startClientY,
      );
      if (movedPx >= 4) {
        const nextIds = new Set(boxSel.baseSelectedIds);
        const right = rect.x + rect.width;
        const bottom = rect.y + rect.height;
        for (const node of latestGraphRef.current.nodes) {
          const b = getNodeCanvasBounds(node);
          const intersects =
            b.x <= right && b.x + b.width >= rect.x && b.y <= bottom && b.y + b.height >= rect.y;
          if (intersects) {
            nextIds.add(node.id);
          }
        }
        setSelectedNodeIds(nextIds);
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
      if (
        Math.hypot(event.clientX - navigation.pointerX, event.clientY - navigation.pointerY) >= 8
      ) {
        clearHoldTimer();
      }
      if (
        emptyTapCandidateRef.current &&
        Math.hypot(
          event.clientX - emptyTapCandidateRef.current.clientX,
          event.clientY - emptyTapCandidateRef.current.clientY,
        ) > 10
      ) {
        emptyTapCandidateRef.current = null;
      }
      const nextPan = {
        x: navigation.panX + event.clientX - navigation.pointerX,
        y: navigation.panY + event.clientY - navigation.pointerY,
      };
      panRef.current = nextPan;
      setPan(nextPan);
    }
    const connection = connectionDragRef.current;
    if (connection?.pointerId === event.pointerId) {
      connectionPointerClientRef.current = { clientX: event.clientX, clientY: event.clientY };
      const point = clientToCanvas(event.clientX, event.clientY);
      const updated = {
        ...connection,
        clientX: event.clientX,
        clientY: event.clientY,
        ...point,
      };
      connectionDragRef.current = updated;
      setConnectionDrag(updated);
    }
  };

  const finishCanvasPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);
    if (activePointersRef.current.size === 0) {
      clearHoldTimer();
    }

    const boxSel = boxSelectionRef.current;
    if (boxSel?.pointerId === event.pointerId) {
      boxSelectionRef.current = null;
      setSelectionBox(null);
      if (activePointersRef.current.size === 0) {
        setHoldModifiers({ shift: false, ctrl: false, alt: false });
      }
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      return;
    }

    const cut = cutStrokeRef.current;
    if (cut?.pointerId === event.pointerId) {
      if (!cut.pendingFromNodeBody) {
        const movedPx = Math.hypot(
          event.clientX - cut.startClientX,
          event.clientY - cut.startClientY,
        );
        if (movedPx < 6 && !holdModifiersRef.current.shift) {
          cutLinksAlongSegment(cut.lastCanvasPoint, cut.lastCanvasPoint);
        }
      }
      cutStrokeRef.current = null;
      setCutTrail(null);
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    if (navigationRef.current?.pointerId === event.pointerId) {
      navigationRef.current = null;
      const tapCand = emptyTapCandidateRef.current;
      emptyTapCandidateRef.current = null;
      if (
        tapCand &&
        Date.now() - tapCand.time < 300 &&
        Math.hypot(event.clientX - tapCand.clientX, event.clientY - tapCand.clientY) <= 10
      ) {
        lastEmptyTapRef.current = {
          time: Date.now(),
          clientX: event.clientX,
          clientY: event.clientY,
        };
      }
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    const mt = multiTouchRef.current;
    if (mt && activePointersRef.current.size === 0) {
      const duration = Date.now() - mt.startTime;
      const totalMotion = mt.totalMidMovement + mt.totalPinchChange;
      const wasHold = mt.holdActivated;
      multiTouchRef.current = null;
      if (!wasHold) {
        if (mt.maxCount === 2 && totalMotion < 14 && duration < 450) {
          onUndo?.();
        } else if (mt.maxCount >= 3 && totalMotion < 18 && duration < 500) {
          onRedo?.();
        }
      }
    }

    if (activePointersRef.current.size === 0) {
      setHoldModifiers({ shift: false, ctrl: false, alt: false });
    }

    const connection = connectionDragRef.current;
    if (connection?.pointerId !== event.pointerId) return;
    const element = document.elementFromPoint?.(event.clientX, event.clientY);
    const targetSelector =
      connection.direction === "output" ? "[data-node-input-socket]" : "[data-node-output-socket]";
    const pointerTarget =
      element instanceof HTMLElement ? element.closest<HTMLElement>(targetSelector) : null;
    const eventTarget =
      event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(targetSelector) : null;
    const target = pointerTarget ?? eventTarget;
    if (target?.dataset.nodeId && target.dataset.socketId) {
      if (connection.direction === "output") {
        connectToSocket(
          connection.fromNodeId,
          connection.fromSocket,
          target.dataset.nodeId,
          target.dataset.socketId,
        );
      } else {
        connectToSocket(
          target.dataset.nodeId,
          target.dataset.socketId,
          connection.fromNodeId,
          connection.fromSocket,
        );
      }
    } else {
      const fromNode = graph.nodes.find((n) => n.id === connection.fromNodeId);
      if (fromNode) {
        const fromDef = getNodeDefinition(fromNode.type);
        const socketDef =
          connection.direction === "output"
            ? fromDef.outputs.find((o) => o.id === connection.fromSocket)
            : fromDef.inputs.find((i) => i.id === connection.fromSocket);
        if (socketDef) {
          const canvasPos = clientToCanvas(event.clientX, event.clientY);
          setSpawnPopup({
            fromNodeId: connection.fromNodeId,
            fromSocket: connection.fromSocket,
            direction: connection.direction,
            socketType: socketDef.type,
            canvasPos,
          });
        }
      }
    }
    connectionDragRef.current = null;
    connectionPointerClientRef.current = null;
    setConnectionDrag(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const cancelCanvasPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);
    if (activePointersRef.current.size === 0) {
      clearHoldTimer();
      multiTouchRef.current = null;
      setHoldModifiers({ shift: false, ctrl: false, alt: false });
    }
    if (boxSelectionRef.current?.pointerId === event.pointerId) {
      boxSelectionRef.current = null;
      setSelectionBox(null);
    }
    if (cutStrokeRef.current?.pointerId === event.pointerId) {
      cutStrokeRef.current = null;
      setCutTrail(null);
    }
    if (navigationRef.current?.pointerId === event.pointerId) {
      navigationRef.current = null;
      emptyTapCandidateRef.current = null;
    }
    if (connectionDragRef.current?.pointerId === event.pointerId) {
      connectionDragRef.current = null;
      connectionPointerClientRef.current = null;
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
    if (event.key === "Escape" && connectionDragRef.current) {
      event.preventDefault();
      connectionDragRef.current = null;
      connectionPointerClientRef.current = null;
      setConnectionDrag(null);
      return;
    }
    const isInputFocused =
      event.target instanceof HTMLElement &&
      event.target.closest("input, select, textarea");
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "d" &&
      selectedNodeIds.size > 0 &&
      !isInputFocused
    ) {
      event.preventDefault();
      duplicateSelection();
      return;
    }
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      selectedNodeIds.size > 0 &&
      !isInputFocused
    ) {
      event.preventDefault();
      removeSelectedNodes();
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
      data-ctrl-active={isCanvas && effectiveCtrl ? "true" : "false"}
      data-alt-active={isCanvas && effectiveAlt ? "true" : "false"}
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
            {connectionDrag &&
              (() => {
                const startSocket =
                  socketPositions[
                    getSocketKey(
                      connectionDrag.fromNodeId,
                      connectionDrag.fromSocket,
                      connectionDrag.direction,
                    )
                  ];
                const sx = startSocket?.x ?? connectionDrag.x;
                const sy = startSocket?.y ?? connectionDrag.y;
                const dirSign = connectionDrag.direction === "output" ? 1 : -1;
                return (
                  <path
                    data-testid="material-node-link-preview"
                    d={`M ${sx} ${sy} C ${sx + 48 * dirSign} ${sy}, ${connectionDrag.x - 48 * dirSign} ${connectionDrag.y}, ${connectionDrag.x} ${connectionDrag.y}`}
                    fill="none"
                    stroke="#f6c453"
                    strokeDasharray="5 4"
                    strokeWidth="2"
                  />
                );
              })()}
            {selectionBox && (
              <rect
                data-testid="material-node-selection-box"
                x={selectionBox.x}
                y={selectionBox.y}
                width={selectionBox.width}
                height={selectionBox.height}
                fill="rgba(94, 205, 110, 0.14)"
                stroke="#5ecd6e"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
            )}
          </svg>
        )}
          {graph.nodes.map((node) => {
            const definition = getNodeDefinition(node.type);
            const displayTitle = getNodeDisplayTitle(node);
            const position = getNodePosition(node);
            const categoryColor = getNodeCategoryColor(definition.category);
            const isCollapsed = Boolean(node.collapsed);
            const isRenaming = renamingNodeId === node.id;
            const isSocketConnected = (sockId: string) =>
              graph.links.some((l) => l.toNodeId === node.id && l.toSocket === sockId);
            return (
              <section
                key={node.id}
                aria-label={displayTitle}
                onClick={(event) => selectNode(event, node.id)}
                data-testid="material-node-card"
                data-node-card="true"
                data-node-id={node.id}
                data-collapsed={isCollapsed ? "true" : "false"}
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
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!isCanvas && !isRenaming) {
                      const target = event.target as HTMLElement;
                      if (!target.closest("button, input, [data-testid='material-node-title']")) {
                        toggleNodeCollapsed(node.id);
                      }
                    }
                  }}
                  className={`flex items-center justify-between gap-2 ${
                    isCollapsed && definition.inputs.length === 0 && definition.outputs.length === 0
                      ? ""
                      : "border-b border-[#2f3440] pb-1.5"
                  } ${isCanvas ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer"}`}
                >
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <button
                      type="button"
                      data-testid="material-node-collapse-btn"
                      aria-label={
                        isCollapsed
                          ? `Expandir nodo ${displayTitle}`
                          : `Contraer nodo ${displayTitle}`
                      }
                      title={isCollapsed ? "Expandir nodo" : "Contraer nodo"}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleNodeCollapsed(node.id);
                      }}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#8e95a2] hover:bg-[#292e38] hover:text-[#d7dbe3]"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                    {isRenaming ? (
                      <div
                        className="flex min-w-0 flex-1 items-center gap-1"
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <input
                          type="text"
                          aria-label={`Renombrar nodo ${displayTitle}`}
                          data-testid="material-node-rename-input"
                          value={renameDraft}
                          autoFocus
                          onChange={(event) => setRenameDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitNodeRename(node.id, event.currentTarget.value);
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              cancelNodeRename();
                            }
                          }}
                          className="h-6 min-w-0 flex-1 rounded border border-[#5ecd6e] bg-[#121418] px-1.5 text-[10px] font-bold text-[#f3f4f6] outline-none"
                        />
                        <button
                          type="button"
                          aria-label="Confirmar nombre del nodo"
                          onClick={(event) => {
                            event.stopPropagation();
                            commitNodeRename(node.id);
                          }}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#213626] text-[#5ecd6e] hover:bg-[#2a4731]"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          aria-label="Cancelar renombrado"
                          onClick={(event) => {
                            event.stopPropagation();
                            cancelNodeRename();
                          }}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#8e95a2] hover:bg-[#292e38] hover:text-[#ff8c8c]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <h3
                        data-testid="material-node-title"
                        title="Toca para seleccionar · Doble toque para renombrar"
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          lastTitleTapRef.current = null;
                          startNodeRename(node);
                        }}
                        className="text-[10px] font-bold uppercase tracking-wide text-[#d7dbe3] truncate select-none"
                      >
                        {displayTitle}
                      </h3>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      aria-label={`Duplicar nodo ${displayTitle}`}
                      title={`Duplicar nodo ${displayTitle}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        duplicateSelection(node);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded text-[#8e95a2] hover:bg-[#292e38] hover:text-[#d7dbe3]"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Eliminar nodo ${displayTitle}`}
                      title={`Eliminar nodo ${displayTitle}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeNode(node.id);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded text-[#8e95a2] hover:bg-[#292e38] hover:text-[#ff8c8c]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </header>

                {definition.inputs.map((input) => {
                  const link = graph.links.find(
                    (item) => item.toNodeId === node.id && item.toSocket === input.id,
                  );
                  const choices = isCollapsed
                    ? []
                    : graph.nodes.flatMap((sourceNode) => {
                        if (sourceNode.id === node.id) return [];
                        const outputs = getNodeDefinition(sourceNode.type).outputs;
                        return outputs
                          .filter((output) =>
                            areMaterialSocketTypesCompatible(output.type, input.type),
                          )
                          .map((output) => ({
                            value: `${sourceNode.id}::${output.id}`,
                            label: `${getNodeDisplayTitle(sourceNode)} · ${output.label}`,
                          }));
                      });
                  return (
                    <div
                      key={input.id}
                      className={`flex items-center gap-1.5 text-[10px] text-[#aeb4c0] ${
                        isCollapsed ? "min-h-5" : "min-h-7"
                      }`}
                    >
                      <button
                        type="button"
                        data-node-input-socket="true"
                        data-node-id={node.id}
                        data-socket-id={input.id}
                        data-socket-key={getSocketKey(node.id, input.id, "input")}
                        aria-label={`Socket de entrada ${displayTitle}: ${input.label}`}
                        title={`${input.label} · ${input.type} (arrastra a una salida)`}
                        className="flex h-5 w-4 shrink-0 items-center justify-center touch-none"
                        onPointerDown={(event) => startConnectionDrag(event, node, input.id, "input")}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full border border-[#111318]"
                          style={{ backgroundColor: getSocketColor(input.type) }}
                        />
                      </button>
                      <span className="min-w-0 flex-1 truncate">{input.label}</span>
                      {!isCollapsed && (
                        <select
                          aria-label={`${displayTitle}: ${input.label}`}
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
                      )}
                    </div>
                  );
                })}

                {!isCollapsed && node.type === "principled_bsdf" && (
                  <div className="space-y-1.5">
                    <label
                      className={`flex items-center justify-between gap-2 text-[10px] text-[#aeb4c0] ${
                        isSocketConnected("baseColor") ? "opacity-60" : ""
                      }`}
                    >
                      <span>
                        Color base
                        {isSocketConnected("baseColor") ? " (conectado)" : ""}
                      </span>
                      <input
                        type="color"
                        aria-label="Color base Principled BSDF"
                        disabled={isSocketConnected("baseColor")}
                        value={String(node.values.baseColor ?? material.baseColor)}
                        onPointerDown={onBeginEdit}
                        onChange={(event) => updateNode(node.id, { baseColor: event.target.value })}
                        className="h-7 w-14 cursor-pointer rounded border border-[#343a46] bg-[#121418] p-0.5 disabled:cursor-not-allowed"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          ["metallic", "Metallic", "Metallic Principled BSDF", material.metallic],
                          ["roughness", "Rugosidad", "Rugosidad Principled BSDF", material.roughness],
                          ["alpha", "Opacidad", "Opacidad Principled BSDF", material.opacity ?? 1],
                          ["ior", "IOR", "IOR", 1.45],
                          ["specular", "Specular", "Specular", 0.5],
                          ["emissionStrength", "Emisión", "Emission Strength", material.emissiveIntensity ?? 0],
                        ] as const
                      ).map(([key, label, ariaLabel, fallback]) => {
                        const spec = getNodeNumericParamSpec("principled_bsdf", key);
                        return (
                          <NodeNumericBar
                            key={key}
                            label={label}
                            ariaLabel={ariaLabel}
                            value={Number(node.values[key] ?? fallback)}
                            min={spec.min}
                            max={spec.max}
                            step={spec.step}
                            decimals={spec.decimals}
                            clampMin={spec.clampMin}
                            clampMax={spec.clampMax}
                            connected={isSocketConnected(key)}
                            compact
                            onBeginEdit={onBeginEdit}
                            onChange={(val) => updateNode(node.id, { [key]: val })}
                          />
                        );
                      })}
                    </div>
                    <label
                      className={`flex items-center justify-between gap-2 text-[10px] text-[#aeb4c0] ${
                        isSocketConnected("emission") ? "opacity-60" : ""
                      }`}
                    >
                      <span>
                        Emisión
                        {isSocketConnected("emission") ? " (conectado)" : ""}
                      </span>
                      <input
                        type="color"
                        aria-label="Color de emisión"
                        disabled={isSocketConnected("emission")}
                        value={String(node.values.emission ?? "#000000")}
                        onPointerDown={onBeginEdit}
                        onChange={(event) => updateNode(node.id, { emission: event.target.value })}
                        className="h-7 w-14 cursor-pointer rounded border border-[#343a46] bg-[#121418] p-0.5 disabled:cursor-not-allowed"
                      />
                    </label>
                  </div>
                )}

                {!isCollapsed && node.type === "emission" && (() => {
                  const strengthSpec = getNodeNumericParamSpec("emission", "strength");
                  return (
                    <div className="space-y-1.5">
                      <label
                        className={`flex items-center justify-between gap-2 text-[10px] text-[#aeb4c0] ${
                          isSocketConnected("color") ? "opacity-60" : ""
                        }`}
                      >
                        <span>
                          Color
                          {isSocketConnected("color") ? " (conectado)" : ""}
                        </span>
                        <input
                          type="color"
                          aria-label="Color Emission"
                          disabled={isSocketConnected("color")}
                          value={String(node.values.color ?? "#ffffff")}
                          onPointerDown={onBeginEdit}
                          onChange={(event) => updateNode(node.id, { color: event.target.value })}
                          className="h-7 w-14 cursor-pointer rounded border border-[#343a46] bg-[#121418] p-0.5 disabled:cursor-not-allowed"
                        />
                      </label>
                      <NodeNumericBar
                        label="Fuerza"
                        ariaLabel="Fuerza Emission"
                        value={Number(node.values.strength ?? 1)}
                        min={strengthSpec.min}
                        max={strengthSpec.max}
                        step={strengthSpec.step}
                        decimals={strengthSpec.decimals}
                        clampMin={strengthSpec.clampMin}
                        clampMax={strengthSpec.clampMax}
                        connected={isSocketConnected("strength")}
                        onBeginEdit={onBeginEdit}
                        onChange={(val) => updateNode(node.id, { strength: val })}
                      />
                    </div>
                  );
                })()}

                {!isCollapsed && node.type === "math" && (
                  <div className="space-y-1.5">
                    <label className="block space-y-1 text-[10px] text-[#aeb4c0]">
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
                    <div className="grid grid-cols-2 gap-1.5">
                      {(["a", "b"] as const).map((key) => {
                        const spec = getNodeNumericParamSpec("math", key);
                        return (
                          <NodeNumericBar
                            key={key}
                            label={`Valor ${key.toUpperCase()}`}
                            ariaLabel={`Valor Math ${key.toUpperCase()}`}
                            value={Number(node.values[key] ?? 0)}
                            min={spec.min}
                            max={spec.max}
                            step={spec.step}
                            decimals={spec.decimals}
                            connected={isSocketConnected(key)}
                            compact
                            onBeginEdit={onBeginEdit}
                            onChange={(val) => updateNode(node.id, { [key]: val })}
                          />
                        );
                      })}
                    </div>
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
                      const vector = Array.isArray(node.values[key])
                        ? node.values[key].map(Number)
                        : [...defaults];
                      return (
                        <NodeVectorSliders
                          key={key}
                          legend={label}
                          ariaPrefix={label}
                          vector={vector}
                          defaults={defaults}
                          spec={getNodeNumericParamSpec("mapping", key)}
                          onBeginEdit={onBeginEdit}
                          onChange={(nextVector) => updateNode(node.id, { [key]: nextVector })}
                        />
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
                      const vector = Array.isArray(node.values[key])
                        ? node.values[key].map(Number)
                        : [...defaults];
                      return (
                        <NodeVectorSliders
                          key={key}
                          legend={label}
                          ariaPrefix={label}
                          vector={vector}
                          defaults={defaults}
                          spec={getNodeNumericParamSpec("transform", key)}
                          onBeginEdit={onBeginEdit}
                          onChange={(nextVector) => updateNode(node.id, { [key]: nextVector })}
                        />
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
                    {node.type === "value_float" && (() => {
                      const spec = getNodeNumericParamSpec("value_float", "value");
                      return (
                        <NodeNumericBar
                          label="Valor"
                          ariaLabel="Valor Float"
                          value={Number(node.values.value ?? 0)}
                          min={spec.min}
                          max={spec.max}
                          step={spec.step}
                          decimals={spec.decimals}
                          numericMode="number"
                          onBeginEdit={onBeginEdit}
                          onChange={(val) => updateNode(node.id, { value: val })}
                        />
                      );
                    })()}
                    {node.type === "value_integer" && (() => {
                      const spec = getNodeNumericParamSpec("value_integer", "value");
                      return (
                        <NodeNumericBar
                          label="Valor entero"
                          ariaLabel="Valor Integer"
                          value={Math.trunc(Number(node.values.value ?? 0))}
                          min={spec.min}
                          max={spec.max}
                          step={spec.step}
                          decimals={0}
                          onBeginEdit={onBeginEdit}
                          onChange={(val) => updateNode(node.id, { value: Math.trunc(val) })}
                        />
                      );
                    })()}
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
                          ? node.values.value.map(Number)
                          : [0, 0, 0];
                        return (
                          <NodeVectorSliders
                            legend="Vector"
                            ariaPrefix="Valor Vector"
                            vector={vector}
                            defaults={[0, 0, 0]}
                            spec={getNodeNumericParamSpec("value_vector", "value")}
                            onBeginEdit={onBeginEdit}
                            onChange={(nextVector) => updateNode(node.id, { value: nextVector })}
                          />
                        );
                      })()}
                  </div>
                )}

                {!isCollapsed && node.type === "normal_map" && (() => {
                  const spec = getNodeNumericParamSpec("normal_map", "strength");
                  return (
                    <NodeNumericBar
                      label="Intensidad"
                      ariaLabel="Intensidad Normal Map"
                      value={Number(node.values.strength ?? 1)}
                      min={spec.min}
                      max={spec.max}
                      step={spec.step}
                      decimals={spec.decimals}
                      clampMin={spec.clampMin}
                      connected={isSocketConnected("strength")}
                      onBeginEdit={onBeginEdit}
                      onChange={(val) => updateNode(node.id, { strength: val })}
                    />
                  );
                })()}

                {!isCollapsed && node.type === "bump" && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["strength", "distance"] as const).map((key) => {
                      const spec = getNodeNumericParamSpec("bump", key);
                      return (
                        <NodeNumericBar
                          key={key}
                          label={key === "strength" ? "Intensidad" : "Distancia"}
                          ariaLabel={`Bump ${key === "strength" ? "intensidad" : "distancia"}`}
                          value={Number(node.values[key] ?? 1)}
                          min={spec.min}
                          max={spec.max}
                          step={spec.step}
                          decimals={spec.decimals}
                          clampMin={spec.clampMin}
                          connected={isSocketConnected(key)}
                          compact
                          onBeginEdit={onBeginEdit}
                          onChange={(val) => updateNode(node.id, { [key]: val })}
                        />
                      );
                    })}
                  </div>
                )}

                {!isCollapsed && (node.type === "mix_color" ||
                  node.type === "mix_float" ||
                  node.type === "mix_vector") && (() => {
                  const factorSpec = getNodeNumericParamSpec(node.type, "factor");
                  return (
                    <div className="space-y-1.5">
                      <label className="flex items-center justify-between gap-2 text-[10px] text-[#aeb4c0]">
                        Operación
                        <select
                          aria-label={`Operación ${definition.label}`}
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
                      <NodeNumericBar
                        label="Factor"
                        ariaLabel={`Factor ${definition.label}`}
                        value={Number(node.values.factor ?? 0.5)}
                        min={factorSpec.min}
                        max={factorSpec.max}
                        step={factorSpec.step}
                        decimals={factorSpec.decimals}
                        clampMin={factorSpec.clampMin}
                        clampMax={factorSpec.clampMax}
                        connected={isSocketConnected("factor")}
                        onBeginEdit={onBeginEdit}
                        onChange={(val) => updateNode(node.id, { factor: val })}
                      />
                      {node.type === "mix_color" && (
                        <div className="grid grid-cols-2 gap-1.5">
                          {(["colorA", "colorB"] as const).map((key) => (
                            <label key={key} className="space-y-1 text-[10px] text-[#aeb4c0]">
                              Color {key === "colorA" ? "A" : "B"}
                              <input
                                type="color"
                                aria-label={`Color ${key === "colorA" ? "A" : "B"} Mix Color`}
                                disabled={isSocketConnected(key)}
                                value={String(node.values[key] ?? "#ffffff")}
                                onPointerDown={onBeginEdit}
                                onChange={(event) => updateNode(node.id, { [key]: event.target.value })}
                                className="h-7 w-full cursor-pointer rounded border border-[#343a46] bg-[#121418] p-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                              />
                            </label>
                          ))}
                        </div>
                      )}
                      {node.type === "mix_float" && (
                        <div className="grid grid-cols-2 gap-1.5">
                          {(["a", "b"] as const).map((key) => {
                            const spec = getNodeNumericParamSpec("mix_float", key);
                            return (
                              <NodeNumericBar
                                key={key}
                                label={`Valor ${key.toUpperCase()}`}
                                ariaLabel={`Mix Float ${key.toUpperCase()}`}
                                value={Number(node.values[key] ?? 0)}
                                min={spec.min}
                                max={spec.max}
                                step={spec.step}
                                decimals={spec.decimals}
                                connected={isSocketConnected(key)}
                                compact
                                onBeginEdit={onBeginEdit}
                                onChange={(val) => updateNode(node.id, { [key]: val })}
                              />
                            );
                          })}
                        </div>
                      )}
                      {node.type === "mix_vector" && (
                        <div className="space-y-1.5">
                          {(["a", "b"] as const).map((key) => {
                            const vector = Array.isArray(node.values[key])
                              ? node.values[key].map(Number)
                              : [0, 0, 0];
                            return (
                              <NodeVectorSliders
                                key={key}
                                legend={`Vector ${key.toUpperCase()}`}
                                ariaPrefix={`Mix Vector ${key.toUpperCase()}`}
                                vector={vector}
                                defaults={[0, 0, 0]}
                                spec={getNodeNumericParamSpec("mix_vector", key)}
                                connected={isSocketConnected(key)}
                                onBeginEdit={onBeginEdit}
                                onChange={(nextVector) => updateNode(node.id, { [key]: nextVector })}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {!isCollapsed && node.type === "color_ramp" && (
                  <ColorRampControls
                    node={node}
                    factorConnected={isSocketConnected("factor")}
                    onBeginEdit={onBeginEdit}
                    onChange={(values) => updateNode(node.id, values)}
                  />
                )}

                {!isCollapsed && node.type === "noise_texture" && (() => {
                  const dimensions = String(node.values.dimensions ?? "3D");
                  const isConnected = (sock: string) =>
                    graph.links.some((l) => l.toNodeId === node.id && l.toSocket === sock);
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex flex-1 items-center justify-between gap-1.5 text-[10px] text-[#aeb4c0]">
                          <span>Dimensiones</span>
                          <select
                            aria-label="Dimensiones Noise Texture"
                            value={dimensions}
                            onFocus={onBeginEdit}
                            onChange={(event) => updateNode(node.id, { dimensions: event.target.value })}
                            className="h-7 rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                          >
                            <option value="1D">1D</option>
                            <option value="2D">2D</option>
                            <option value="3D">3D</option>
                            <option value="4D">4D</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-1.5 text-[10px] text-[#aeb4c0]">
                          <input
                            type="checkbox"
                            aria-label="Normalizar Noise Texture"
                            checked={node.values.normalize !== false}
                            onChange={(event) =>
                              updateNode(node.id, { normalize: event.target.checked })
                            }
                            className="accent-[#5ecd6e]"
                          />
                          Normalizar
                        </label>
                      </div>
                      {(dimensions === "4D" || dimensions === "1D") && (
                        <NodeNumericBar
                          label="W"
                          ariaLabel="W Noise Texture"
                          value={Number(node.values.w ?? 0)}
                          min={-10}
                          max={10}
                          step={0.05}
                          connected={isConnected("w")}
                          onBeginEdit={onBeginEdit}
                          onChange={(val) => updateNode(node.id, { w: val })}
                        />
                      )}
                      <NodeNumericBar
                        label="Escala"
                        ariaLabel="Escala Noise Texture"
                        value={Number(node.values.scale ?? 5)}
                        min={0.1}
                        max={40}
                        step={0.1}
                        connected={isConnected("scale")}
                        onBeginEdit={onBeginEdit}
                        onChange={(val) => updateNode(node.id, { scale: val })}
                      />
                      <NodeNumericBar
                        label="Detalle"
                        ariaLabel="Detalle Noise Texture"
                        value={Number(node.values.detail ?? 2)}
                        min={0}
                        max={15}
                        step={0.1}
                        clampMin={0}
                        clampMax={15}
                        connected={isConnected("detail")}
                        onBeginEdit={onBeginEdit}
                        onChange={(val) => updateNode(node.id, { detail: val })}
                      />
                      <NodeNumericBar
                        label="Rugosidad"
                        ariaLabel="Rugosidad Noise Texture"
                        value={Number(node.values.roughness ?? 0.5)}
                        min={0}
                        max={1}
                        step={0.01}
                        clampMin={0}
                        clampMax={1}
                        connected={isConnected("roughness")}
                        onBeginEdit={onBeginEdit}
                        onChange={(val) => updateNode(node.id, { roughness: val })}
                      />
                      <NodeNumericBar
                        label="Lagunaridad"
                        ariaLabel="Lagunaridad Noise Texture"
                        value={Number(node.values.lacunarity ?? 2)}
                        min={0.1}
                        max={8}
                        step={0.05}
                        clampMin={0.01}
                        connected={isConnected("lacunarity")}
                        onBeginEdit={onBeginEdit}
                        onChange={(val) => updateNode(node.id, { lacunarity: val })}
                      />
                      <NodeNumericBar
                        label="Desplazamiento"
                        ariaLabel="Desplazamiento Noise Texture"
                        value={Number(node.values.offset ?? 0)}
                        min={-2}
                        max={2}
                        step={0.05}
                        connected={isConnected("offset")}
                        onBeginEdit={onBeginEdit}
                        onChange={(val) => updateNode(node.id, { offset: val })}
                      />
                      <NodeNumericBar
                        label="Distorsión"
                        ariaLabel="Distorsión Noise Texture"
                        value={Number(node.values.distortion ?? 0)}
                        min={-5}
                        max={5}
                        step={0.05}
                        connected={isConnected("distortion")}
                        onBeginEdit={onBeginEdit}
                        onChange={(val) => updateNode(node.id, { distortion: val })}
                      />
                    </div>
                  );
                })()}

                {!isCollapsed && node.type === "voronoi_texture" && (() => {
                  const dimensions = String(node.values.dimensions ?? "3D");
                  const feature = String(node.values.feature ?? "f1");
                  const distanceMetric = String(node.values.distanceMetric ?? "euclidean");
                  const detail = Number(node.values.detail ?? 0);
                  const isConnected = (sock: string) =>
                    graph.links.some((l) => l.toNodeId === node.id && l.toSocket === sock);
                  return (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 gap-1.5">
                        <label className="space-y-0.5 text-[10px] text-[#aeb4c0]">
                          <span>Dimensiones</span>
                          <select
                            aria-label="Dimensiones Voronoi Texture"
                            value={dimensions}
                            onFocus={onBeginEdit}
                            onChange={(event) => updateNode(node.id, { dimensions: event.target.value })}
                            className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                          >
                            <option value="1D">1D</option>
                            <option value="2D">2D</option>
                            <option value="3D">3D</option>
                            <option value="4D">4D</option>
                          </select>
                        </label>
                        <label className="space-y-0.5 text-[10px] text-[#aeb4c0]">
                          <span>Característica</span>
                          <select
                            aria-label="Característica Voronoi Texture"
                            value={feature}
                            onFocus={onBeginEdit}
                            onChange={(event) => updateNode(node.id, { feature: event.target.value })}
                            className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                          >
                            <option value="f1">F1</option>
                            <option value="f2">F2</option>
                            <option value="smooth_f1">Smooth F1</option>
                            <option value="distance_to_edge">Distance to Edge</option>
                            <option value="n_sphere_radius">N-Sphere Radius</option>
                          </select>
                        </label>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex flex-1 items-center justify-between gap-1.5 text-[10px] text-[#aeb4c0]">
                          <span>Métrica</span>
                          <select
                            aria-label="Métrica Voronoi Texture"
                            value={distanceMetric}
                            onFocus={onBeginEdit}
                            onChange={(event) =>
                              updateNode(node.id, { distanceMetric: event.target.value })
                            }
                            className="h-7 min-w-0 flex-1 rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                          >
                            <option value="euclidean">Euclidean</option>
                            <option value="manhattan">Manhattan</option>
                            <option value="chebychev">Chebychev</option>
                            <option value="minkowski">Minkowski</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-1.5 text-[10px] text-[#aeb4c0]">
                          <input
                            type="checkbox"
                            aria-label="Normalizar Voronoi Texture"
                            checked={Boolean(node.values.normalize)}
                            onChange={(event) =>
                              updateNode(node.id, { normalize: event.target.checked })
                            }
                            className="accent-[#5ecd6e]"
                          />
                          Normalizar
                        </label>
                      </div>
                      {(dimensions === "4D" || dimensions === "1D") && (
                        <NodeNumericBar
                          label="W"
                          ariaLabel="W Voronoi Texture"
                          value={Number(node.values.w ?? 0)}
                          min={-10}
                          max={10}
                          step={0.05}
                          connected={isConnected("w")}
                          onBeginEdit={onBeginEdit}
                          onChange={(val) => updateNode(node.id, { w: val })}
                        />
                      )}
                      <NodeNumericBar
                        label="Escala"
                        ariaLabel="Escala Voronoi Texture"
                        value={Number(node.values.scale ?? 5)}
                        min={0.1}
                        max={40}
                        step={0.1}
                        connected={isConnected("scale")}
                        onBeginEdit={onBeginEdit}
                        onChange={(val) => updateNode(node.id, { scale: val })}
                      />
                      <NodeNumericBar
                        label="Detalle"
                        ariaLabel="Detalle Voronoi Texture"
                        value={detail}
                        min={0}
                        max={15}
                        step={0.1}
                        clampMin={0}
                        clampMax={15}
                        connected={isConnected("detail")}
                        onBeginEdit={onBeginEdit}
                        onChange={(val) => updateNode(node.id, { detail: val })}
                      />
                      {detail > 0 && (
                        <>
                          <NodeNumericBar
                            label="Rugosidad"
                            ariaLabel="Rugosidad Voronoi Texture"
                            value={Number(node.values.roughness ?? 0.5)}
                            min={0}
                            max={1}
                            step={0.01}
                            clampMin={0}
                            clampMax={1}
                            connected={isConnected("roughness")}
                            onBeginEdit={onBeginEdit}
                            onChange={(val) => updateNode(node.id, { roughness: val })}
                          />
                          <NodeNumericBar
                            label="Lagunaridad"
                            ariaLabel="Lagunaridad Voronoi Texture"
                            value={Number(node.values.lacunarity ?? 2)}
                            min={0.1}
                            max={8}
                            step={0.05}
                            clampMin={0.01}
                            connected={isConnected("lacunarity")}
                            onBeginEdit={onBeginEdit}
                            onChange={(val) => updateNode(node.id, { lacunarity: val })}
                          />
                        </>
                      )}
                      {feature === "smooth_f1" && (
                        <NodeNumericBar
                          label="Suavizado"
                          ariaLabel="Suavizado Voronoi Texture"
                          value={Number(node.values.smoothness ?? 1)}
                          min={0}
                          max={1}
                          step={0.01}
                          clampMin={0}
                          clampMax={1}
                          connected={isConnected("smoothness")}
                          onBeginEdit={onBeginEdit}
                          onChange={(val) => updateNode(node.id, { smoothness: val })}
                        />
                      )}
                      {distanceMetric === "minkowski" && (
                        <NodeNumericBar
                          label="Exponente"
                          ariaLabel="Exponente Voronoi Texture"
                          value={Number(node.values.exponent ?? 0.5)}
                          min={0.1}
                          max={8}
                          step={0.05}
                          clampMin={0.05}
                          connected={isConnected("exponent")}
                          onBeginEdit={onBeginEdit}
                          onChange={(val) => updateNode(node.id, { exponent: val })}
                        />
                      )}
                      <NodeNumericBar
                        label="Aleatoriedad"
                        ariaLabel="Aleatoriedad Voronoi Texture"
                        value={Number(node.values.randomness ?? 1)}
                        min={0}
                        max={1}
                        step={0.01}
                        clampMin={0}
                        clampMax={1}
                        connected={isConnected("randomness")}
                        onBeginEdit={onBeginEdit}
                        onChange={(val) => updateNode(node.id, { randomness: val })}
                      />
                    </div>
                  );
                })()}

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
                          aria-label={`Socket de salida ${displayTitle}: ${output.label}`}
                          title={`${output.label} · ${output.type} (arrastra a una entrada)`}
                          className="flex h-5 w-4 shrink-0 items-center justify-center touch-none"
                          onPointerDown={(event) => startConnectionDrag(event, node, output.id, "output")}
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

  const reserveWrench = Boolean(
    splitContext && !splitContext.sceneVisible && splitContext.reserveTopLeftWrench,
  );
  const reserveCorner = Boolean(
    splitContext &&
      !splitContext.sceneVisible &&
      splitContext.reserveTopLeftCorner &&
      splitContext.reserveTopLeftWrench,
  );
  const toolbarPositionClass = reserveCorner
    ? "top-[98px] left-2 right-2 sm:top-2 sm:left-[196px]"
    : reserveWrench
      ? "top-[50px] left-2 right-2 sm:top-2 sm:left-[196px]"
      : "top-2 left-2 right-2";

  return (
    <div
      data-testid="material-node-canvas-shell"
      className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#121418]"
    >
      <div
        className={`pointer-events-none absolute ${toolbarPositionClass} z-20 flex flex-wrap items-center justify-between gap-2`}
      >
        <div
          onPointerDown={(event) => event.stopPropagation()}
          className="pointer-events-auto flex min-w-0 max-w-full flex-wrap items-center gap-1.5 rounded-md border border-[#2b2e36] bg-[#16181d]/90 p-1 shadow-md backdrop-blur-sm"
        >
          {splitContext && (
            <button
              type="button"
              data-testid="material-toggle-3d-viewport"
              aria-label={splitContext.sceneVisible ? "Ocultar visor 3D" : "Mostrar visor 3D"}
              title={
                splitContext.sceneVisible
                  ? "Ocultar el visor 3D y ampliar el editor de nodos"
                  : "Mostrar el visor 3D conservando la escena y el tamaño anterior"
              }
              onClick={splitContext.toggleSceneVisible}
              className="flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-[#5ecd6e]/70 bg-[#1c2320] px-3 text-[11px] font-semibold text-[#e2f5e6] hover:border-[#5ecd6e] hover:bg-[#253129] hover:text-white shadow-sm touch-manipulation"
            >
              {splitContext.sceneVisible ? (
                <EyeOff aria-hidden="true" className="h-4 w-4 text-[#5ecd6e]" />
              ) : (
                <Eye aria-hidden="true" className="h-4 w-4 text-[#5ecd6e]" />
              )}
              <span>{splitContext.sceneVisible ? "Ocultar visor 3D" : "Mostrar visor 3D"}</span>
            </button>
          )}
          {toolbarStart}
          {addNodeSelect}
        </div>
        <div
          onPointerDown={(event) => event.stopPropagation()}
          className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-md border border-[#2b2e36] bg-[#16181d]/90 p-1 shadow-md backdrop-blur-sm"
        >
          <label
            className="hidden sm:flex items-center gap-1 pr-1 text-[10px] text-[#9aa3b2]"
            title="Velocidad de paneo automático al arrastrar conexiones cerca de los bordes"
          >
            <span>Auto-paneo</span>
            <select
              aria-label="Velocidad de paneo automático"
              value={String(autoPanSpeed)}
              onChange={(event) => setAutoPanSpeed(Number(event.target.value))}
              className="h-7 rounded border border-[#343a46] bg-[#181b22] px-1 text-[10px] text-[#cbd5e1] outline-none focus:border-[#5ecd6e]"
            >
              <option value="0.5">0.5x</option>
              <option value="1">1x</option>
              <option value="1.8">1.8x</option>
            </select>
          </label>
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

      {selectedNodeIds.size > 1 && (
        <div
          data-testid="material-node-multiselection-bar"
          onPointerDown={(event) => event.stopPropagation()}
          className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-[#5ecd6e]/60 bg-[#16181d]/95 px-3 py-1.5 text-[11px] text-[#e2e8f0] shadow-xl backdrop-blur-sm"
        >
          <span className="font-semibold text-[#5ecd6e]">
            {selectedNodeIds.size} nodos seleccionados
          </span>
          <button
            type="button"
            aria-label="Duplicar selección"
            onClick={() => duplicateSelection()}
            className="flex items-center gap-1 rounded border border-[#343a46] bg-[#181b22] px-2 py-1 text-[10px] hover:border-[#5ecd6e]"
          >
            <Copy className="h-3 w-3" />
            Duplicar
          </button>
          <button
            type="button"
            aria-label="Eliminar selección"
            onClick={removeSelectedNodes}
            className="flex items-center gap-1 rounded border border-[#343a46] bg-[#181b22] px-2 py-1 text-[10px] text-[#fca5a5] hover:border-[#f87171]"
          >
            <Trash2 className="h-3 w-3" />
            Eliminar
          </button>
          <button
            type="button"
            aria-label="Limpiar selección"
            onClick={() => setSelectedNodeIds(new Set())}
            className="rounded p-1 text-[#8e95a2] hover:bg-[#292e38] hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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
