// Immersive orb-map bundle — public surface.
// Ordered bottom-up: pure geometry/state helpers first, then the WebGL/DOM
// primitives, then the composed nodes, then the top-level OrbMap.

// ---------------------------------------------------------------------------
// Pure geometry & state (no DOM)
// ---------------------------------------------------------------------------
export { ellipseLayout } from "./ellipseLayout";
export type { EllipseInsets, EllipseLayout, OrbPosition } from "./ellipseLayout";

export { ORB_MOTION, ORB_STATE, ORB_STATE_COLOR } from "./orbState";
export type { OrbMotion, OrbState, OrbStateStyle } from "./orbState";

export { seededRandom } from "./seededRandom";

export { canMountWebGL } from "./canMountWebGL";

// ---------------------------------------------------------------------------
// Orb — WebGL wireframe primitive
// ---------------------------------------------------------------------------
export { Orb, OrbTestId } from "./Orb/Orb";
export type { OrbMotionOverrides, OrbProps } from "./Orb/Orb";

// ---------------------------------------------------------------------------
// OrbitField — faux-3D orbiting task dots
// ---------------------------------------------------------------------------
export { OrbitField, OrbitFieldTestId } from "./OrbitField/OrbitField";
export type { OrbitFieldProps } from "./OrbitField/OrbitField";

// ---------------------------------------------------------------------------
// OrbNode — composed subsystem node (orb + chrome + label)
// ---------------------------------------------------------------------------
export { OrbNode, OrbNodeTestId } from "./OrbNode/OrbNode";
export type { OrbNodeProps } from "./OrbNode/OrbNode";

// ---------------------------------------------------------------------------
// CoreOrb — central ZIBBY orb
// ---------------------------------------------------------------------------
export { CoreOrb, CoreOrbTestId } from "./CoreOrb/CoreOrb";
export type { CoreOrbProps } from "./CoreOrb/CoreOrb";

// ---------------------------------------------------------------------------
// ConnectorLayer — SVG connectors from the core to each node
// ---------------------------------------------------------------------------
export { ConnectorLayer, ConnectorLayerTestId } from "./ConnectorLayer/ConnectorLayer";
export type { ConnectorLayerProps, ConnectorNode } from "./ConnectorLayer/ConnectorLayer";

// ---------------------------------------------------------------------------
// HandoffFlare — one-shot comet + burst between two orbs
// ---------------------------------------------------------------------------
export {
  DEFAULT_DURATION_MS,
  HandoffFlare,
  HandoffFlareTestId,
  RETIRE_BUFFER_MS,
} from "./HandoffFlare/HandoffFlare";
export type { HandoffFlareProps } from "./HandoffFlare/HandoffFlare";
export { arcPath } from "./HandoffFlare/arcPath";

// ---------------------------------------------------------------------------
// OrbMap — composes the full map
// ---------------------------------------------------------------------------
export { ORB_MAP_CORE_ID, OrbMap, OrbMapTestId } from "./OrbMap/OrbMap";
export type {
  OrbMapCore,
  OrbMapFlare,
  OrbMapNode,
  OrbMapProps,
} from "./OrbMap/OrbMap";
