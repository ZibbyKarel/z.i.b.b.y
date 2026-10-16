import type { CSSProperties } from "react";

/** `<animateTransform>` with the minion defaults (`attributeName=transform`, loops forever). */
export function At({
  type,
  values,
  dur,
  begin,
  keyTimes,
  additive,
}: {
  type: "translate" | "rotate" | "scale";
  values: string;
  dur: string;
  begin?: string;
  keyTimes?: string;
  additive?: "sum" | "replace";
}) {
  return (
    <animateTransform
      additive={additive}
      attributeName="transform"
      begin={begin}
      dur={dur}
      keyTimes={keyTimes}
      repeatCount="indefinite"
      type={type}
      values={values}
    />
  );
}

/** `<animate>` of one attribute, looping forever. */
export function An({
  attr,
  values,
  dur,
  begin,
  keyTimes,
  calcMode,
}: {
  attr: string;
  values: string;
  dur: string;
  begin?: string;
  keyTimes?: string;
  calcMode?: "discrete" | "linear";
}) {
  return (
    <animate
      attributeName={attr}
      begin={begin}
      calcMode={calcMode}
      dur={dur}
      keyTimes={keyTimes}
      repeatCount="indefinite"
      values={values}
    />
  );
}

/** `rot()` from the design — joins rotate angles into SMIL `values` around a pivot. */
export function rotValues(angles: readonly number[], px: number, py: number): string {
  return angles.map((a) => `${a} ${px} ${py}`).join(";");
}

/**
 * A CSS-keyframe `style` (the design's `A()`): `view-box` origin when an explicit pivot
 * is given, else the element's own centre. `undefined` when animation is switched off.
 */
export function cssAnim(
  on: boolean,
  animation: string,
  origin?: string,
): CSSProperties | undefined {
  if (!on) return undefined;
  return {
    animation,
    transformBox: origin ? "view-box" : "fill-box",
    transformOrigin: origin ?? "center",
  };
}
