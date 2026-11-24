/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class ProgressiveCancelledError extends Error {
  constructor(message = 'Operación de geometría cancelada por el usuario.') {
    super(message);
    this.name = 'ProgressiveCancelledError';
  }
}

export class ObjectOperationConflictError extends Error {
  public readonly objectId: string;
  public readonly activeLabel: string;

  constructor(objectId: string, activeLabel: string) {
    super(`Ya hay una operación en curso (${activeLabel}) sobre este objeto.`);
    this.name = 'ObjectOperationConflictError';
    this.objectId = objectId;
    this.activeLabel = activeLabel;
  }
}

export interface ProgressiveExecutionContext {
  signal?: AbortSignal;
  chunkBudgetMs: number;
  checkYield: (workUnits?: number) => Promise<void>;
  reportProgress: (ratio: number, stageLabel: string) => void;
  throwIfAborted: () => void;
}

export type ProgressiveRunStatus<T> =
  | { status: 'completed'; result: T }
  | { status: 'cancelled' }
  | { status: 'error'; error: string };

export type ProgressiveTaskResult<T> = ProgressiveRunStatus<T>;

export interface ActiveObjectLock {
  taskId: string;
  objectId: string;
  label: string;
  startedAt: number;
  progress: number;
  stageLabel: string;
  abortController: AbortController;
}

function nextFrameYield(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      window.setTimeout(resolve, 0);
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export async function runProgressiveTask<T>(
  task: (ctx: ProgressiveExecutionContext) => Promise<T>,
  options: {
    signal?: AbortSignal;
    chunkBudgetMs?: number;
    onProgress?: (ratio: number, stageLabel: string) => void;
  } = {},
): Promise<ProgressiveRunStatus<T>> {
  const chunkBudgetMs = Math.max(2, Math.min(32, options.chunkBudgetMs ?? 10));
  let lastYieldAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let accumulatedUnits = 0;

  const throwIfAborted = () => {
    if (options.signal?.aborted) {
      throw new ProgressiveCancelledError();
    }
  };

  const checkYield = async (workUnits = 1) => {
    throwIfAborted();
    accumulatedUnits += workUnits;
    if (accumulatedUnits < 16) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastYieldAt >= chunkBudgetMs) {
      accumulatedUnits = 0;
      await nextFrameYield();
      throwIfAborted();
      lastYieldAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    }
  };

  const reportProgress = (ratio: number, stageLabel: string) => {
    throwIfAborted();
    const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
    options.onProgress?.(clamped, stageLabel);
  };

  try {
    throwIfAborted();
    const result = await task({
      signal: options.signal,
      chunkBudgetMs,
      checkYield,
      reportProgress,
      throwIfAborted,
    });
    throwIfAborted();
    return { status: 'completed', result };
  } catch (error) {
    if (error instanceof ProgressiveCancelledError || options.signal?.aborted) {
      return { status: 'cancelled' };
    }
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Error inesperado al procesar geometría.',
    };
  }
}

export class ObjectOperationLockManager {
  private locks = new Map<string, ActiveObjectLock>();
  private listeners = new Set<() => void>();
  private seq = 1;

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public isLocked(objectId: string): boolean {
    return this.locks.has(objectId);
  }

  public getLock(objectId: string): ActiveObjectLock | null {
    return this.locks.get(objectId) ?? null;
  }

  public getAllLocks(): ActiveObjectLock[] {
    return Array.from(this.locks.values());
  }

  public acquire(objectId: string, label: string): ActiveObjectLock {
    const existing = this.locks.get(objectId);
    if (existing) {
      throw new ObjectOperationConflictError(objectId, existing.label);
    }
    const lock: ActiveObjectLock = {
      taskId: `op_${Date.now()}_${this.seq++}`,
      objectId,
      label,
      startedAt: Date.now(),
      progress: 0,
      stageLabel: label,
      abortController: new AbortController(),
    };
    this.locks.set(objectId, lock);
    this.emit();
    return lock;
  }

  public updateProgress(objectId: string, taskId: string, progress: number, stageLabel: string): void {
    const lock = this.locks.get(objectId);
    if (!lock || lock.taskId !== taskId) return;
    lock.progress = Math.max(0, Math.min(1, progress));
    lock.stageLabel = stageLabel;
    this.emit();
  }

  public cancel(objectId: string): boolean {
    const lock = this.locks.get(objectId);
    if (!lock) return false;
    lock.abortController.abort();
    lock.stageLabel = 'Cancelando…';
    this.emit();
    return true;
  }

  public release(objectId: string, taskId: string): void {
    const lock = this.locks.get(objectId);
    if (!lock || lock.taskId !== taskId) return;
    this.locks.delete(objectId);
    this.emit();
  }
}

export const globalGeometryLockManager = new ObjectOperationLockManager();
