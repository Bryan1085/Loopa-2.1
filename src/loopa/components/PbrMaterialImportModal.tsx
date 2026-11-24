/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  FolderPlus,
  ImagePlus,
  Layers,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  assignFilesToPbrChannels,
  derivePbrMaterialNameFromFiles,
  extractMaterialPbrMaps,
  loadPbrTextureFile,
  PBR_CHANNEL_IDS,
  PBR_CHANNEL_SPECS,
  PbrChannelId,
  PbrImportedTexture,
} from '../core/materials/pbrImport';
import type { MaterialAsset } from '../core/project/types';

export type PbrAssignScope = 'object' | 'faces' | 'library';

interface PbrMaterialImportModalProps {
  isOpen: boolean;
  activeMaterial?: MaterialAsset | null;
  hasSelectedObject: boolean;
  selectedFaceCount: number;
  onClose: () => void;
  onConfirm: (payload: {
    mode: 'create' | 'update';
    name: string;
    maps: Partial<Record<PbrChannelId, PbrImportedTexture | null>>;
    assignScope: PbrAssignScope;
  }) => void;
}

export const PbrMaterialImportModal: React.FC<PbrMaterialImportModalProps> = ({
  isOpen,
  activeMaterial,
  hasSelectedObject,
  selectedFaceCount,
  onClose,
  onConfirm,
}) => {
  const multiFileInputRef = useRef<HTMLInputElement | null>(null);
  const [targetMode, setTargetMode] = useState<'create' | 'update'>('create');
  const [materialName, setMaterialName] = useState('Material PBR');
  const [nameEditedManually, setNameEditedManually] = useState(false);
  const [assignScope, setAssignScope] = useState<PbrAssignScope>('object');
  const [channelMaps, setChannelMaps] = useState<
    Partial<Record<PbrChannelId, PbrImportedTexture | null>>
  >({});
  const [unassignedFiles, setUnassignedFiles] = useState<PbrImportedTexture[]>([]);
  const [loadingCount, setLoadingCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Reset modal state on open
  useEffect(() => {
    if (!isOpen) return;
    setTargetMode('create');
    setMaterialName('Material PBR');
    setNameEditedManually(false);
    setAssignScope(hasSelectedObject ? 'object' : 'library');
    setChannelMaps({});
    setUnassignedFiles([]);
    setLoadingCount(0);
    setErrorMsg(null);
    setIsDragOver(false);
  }, [isOpen, hasSelectedObject]);

  // When switching to 'update', prefill existing loaded maps from activeMaterial if empty
  const existingExtracted = useMemo(
    () => (activeMaterial ? extractMaterialPbrMaps(activeMaterial) : null),
    [activeMaterial],
  );

  const handleModeSwitch = (mode: 'create' | 'update') => {
    setTargetMode(mode);
    if (mode === 'update' && activeMaterial) {
      setMaterialName(activeMaterial.name);
      setNameEditedManually(true);
      setChannelMaps((prev) => {
        const next: Partial<Record<PbrChannelId, PbrImportedTexture | null>> = {
          ...prev,
        };
        if (existingExtracted) {
          for (const ch of PBR_CHANNEL_IDS) {
            if (!(ch in next) && existingExtracted[ch].loaded && existingExtracted[ch].dataUrl) {
              next[ch] = {
                fileName:
                  existingExtracted[ch].textureName ?? PBR_CHANNEL_SPECS[ch].shortLabel,
                dataUrl: existingExtracted[ch].dataUrl!,
              };
            }
          }
        }
        return next;
      });
    } else if (mode === 'create') {
      setNameEditedManually(false);
      const loadedNames = Object.values(channelMaps)
        .filter((v): v is PbrImportedTexture => Boolean(v))
        .map((v) => v.fileName);
      setMaterialName(derivePbrMaterialNameFromFiles(loadedNames, 'Material PBR'));
    }
  };

  if (!isOpen) return null;

  const processFiles = async (
    fileList: FileList | File[],
    forcedChannel?: PbrChannelId,
  ) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setErrorMsg(null);
    setLoadingCount((c) => c + files.length);

    const loaded: PbrImportedTexture[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const res = await loadPbrTextureFile(file);
        loaded.push(res);
      } catch (err) {
        errors.push(
          `${file.name}: ${
            err instanceof Error ? err.message : 'Error al cargar la textura'
          }`,
        );
      }
    }

    setLoadingCount((c) => Math.max(0, c - files.length));

    if (errors.length > 0) {
      setErrorMsg(errors[0]);
    }
    if (loaded.length === 0) return;

    if (forcedChannel) {
      const tex = loaded[0];
      setChannelMaps((prev) => ({
        ...prev,
        [forcedChannel]: tex,
      }));
      if (!nameEditedManually && targetMode === 'create') {
        setMaterialName(derivePbrMaterialNameFromFiles([tex.fileName], 'Material PBR'));
      }
      return;
    }

    const existingActive: Partial<Record<PbrChannelId, PbrImportedTexture>> = {};
    for (const ch of PBR_CHANNEL_IDS) {
      const val = channelMaps[ch];
      if (val) existingActive[ch] = val;
    }

    const { channels, unassigned } = assignFilesToPbrChannels(loaded, existingActive);
    setChannelMaps((prev) => ({ ...prev, ...channels }));
    if (unassigned.length > 0) {
      setUnassignedFiles((prev) => [...prev, ...unassigned]);
    }
    if (!nameEditedManually && targetMode === 'create') {
      setMaterialName(
        derivePbrMaterialNameFromFiles(
          loaded.map((l) => l.fileName),
          'Material PBR',
        ),
      );
    }
  };

  const handleMoveChannel = (fromChannel: PbrChannelId, toChannel: PbrChannelId) => {
    if (fromChannel === toChannel) return;
    setChannelMaps((prev) => {
      const moving = prev[fromChannel];
      if (!moving) return prev;
      const displaced = prev[toChannel] ?? null;
      return {
        ...prev,
        [toChannel]: moving,
        [fromChannel]: displaced,
      };
    });
  };

  const handleAssignUnassigned = (index: number, channel: PbrChannelId) => {
    const tex = unassignedFiles[index];
    if (!tex) return;
    setChannelMaps((prev) => ({
      ...prev,
      [channel]: tex,
    }));
    setUnassignedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearChannel = (channel: PbrChannelId) => {
    setChannelMaps((prev) => ({
      ...prev,
      [channel]: null,
    }));
  };

  const loadedCount = PBR_CHANNEL_IDS.filter((ch) => Boolean(channelMaps[ch])).length;

  const handleConfirm = () => {
    if (loadedCount === 0 || loadingCount > 0) return;
    onConfirm({
      mode: targetMode === 'update' && activeMaterial ? 'update' : 'create',
      name: materialName.trim() || 'Material PBR',
      maps: channelMaps,
      assignScope,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pbr-import-title"
      data-testid="pbr-import-modal"
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-5"
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-[#181a20] border border-[#303543] shadow-2xl text-[#e4e6eb] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2e38] bg-[#14161b]">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#5ecd6e]" />
            <h2 id="pbr-import-title" className="text-sm font-bold text-[#f3f4f6]">
              Importar material PBR
            </h2>
          </div>
          <button
            type="button"
            data-testid="pbr-import-close"
            onClick={onClose}
            aria-label="Cerrar importación PBR"
            className="w-8 h-8 rounded-lg bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] flex items-center justify-center text-[#cbd5e1]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto cad-scroll p-4 space-y-4">
          <input
            ref={multiFileInputRef}
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            data-testid="pbr-multi-file-input"
            aria-label="Seleccionar archivos de textura PBR"
            className="hidden"
            onChange={(e) => {
              if (e.currentTarget.files) {
                void processFiles(e.currentTarget.files);
              }
              e.currentTarget.value = '';
            }}
          />

          {/* Dropzone + Multi-file selector */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (e.dataTransfer.files?.length) {
                void processFiles(e.dataTransfer.files);
              }
            }}
            className={`rounded-xl border-2 border-dashed p-3.5 transition-colors flex flex-col sm:flex-row items-center justify-between gap-3 ${
              isDragOver
                ? 'border-[#5ecd6e] bg-[#16261a]/60'
                : 'border-[#323746] bg-[#121418]'
            }`}
          >
            <div className="flex items-center gap-3 text-left">
              <UploadCloud className="w-7 h-7 text-[#5ecd6e] shrink-0" />
              <div>
                <div className="text-xs font-semibold text-[#f3f4f6]">
                  Selecciona uno o varios mapas PBR (PNG, JPG, WEBP)
                </div>
                <div className="text-[11px] text-[#9ca3af]">
                  Detección automática por nombre (albedo, roughness, metallic, normal, AO, height).
                </div>
              </div>
            </div>
            <button
              type="button"
              data-testid="pbr-select-files-btn"
              onClick={() => multiFileInputRef.current?.click()}
              className="shrink-0 h-9 px-3.5 rounded-lg bg-[#5ecd6e] hover:bg-[#4dbb5e] text-xs font-semibold text-[#111317] flex items-center gap-1.5"
            >
              <FolderPlus className="w-4 h-4" />
              Elegir texturas
            </button>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="px-3 py-2 rounded-lg bg-[#35171a] border border-[#ef4444]/60 text-xs text-[#fca5a5]"
            >
              {errorMsg}
            </div>
          )}

          {/* Target mode & Material Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#14161b] border border-[#2a2e38] rounded-xl p-3">
            <div className="space-y-1.5">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">
                Destino del material
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  data-testid="pbr-mode-create"
                  onClick={() => handleModeSwitch('create')}
                  className={`h-8 px-2 rounded-lg text-xs font-semibold border transition-colors ${
                    targetMode === 'create'
                      ? 'bg-[#16261a] border-[#5ecd6e] text-[#7def8e]'
                      : 'bg-[#22252d] border-[#323640] text-[#cbd5e1]'
                  }`}
                >
                  Crear nuevo
                </button>
                <button
                  type="button"
                  data-testid="pbr-mode-update"
                  disabled={!activeMaterial}
                  onClick={() => handleModeSwitch('update')}
                  className={`h-8 px-2 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 ${
                    targetMode === 'update'
                      ? 'bg-[#112738] border-[#38bdf8] text-[#7dd3fc]'
                      : 'bg-[#22252d] border-[#323640] text-[#cbd5e1]'
                  }`}
                >
                  Actualizar activo
                </button>
              </div>
            </div>

            <label className="space-y-1.5 block">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">
                Nombre del material
              </span>
              <input
                type="text"
                data-testid="pbr-material-name-input"
                value={materialName}
                onChange={(e) => {
                  setMaterialName(e.target.value);
                  setNameEditedManually(true);
                }}
                placeholder="Ej. Metal oxidado PBR"
                className="w-full h-8 px-2.5 rounded-lg bg-[#121418] border border-[#323640] text-xs text-[#f3f4f6] outline-none focus:border-[#5ecd6e]"
              />
            </label>

            {targetMode === 'create' && hasSelectedObject && (
              <div className="sm:col-span-2 space-y-1.5 pt-1 border-t border-[#242832]">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">
                  Asignación en escena
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    data-testid="pbr-assign-object"
                    onClick={() => setAssignScope('object')}
                    className={`h-8 px-2 rounded-lg text-[11px] font-semibold border ${
                      assignScope === 'object'
                        ? 'bg-[#16261a] border-[#5ecd6e] text-[#7def8e]'
                        : 'bg-[#22252d] border-[#323640] text-[#cbd5e1]'
                    }`}
                  >
                    Asignar al objeto
                  </button>
                  <button
                    type="button"
                    data-testid="pbr-assign-faces"
                    disabled={selectedFaceCount === 0}
                    onClick={() => setAssignScope('faces')}
                    className={`h-8 px-2 rounded-lg text-[11px] font-semibold border disabled:opacity-40 ${
                      assignScope === 'faces'
                        ? 'bg-[#112738] border-[#38bdf8] text-[#7dd3fc]'
                        : 'bg-[#22252d] border-[#323640] text-[#cbd5e1]'
                    }`}
                  >
                    Solo caras sel. ({selectedFaceCount})
                  </button>
                  <button
                    type="button"
                    data-testid="pbr-assign-library"
                    onClick={() => setAssignScope('library')}
                    className={`h-8 px-2 rounded-lg text-[11px] font-semibold border ${
                      assignScope === 'library'
                        ? 'bg-[#252834] border-[#94a3b8] text-white'
                        : 'bg-[#22252d] border-[#323640] text-[#cbd5e1]'
                    }`}
                  >
                    Solo guardar en librería
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Unassigned files queue (if auto-detection couldn't match a filename) */}
          {unassignedFiles.length > 0 && (
            <div
              data-testid="pbr-unassigned-section"
              className="rounded-xl bg-[#221c14] border border-[#f59e0b]/45 p-3 space-y-2"
            >
              <div className="text-[11px] font-semibold text-[#fbbf24]">
                Archivos sin canal detectado ({unassignedFiles.length}) — asigna manualmente:
              </div>
              <div className="space-y-1.5">
                {unassignedFiles.map((file, idx) => (
                  <div
                    key={`${file.fileName}-${idx}`}
                    className="flex items-center justify-between gap-2 bg-[#14161b] rounded-lg px-2.5 py-1.5 border border-[#323640]"
                  >
                    <span className="text-xs text-[#e4e6eb] truncate">{file.fileName}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <select
                        aria-label={`Asignar canal para ${file.fileName}`}
                        defaultValue=""
                        onChange={(e) => {
                          const val = e.target.value as PbrChannelId;
                          if (val) handleAssignUnassigned(idx, val);
                        }}
                        className="h-7 px-2 rounded bg-[#22252d] border border-[#3a3f4c] text-[11px] text-[#f3f4f6]"
                      >
                        <option value="" disabled>
                          Elegir canal...
                        </option>
                        {PBR_CHANNEL_IDS.map((ch) => (
                          <option key={ch} value={ch}>
                            {PBR_CHANNEL_SPECS[ch].label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          setUnassignedFiles((prev) => prev.filter((_, i) => i !== idx))
                        }
                        aria-label={`Descartar ${file.fileName}`}
                        className="w-7 h-7 rounded bg-[#2a2024] hover:bg-[#3b252b] text-[#fca5a5] flex items-center justify-center"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 6 PBR Channels */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">
                Canales PBR ({loadedCount} / {PBR_CHANNEL_IDS.length} cargados)
              </span>
              <span className="text-[10px] text-[#8e95a2]">
                Los mapas faltantes son opcionales
              </span>
            </div>

            <div className="space-y-2">
              {PBR_CHANNEL_IDS.map((channelId) => {
                const spec = PBR_CHANNEL_SPECS[channelId];
                const loaded = channelMaps[channelId];
                return (
                  <div
                    key={channelId}
                    data-testid={`pbr-channel-row-${channelId}`}
                    className={`rounded-xl border p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                      loaded
                        ? 'bg-[#141d18] border-[#5ecd6e]/45'
                        : 'bg-[#14161b] border-[#292d38]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {loaded ? (
                        <img
                          src={loaded.dataUrl}
                          alt={spec.label}
                          className="w-10 h-10 rounded-lg object-cover border border-[#364152] shrink-0 bg-[#0d0f12]"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg border border-dashed border-[#343a47] bg-[#101216] flex items-center justify-center text-[#6b7280] shrink-0">
                          <ImagePlus className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-[#f3f4f6]">
                            {spec.label}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                              spec.colorSpace === 'srgb'
                                ? 'bg-[#1f2937] text-[#93c5fd]'
                                : 'bg-[#22252d] text-[#cbd5e1]'
                            }`}
                          >
                            {spec.colorSpaceLabel}
                          </span>
                          {loaded ? (
                            <span
                              data-testid={`pbr-status-${channelId}`}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#5ecd6e]"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Cargado
                            </span>
                          ) : (
                            <span
                              data-testid={`pbr-status-${channelId}`}
                              className="text-[10px] text-[#6b7280]"
                            >
                              No cargado
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#9ca3af] truncate">
                          {loaded
                            ? `${loaded.fileName}${
                                loaded.width && loaded.height
                                  ? ` · ${loaded.width}×${loaded.height}`
                                  : ''
                              }`
                            : 'Sin archivo asignado'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {loaded && (
                        <select
                          aria-label={`Reasignar canal de ${spec.label}`}
                          data-testid={`pbr-channel-move-${channelId}`}
                          value={channelId}
                          onChange={(e) =>
                            handleMoveChannel(
                              channelId,
                              e.target.value as PbrChannelId,
                            )
                          }
                          className="h-8 px-2 rounded-lg bg-[#22252d] border border-[#343a47] text-[11px] text-[#e4e6eb]"
                          title="Mover esta textura a otro canal PBR"
                        >
                          {PBR_CHANNEL_IDS.map((targetId) => (
                            <option key={targetId} value={targetId}>
                              {targetId === channelId
                                ? `Canal: ${PBR_CHANNEL_SPECS[targetId].shortLabel}`
                                : `Mover a ${PBR_CHANNEL_SPECS[targetId].shortLabel}`}
                            </option>
                          ))}
                        </select>
                      )}
                      <label className="h-8 px-2.5 rounded-lg bg-[#22252d] hover:bg-[#2c313b] border border-[#343a47] text-[11px] font-semibold text-[#e4e6eb] flex items-center gap-1 cursor-pointer">
                        <span>{loaded ? 'Cambiar' : 'Cargar'}</span>
                        <input
                          type="file"
                          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                          data-testid={`pbr-channel-file-${channelId}`}
                          aria-label={`Cargar textura para ${spec.label}`}
                          className="hidden"
                          onChange={(e) => {
                            if (e.currentTarget.files?.length) {
                              void processFiles(e.currentTarget.files, channelId);
                            }
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>
                      {loaded && (
                        <button
                          type="button"
                          data-testid={`pbr-channel-clear-${channelId}`}
                          onClick={() => handleClearChannel(channelId)}
                          aria-label={`Quitar mapa de ${spec.label}`}
                          className="w-8 h-8 rounded-lg bg-[#261c1f] hover:bg-[#3a2228] border border-[#4c2b33] text-[#fca5a5] flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#2a2e38] bg-[#14161b] gap-3">
          <div className="text-[11px] text-[#9ca3af]">
            {loadingCount > 0
              ? `Procesando ${loadingCount} textura(s)...`
              : loadedCount === 0
                ? 'Carga al menos una textura para crear o actualizar el material.'
                : `${loadedCount} mapa(s) listos para aplicar en LOOPA Materials y UVs.`}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3.5 rounded-lg bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-xs font-semibold text-[#cbd5e1]"
            >
              Cancelar
            </button>
            <button
              type="button"
              data-testid="pbr-import-confirm"
              disabled={loadedCount === 0 || loadingCount > 0}
              onClick={handleConfirm}
              className="h-9 px-4 rounded-lg bg-[#5ecd6e] hover:bg-[#4dbb5e] disabled:opacity-40 text-xs font-semibold text-[#111317]"
            >
              {targetMode === 'update' ? 'Actualizar material PBR' : 'Importar material PBR'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
