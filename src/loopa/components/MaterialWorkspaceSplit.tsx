import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Eye, EyeOff } from "lucide-react";

interface MaterialWorkspaceSplitProps {
  enabled: boolean;
  children: ReactNode;
  editor: ReactNode;
  reserveTopLeftCorner?: boolean;
  reserveTopLeftWrench?: boolean;
}

export interface MaterialWorkspaceSplitContextValue {
  sceneVisible: boolean;
  setSceneVisible: React.Dispatch<React.SetStateAction<boolean>>;
  toggleSceneVisible: () => void;
  reserveTopLeftCorner: boolean;
  reserveTopLeftWrench: boolean;
  registerInlineToggle: () => () => void;
}

const MaterialWorkspaceSplitContext =
  createContext<MaterialWorkspaceSplitContextValue | null>(null);

export function useMaterialWorkspaceSplit(): MaterialWorkspaceSplitContextValue | null {
  return useContext(MaterialWorkspaceSplitContext);
}

const MIN_SCENE_RATIO = 0.28;
const MAX_SCENE_RATIO = 0.72;

export const MaterialWorkspaceSplit: React.FC<MaterialWorkspaceSplitProps> = ({
  enabled,
  children,
  editor,
  reserveTopLeftCorner = false,
  reserveTopLeftWrench = false,
}) => {
  const [sceneVisible, setSceneVisible] = useState(true);
  const [sceneRatio, setSceneRatio] = useState(0.58);
  const [inlineToggleCount, setInlineToggleCount] = useState(0);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const toggleSceneVisible = useCallback(() => {
    setSceneVisible((v) => !v);
  }, []);

  const registerInlineToggle = useCallback(() => {
    setInlineToggleCount((count) => count + 1);
    return () => {
      setInlineToggleCount((count) => Math.max(0, count - 1));
    };
  }, []);

  const contextValue = useMemo<MaterialWorkspaceSplitContextValue>(
    () => ({
      sceneVisible,
      setSceneVisible,
      toggleSceneVisible,
      reserveTopLeftCorner,
      reserveTopLeftWrench,
      registerInlineToggle,
    }),
    [
      registerInlineToggle,
      reserveTopLeftCorner,
      reserveTopLeftWrench,
      sceneVisible,
      toggleSceneVisible,
    ],
  );

  if (!enabled) return <>{children}</>;

  const resizeFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    const bounds = splitRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return;
    const nextRatio = (event.clientX - bounds.left) / bounds.width;
    setSceneRatio(Math.min(MAX_SCENE_RATIO, Math.max(MIN_SCENE_RATIO, nextRatio)));
  };

  const stopResizing = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    activePointerIdRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const fallbackButtonPositionClass =
    reserveTopLeftCorner && reserveTopLeftWrench
      ? "top-[98px] left-2 sm:top-2 sm:left-[196px]"
      : reserveTopLeftWrench
        ? "top-[50px] left-2 sm:top-2 sm:left-[196px]"
        : "top-2 left-2";

  return (
    <MaterialWorkspaceSplitContext.Provider value={contextValue}>
      <div
        ref={splitRef}
        data-testid="material-workspace-split"
        className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden relative"
      >
        <div
          data-testid="material-world-viewport"
          aria-label="World / escena 3D"
          className="h-full min-h-0 min-w-[260px] overflow-hidden transition-all duration-200"
          style={{
            display: sceneVisible ? "block" : "none",
            flex: `0 0 ${sceneRatio * 100}%`,
          }}
        >
          {children}
        </div>
        <div
          role="separator"
          aria-label="Ajustar tamaño de los visores de Materials"
          aria-orientation="vertical"
          aria-valuemin={MIN_SCENE_RATIO * 100}
          aria-valuemax={MAX_SCENE_RATIO * 100}
          aria-valuenow={Math.round(sceneRatio * 100)}
          tabIndex={0}
          data-testid="material-workspace-divider"
          className="z-20 w-2 shrink-0 cursor-col-resize touch-none bg-[#252a33] transition-colors hover:bg-[#5ecd6e] focus-visible:bg-[#5ecd6e] focus-visible:outline-none relative flex items-center justify-center"
          style={{ display: sceneVisible ? "flex" : "none" }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const direction = event.key === "ArrowRight" ? 1 : -1;
            setSceneRatio((current) =>
              Math.min(MAX_SCENE_RATIO, Math.max(MIN_SCENE_RATIO, current + direction * 0.03)),
            );
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            activePointerIdRef.current = event.pointerId;
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onPointerMove={resizeFromPointer}
          onPointerUp={stopResizing}
          onPointerCancel={stopResizing}
        >
          {sceneVisible && inlineToggleCount === 0 && (
            <button
              type="button"
              data-testid="material-toggle-3d-viewport"
              aria-label="Ocultar visor 3D"
              title="Ocultar visor 3D y expandir el editor de nodos"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setSceneVisible(false);
              }}
              className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#5ecd6e]/70 bg-[#181b22] text-[#cbd5e1] hover:border-[#5ecd6e] hover:bg-[#252a34] hover:text-white shadow-lg touch-manipulation"
            >
              <EyeOff className="h-5 w-5 text-[#5ecd6e]" />
            </button>
          )}
        </div>

        {!sceneVisible && inlineToggleCount === 0 && (
          <button
            type="button"
            data-testid="material-toggle-3d-viewport"
            aria-label="Mostrar visor 3D"
            title="Mostrar visor 3D restaurando la escena y el tamaño anterior"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setSceneVisible(true)}
            className={`absolute ${fallbackButtonPositionClass} z-40 flex h-10 items-center gap-2 rounded-lg border-2 border-[#5ecd6e]/70 bg-[#181b22]/95 px-3.5 text-[11px] font-semibold text-[#e2e8f0] hover:border-[#5ecd6e] hover:bg-[#252a34] hover:text-white shadow-lg backdrop-blur-sm touch-manipulation`}
          >
            <Eye className="h-4 w-4 text-[#5ecd6e]" />
            <span>Mostrar visor 3D</span>
          </button>
        )}

        <div
          data-testid="material-node-viewport"
          aria-label="Editor de nodos"
          className="h-full min-h-0 min-w-[280px] flex-1 overflow-hidden"
        >
          {editor}
        </div>
      </div>
    </MaterialWorkspaceSplitContext.Provider>
  );
};

