import type { SceneDockItem } from "./sceneTypes";

/**
 * The dock (Tier 5): a bottom-centred bar listing ONLY the agents and pipelines
 * that are running or queued — never the full roster. Rendered imperatively so it
 * lives in the scene's DOM overlay alongside the constellation labels. Each chip's
 * on-screen centre is cached after layout so the constellation can fly a dispatched
 * agent's avatar to its slot ({@link chipScreenPos}) without per-frame reflow.
 */

interface Chip {
  el: HTMLDivElement;
  dot: HTMLSpanElement;
  targetId: string | null;
}

export interface DockLayer {
  /** Reconcile the visible chips to the given live items. */
  setItems(items: SceneDockItem[]): void;
  /** Centre of a target's chip in container pixels, or null if it has no chip. */
  chipScreenPos(targetId: string): { x: number; y: number } | null;
  /** Re-measure chip centres after a layout change (resize / item change). */
  measure(): void;
  dispose(): void;
}

export function createDockLayer(container: HTMLElement, dockRoot: HTMLElement): DockLayer {
  dockRoot.style.position = "absolute";
  dockRoot.style.left = "50%";
  dockRoot.style.bottom = "104px";
  dockRoot.style.transform = "translateX(-50%)";
  dockRoot.style.display = "flex";
  dockRoot.style.gap = "8px";
  dockRoot.style.flexWrap = "wrap";
  dockRoot.style.justifyContent = "center";
  dockRoot.style.maxWidth = "72%";
  dockRoot.style.pointerEvents = "none";

  const chips = new Map<string, Chip>();
  const centers = new Map<string, { x: number; y: number }>();

  function makeChip(item: SceneDockItem): Chip {
    const el = document.createElement("div");
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.gap = "7px";
    el.style.padding = "5px 11px";
    el.style.borderRadius = "999px";
    el.style.border = `1px solid ${item.color}`;
    el.style.background = "rgba(11, 20, 34, 0.72)";
    el.style.backdropFilter = "blur(6px)";
    el.style.font = "600 11px ui-monospace, monospace";
    el.style.letterSpacing = "0.03em";
    el.style.color = "#e6ecf5";
    el.style.whiteSpace = "nowrap";
    el.style.boxShadow = `0 0 14px ${item.color}44`;
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    el.style.transition = "opacity 0.4s ease, transform 0.4s ease";

    const dot = document.createElement("span");
    dot.style.width = "7px";
    dot.style.height = "7px";
    dot.style.borderRadius = "50%";
    dot.style.background = item.color;
    dot.style.boxShadow = `0 0 8px ${item.color}`;
    dot.style.animation = "v-glow-hot 1.4s ease-in-out infinite";

    const name = document.createElement("span");
    name.textContent = item.name;

    const kind = document.createElement("span");
    kind.textContent = item.kind === "pipeline" ? "⛓" : "◆";
    kind.style.opacity = "0.6";

    el.append(dot, name, kind);
    dockRoot.appendChild(el);
    // Fade/slide in on the next frame.
    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });
    return { el, dot, targetId: item.targetId };
  }

  return {
    setItems(items) {
      const nextKeys = new Set(items.map((i) => i.key));
      // Remove chips that are no longer live.
      for (const [key, chip] of chips) {
        if (!nextKeys.has(key)) {
          chip.el.remove();
          chips.delete(key);
        }
      }
      // Add new chips.
      for (const item of items) {
        if (!chips.has(item.key)) chips.set(item.key, makeChip(item));
      }
      // Measure after the browser has laid the new chips out.
      requestAnimationFrame(() => this.measure());
    },
    chipScreenPos(targetId) {
      return centers.get(targetId) ?? null;
    },
    measure() {
      const base = container.getBoundingClientRect();
      centers.clear();
      for (const chip of chips.values()) {
        if (!chip.targetId) continue;
        const r = chip.el.getBoundingClientRect();
        centers.set(chip.targetId, {
          x: r.left - base.left + r.width / 2,
          y: r.top - base.top + r.height / 2,
        });
      }
    },
    dispose() {
      for (const chip of chips.values()) chip.el.remove();
      chips.clear();
      centers.clear();
    },
  };
}
