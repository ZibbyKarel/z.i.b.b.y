// z.i.b.b.y design system — public surface.
// Apps import only from here; raw Tailwind classes never leave this library.

// Utilities
export { cn } from "./lib/cn"

// Theme
export {
  borderRadius,
  boxShadow,
  colors,
  contextVars,
  fontFamily,
  fontSize,
  fontWeight,
  letterSpacing,
} from "./theme/tokens"
export type { ContextName } from "./theme/tokens"
export { zibbyPreset } from "./theme/preset"
export { contextStyle } from "./theme/context"

// Domain types
export type {
  ActivityEvent,
  ActivityIcon,
  AgentDef,
  AgentSdkCredit,
  Approval,
  BriefingItem,
  ClaudeLimits,
  ModelName,
  NavItem,
  Pipeline,
  PipelinePhase,
  PipelineState,
  PhaseLoop,
  QuotaLimit,
  RunningAgent,
  Skill,
  SystemStatus,
  ThinkingLevel,
} from "./domain"
export { glyphForAgent } from "./domain"

// Foundations
export { Icon, ZibbyMark, iconNames } from "./components/Icon/Icon"
export type { IconName, IconProps, ZibbyMarkProps } from "./components/Icon/Icon"

// Primitives
export { Button } from "./components/Button/Button"
export type { ButtonProps } from "./components/Button/Button"
export { Meter, usageTone } from "./components/Meter/Meter"
export type { MeterProps, MeterTone } from "./components/Meter/Meter"
export { StatusDot } from "./components/StatusDot/StatusDot"
export type { StatusDotProps, DotTone } from "./components/StatusDot/StatusDot"
export { Pill } from "./components/Pill/Pill"
export type { PillProps } from "./components/Pill/Pill"
export { HudPanel, Corners } from "./components/HudPanel/HudPanel"
export type { HudPanelProps, CornersProps } from "./components/HudPanel/HudPanel"
export { SectionLabel } from "./components/SectionLabel/SectionLabel"
export type { SectionLabelProps } from "./components/SectionLabel/SectionLabel"
export { Stat } from "./components/Stat/Stat"
export type { StatProps, StatTone } from "./components/Stat/Stat"
export { Sparkline } from "./components/Sparkline/Sparkline"
export type { SparklineProps } from "./components/Sparkline/Sparkline"

// Velín composite components
export { ContextSwitch } from "./components/ContextSwitch/ContextSwitch"
export type { ContextSwitchProps } from "./components/ContextSwitch/ContextSwitch"
export { Sidebar } from "./components/Sidebar/Sidebar"
export type { SidebarProps } from "./components/Sidebar/Sidebar"
export { LimitsWidget } from "./components/LimitsWidget/LimitsWidget"
export type { LimitsWidgetProps } from "./components/LimitsWidget/LimitsWidget"
export { TopBar } from "./components/TopBar/TopBar"
export type { TopBarProps } from "./components/TopBar/TopBar"
export { VelinShell } from "./components/VelinShell/VelinShell"
export type { VelinShellProps } from "./components/VelinShell/VelinShell"
export { RunModal } from "./components/RunModal/RunModal"
export type { RunModalProps } from "./components/RunModal/RunModal"
export { SkillTile } from "./components/SkillTile/SkillTile"
export type { SkillTileProps } from "./components/SkillTile/SkillTile"
export { ApprovalCard } from "./components/ApprovalCard/ApprovalCard"
export type { ApprovalCardProps } from "./components/ApprovalCard/ApprovalCard"
export { AgentRow } from "./components/AgentRow/AgentRow"
export type { AgentRowProps } from "./components/AgentRow/AgentRow"
export { ActivityFeed } from "./components/ActivityFeed/ActivityFeed"
export type { ActivityFeedProps } from "./components/ActivityFeed/ActivityFeed"

// Orchestration
export { PhaseChain, ModelBadge, ThinkBadge } from "./components/PhaseChain/PhaseChain"
export type { PhaseChainProps } from "./components/PhaseChain/PhaseChain"
export { PipelineCard } from "./components/PipelineCard/PipelineCard"
export type { PipelineCardProps } from "./components/PipelineCard/PipelineCard"
export { PipelineRunModal } from "./components/PipelineRunModal/PipelineRunModal"
export type { PipelineRunModalProps } from "./components/PipelineRunModal/PipelineRunModal"
