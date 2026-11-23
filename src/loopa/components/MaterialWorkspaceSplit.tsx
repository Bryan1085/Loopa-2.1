import React, { ReactNode, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface MaterialWorkspaceSplitProps {
  enabled: boolean;
  children: ReactNode;
  editor: ReactNode;
}

const MIN_SCENE_RATIO = 0.28;
const MAX_SCENE_RATIO = 0.72;

export const MaterialWorkspaceSplit: React.FC<MaterialWorkspaceSplitProps> = ({
  enabled,
  children,
  editor,
}) => {
  const [sceneVisible, setSceneVisible] = useState(true);
  const [sceneRatio, setSceneRatio] = useState(0.58);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

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

  return (
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
        className="z-10 w-2 shrink-0 cursor-col-resize touch-none bg-[#252a33] transition-colors hover:bg-[#5ecd6e] focus-visible:bg-[#5ecd6e] focus-visible:outline-none relative flex items-center justify-center"
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
        <button
          type="button"
          data-testid="material-toggle-3d-viewport"
          aria-label={sceneVisible ? "Ocultar visor 3D" : "Mostrar visor 3D"}
          title={sceneVisible ? "Ocultar visor 3D" : "Mostrar visor 3D"}
          onClick={(e) => {
            e.stopPropagation();
            setSceneVisible((v) => !v);
          }}
          className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-[#3c4354] bg-[#1a1d24] text-[#cbd5e1] hover:bg-[#282e3c] hover:text-white shadow-md touch-manipulation"
        >
          {sceneVisible ? <EyeOff className="h-3.5 w-3.5 text-[#5ecd6e]" /> : <Eye className="h-3.5 w-3.5 text-[#5ecd6e]" />}
        </button>
      </div>

      {!sceneVisible && (
        <button
          type="button"
          data-testid="material-toggle-3d-viewport"
          aria-label="Mostrar visor 3D"
          title="Mostrar visor 3D"
          onClick={() => setSceneVisible(true)}
          className="absolute top-2 left-2 z-20 flex h-7 items-center gap-1.5 rounded-md border border-[#343a46] bg-[#181b22]/90 px-2.5 text-[10px] font-medium text-[#cbd5e1] hover:bg-[#252a34] hover:text-white shadow-md backdrop-blur-sm touch-manipulation"
        >
          <Eye className="h-3.5 w-3.5 text-[#5ecd6e]" />
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
  );
};
