import React, { ReactNode, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface SculptDualViewportSplitProps {
  enabled: boolean;
  children: ReactNode;
  secondary: ReactNode;
  secondVisible?: boolean;
  onSecondVisibleChange?: (visible: boolean) => void;
  reserveTopLeftCorner?: boolean;
  reserveTopLeftWrench?: boolean;
}

const MIN_PRIMARY_RATIO = 0.25;
const MAX_PRIMARY_RATIO = 0.75;

export const SculptDualViewportSplit: React.FC<SculptDualViewportSplitProps> = ({
  enabled,
  children,
  secondary,
  secondVisible: controlledSecondVisible,
  onSecondVisibleChange,
  reserveTopLeftCorner = false,
  reserveTopLeftWrench = false,
}) => {
  const [uncontrolledVisible, setUncontrolledVisible] = useState(true);
  const secondVisible = controlledSecondVisible ?? uncontrolledVisible;
  const setSecondVisible = (next: boolean) => {
    if (controlledSecondVisible === undefined) {
      setUncontrolledVisible(next);
    }
    onSecondVisibleChange?.(next);
  };

  const [primaryRatio, setPrimaryRatio] = useState(0.54);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  if (!enabled) {
    return <>{children}</>;
  }

  const resizeFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    const bounds = splitRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return;
    const nextRatio = (event.clientX - bounds.left) / bounds.width;
    setPrimaryRatio(Math.min(MAX_PRIMARY_RATIO, Math.max(MIN_PRIMARY_RATIO, nextRatio)));
  };

  const stopResizing = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    activePointerIdRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const toggleTopClass =
    reserveTopLeftCorner && reserveTopLeftWrench
      ? "top-[52px] sm:top-2.5"
      : "top-2.5";

  return (
    <div
      ref={splitRef}
      data-testid="sculpt-dual-viewport-split"
      className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden"
    >
      <div
        data-testid="sculpt-primary-viewport"
        aria-label="Visor 3D principal de esculpido"
        className="flex h-full min-h-0 min-w-0 overflow-hidden"
        style={{
          flex: secondVisible ? `0 0 ${primaryRatio * 100}%` : "1 1 100%",
        }}
      >
        {children}
      </div>

      <div
        role="separator"
        aria-label="Ajustar tamaño entre los visores de esculpido"
        aria-orientation="vertical"
        aria-valuemin={Math.round(MIN_PRIMARY_RATIO * 100)}
        aria-valuemax={Math.round(MAX_PRIMARY_RATIO * 100)}
        aria-valuenow={Math.round(primaryRatio * 100)}
        tabIndex={0}
        data-testid="sculpt-dual-viewport-divider"
        className="relative z-20 flex w-2 shrink-0 cursor-col-resize touch-none items-center justify-center bg-[#252a33] transition-colors hover:bg-[#5ecd6e] focus-visible:bg-[#5ecd6e] focus-visible:outline-none"
        style={{ display: secondVisible ? "flex" : "none" }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const direction = event.key === "ArrowRight" ? 1 : -1;
          setPrimaryRatio((current) =>
            Math.min(MAX_PRIMARY_RATIO, Math.max(MIN_PRIMARY_RATIO, current + direction * 0.03)),
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
        {secondVisible && (
          <button
            type="button"
            data-testid="sculpt-toggle-second-viewport"
            aria-label="Ocultar segundo visor 3D"
            title="Ocultar segundo visor 3D y ampliar el visor principal"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setSecondVisible(false);
            }}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#5ecd6e]/75 bg-[#181b22] text-[#cbd5e1] shadow-lg transition-colors hover:border-[#5ecd6e] hover:bg-[#252a34] hover:text-white touch-manipulation"
          >
            <EyeOff aria-hidden="true" className="h-4 w-4 text-[#5ecd6e]" />
          </button>
        )}
      </div>

      {!secondVisible && (
        <button
          type="button"
          data-testid="sculpt-toggle-second-viewport"
          aria-label="Mostrar segundo visor 3D"
          title="Mostrar segundo visor 3D conservando su cámara y distribución"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setSecondVisible(true)}
          className={`absolute ${toggleTopClass} left-1/2 -translate-x-1/2 z-40 flex h-10 items-center gap-2 rounded-lg border-2 border-[#5ecd6e]/75 bg-[#181b22]/95 px-3 text-[11px] font-semibold text-[#e2e8f0] shadow-lg backdrop-blur-sm transition-colors hover:border-[#5ecd6e] hover:bg-[#252a34] hover:text-white touch-manipulation`}
        >
          <Eye aria-hidden="true" className="h-4 w-4 text-[#5ecd6e]" />
          <span>Mostrar visor 2</span>
        </button>
      )}

      <div
        data-testid="sculpt-secondary-viewport"
        aria-label="Segundo visor 3D independiente de esculpido"
        className="h-full min-h-0 min-w-[240px] flex-1 overflow-hidden border-l border-[#2b2e36]"
        style={{
          display: secondVisible ? "flex" : "none",
        }}
      >
        {secondary}
      </div>
    </div>
  );
};
