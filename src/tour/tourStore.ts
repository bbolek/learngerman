import { create } from 'zustand';

import {
  isOffRoute,
  nextIndexForEvent,
  resumeIndexFor,
  TOUR_STEPS,
  type TourActionName,
  type TourEvent,
} from '@/logic/tour';
import { useSettings } from '@/store/settings';

export type TargetRect = { x: number; y: number; width: number; height: number };

export type TourStatus = 'idle' | 'welcome' | 'running' | 'finish';

interface TourState {
  status: TourStatus;
  stepIndex: number;
  /** User left the step's screen — overlay shows the resume card instead. */
  offRoute: boolean;
  /** Measured window-coordinate rects, keyed by target id. */
  rects: Record<string, TargetRect>;
  /** Re-measure closures registered by useTourTarget, keyed by target id. */
  measurers: Record<string, () => void>;

  showWelcome: () => void;
  /** Welcome → step 0. Caller ensures we're on the home tab first. */
  begin: () => void;
  next: () => void;
  /** Advance regardless of the step's rule — unmeasured-target fallback. */
  forceNext: () => void;
  skip: () => void;
  closeFinish: () => void;
  emit: (name: TourActionName) => void;
  onRouteChange: (pathname: string) => void;
  resume: () => void;
  registerTarget: (id: string, measure: () => void) => void;
  unregisterTarget: (id: string) => void;
  setRect: (id: string, rect: TargetRect) => void;
  /** Ask the active step's target (if mounted) to re-measure. */
  remeasureCurrent: () => void;
}

function markSeen() {
  const settings = useSettings.getState();
  if (!settings.hasSeenTour) settings.setHasSeenTour(true);
}

export const useTourStore = create<TourState>((set, get) => {
  const dispatch = (event: TourEvent) => {
    const { status, stepIndex, offRoute } = get();
    if (status !== 'running' || offRoute) return;
    const next = nextIndexForEvent(TOUR_STEPS, stepIndex, event);
    if (next == null) return;
    if (next >= TOUR_STEPS.length) {
      set({ status: 'finish', stepIndex: next });
    } else {
      set({ stepIndex: next });
      queueMicrotask(() => get().remeasureCurrent());
    }
  };

  return {
    status: 'idle',
    stepIndex: 0,
    offRoute: false,
    rects: {},
    measurers: {},

    showWelcome: () => set({ status: 'welcome', stepIndex: 0, offRoute: false }),

    begin: () => {
      markSeen();
      set({ status: 'running', stepIndex: 0, offRoute: false });
      queueMicrotask(() => get().remeasureCurrent());
    },

    next: () => dispatch({ type: 'next' }),

    forceNext: () => {
      const { status, stepIndex } = get();
      if (status !== 'running') return;
      const next = stepIndex + 1;
      if (next >= TOUR_STEPS.length) {
        set({ status: 'finish', stepIndex: next });
      } else {
        set({ stepIndex: next });
        queueMicrotask(() => get().remeasureCurrent());
      }
    },

    skip: () => {
      markSeen();
      set({ status: 'idle', stepIndex: 0, offRoute: false });
    },

    closeFinish: () => set({ status: 'idle', stepIndex: 0, offRoute: false }),

    emit: (name) => dispatch({ type: 'action', name }),

    onRouteChange: (pathname) => {
      const { status, stepIndex, offRoute } = get();
      if (status !== 'running') return;
      const step = TOUR_STEPS[stepIndex];
      if (!step) return;
      if (offRoute) {
        // Wandered back on their own — pick up where the resume card would.
        if (!isOffRoute(TOUR_STEPS[resumeIndexFor(TOUR_STEPS, stepIndex)], pathname)) {
          set({ offRoute: false, stepIndex: resumeIndexFor(TOUR_STEPS, stepIndex) });
          queueMicrotask(() => get().remeasureCurrent());
        }
        return;
      }
      const next = nextIndexForEvent(TOUR_STEPS, stepIndex, { type: 'route', pathname });
      if (next != null) {
        if (next >= TOUR_STEPS.length) set({ status: 'finish', stepIndex: next });
        else {
          set({ stepIndex: next });
          queueMicrotask(() => get().remeasureCurrent());
        }
        return;
      }
      if (isOffRoute(step, pathname)) set({ offRoute: true });
    },

    resume: () => {
      const { stepIndex } = get();
      set({ offRoute: false, stepIndex: resumeIndexFor(TOUR_STEPS, stepIndex) });
      queueMicrotask(() => get().remeasureCurrent());
    },

    registerTarget: (id, measure) =>
      set((s) => ({ measurers: { ...s.measurers, [id]: measure } })),

    unregisterTarget: (id) =>
      set((s) => {
        const measurers = { ...s.measurers };
        const rects = { ...s.rects };
        delete measurers[id];
        delete rects[id];
        return { measurers, rects };
      }),

    setRect: (id, rect) =>
      set((s) => {
        const prev = s.rects[id];
        if (
          prev &&
          prev.x === rect.x &&
          prev.y === rect.y &&
          prev.width === rect.width &&
          prev.height === rect.height
        ) {
          return s;
        }
        return { rects: { ...s.rects, [id]: rect } };
      }),

    remeasureCurrent: () => {
      const { status, stepIndex, measurers } = get();
      if (status !== 'running') return;
      const step = TOUR_STEPS[stepIndex];
      if (step) measurers[step.targetId]?.();
    },
  };
});

/**
 * One-line instrumentation for screens: no-op unless the tour is running,
 * so call sites don't need to know about tour state at all.
 */
export function tourEmit(name: TourActionName): void {
  useTourStore.getState().emit(name);
}
