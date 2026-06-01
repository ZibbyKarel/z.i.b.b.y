// z.i.b.b.y design system — public surface.
// Apps import only from here; raw Tailwind classes never leave this library.

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
export { cn } from "./lib/cn";

// ---------------------------------------------------------------------------
// Token system
// ---------------------------------------------------------------------------
export {
  spacingToPx,
  resolvePadding,
  spacingValues,
  mergeTokens,
  tokensToCssVars,
} from "./tokens";
export type {
  Spacing,
  Padding,
  Size,
  ColorTokens,
  SizeTokens,
  FontTokens,
  DesignTokens,
  PartialDesignTokens,
} from "./tokens";

// ---------------------------------------------------------------------------
// Theme registry
// ---------------------------------------------------------------------------
export {
  defaultDarkTokens,
  defaultLightTokens,
  tokensForTheme,
} from "./DesignSystemContext/themeRegistry";

// ---------------------------------------------------------------------------
// DesignSystemProvider + hooks
// ---------------------------------------------------------------------------
export { DesignSystemProvider } from "./DesignSystemContext/DesignSystemProvider";
export type { DesignSystemProviderProps } from "./DesignSystemContext/DesignSystemProvider";
export {
  useTokens,
  useTextColors,
  useAccentColors,
  useSizeTokens,
  useFontTokens,
  useSpacing,
} from "./DesignSystemContext/hooks";
export { contextTokens } from "./DesignSystemContext/contextTokens";
export type { ContextName } from "./DesignSystemContext/contextTokens";

// ---------------------------------------------------------------------------
// Surface layer
// ---------------------------------------------------------------------------
export {
  bgValue,
  borderColorValue,
  radiusValue,
  shadowValue,
  computeVisualStyle,
} from "./visualStyles";
export type {
  BgValue,
  BorderTone,
  RadiusValue,
  ShadowValue,
  VisualStyleProps,
} from "./visualStyles";

// ---------------------------------------------------------------------------
// Domain types  (shared contract — stays in DS)
// ---------------------------------------------------------------------------
export type {
  ActivityEvent,
  ActivityIcon,
  AgentDef,
  AgentSdkCredit,
  Approval,
  BriefingItem,
  ClaudeLimits,
  Integration,
  IntegrationStatus,
  ModelName,
  Pipeline,
  PipelinePhase,
  PipelineState,
  PhaseLoop,
  QuotaLimit,
  RunningAgent,
  Skill,
  SystemStatus,
  ThinkingLevel,
} from "./domain";
export { glyphForAgent } from "./domain";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
export {
  Container,
  computeContainerStyle,
  CONTAINER_STYLE_KEYS,
} from "./components/Container";
export type { ContainerProps, ContainerAs } from "./components/Container";
export { Stack, Row } from "./components/Stack";
export type { StackProps, RowProps } from "./components/Stack";
export { Spacer } from "./components/Spacer";
export type { SpacerProps } from "./components/Spacer";

// ---------------------------------------------------------------------------
// Foundations
// ---------------------------------------------------------------------------
export { Icon, iconNames } from "./components/Icon/Icon";
export type { IconName, IconProps } from "./components/Icon/Icon";

// ---------------------------------------------------------------------------
// Generic components
// ---------------------------------------------------------------------------
export { Text, Heading } from "./components/Text/Text";
export type {
  TextProps,
  TextSize,
  TextTone,
  TextWeight,
  TextFont,
  HeadingProps,
  HeadingLevel,
} from "./components/Text/Text";

export { Divider } from "./components/Divider/Divider";
export type { DividerProps } from "./components/Divider/Divider";

export { Badge } from "./components/Badge/Badge";
export type { BadgeProps, BadgeTone } from "./components/Badge/Badge";

export { Chip, FilterChip } from "./components/Chip/Chip";
export type { ChipProps, FilterChipProps } from "./components/Chip/Chip";

export { Kbd } from "./components/Kbd/Kbd";
export type { KbdProps } from "./components/Kbd/Kbd";

export { Alert } from "./components/Alert/Alert";
export type { AlertProps, AlertSeverity } from "./components/Alert/Alert";

export {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardActions,
} from "./components/Card/Card";
export type { CardProps } from "./components/Card/Card";

export { Dialog, DialogBody } from "./components/Dialog/Dialog";
export type { DialogProps } from "./components/Dialog/Dialog";

export { Tabs, TabList, Tab, TabPanel } from "./components/Tabs/Tabs";
export type { TabsProps, TabProps } from "./components/Tabs/Tabs";

export {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  AccordionItem,
} from "./components/Accordion/Accordion";
export type {
  AccordionProps,
  AccordionSummaryProps,
  AccordionDetailsProps,
  AccordionItemProps,
} from "./components/Accordion/Accordion";

export { Button } from "./components/Button/Button";
export type { ButtonProps } from "./components/Button/Button";

export { Meter, usageTone } from "./components/Meter/Meter";
export type { MeterProps, MeterTone } from "./components/Meter/Meter";

export { StatusDot } from "./components/StatusDot/StatusDot";
export type { StatusDotProps, DotTone } from "./components/StatusDot/StatusDot";

// Pill kept for backward compat — use Badge for new code
export { Pill } from "./components/Pill/Pill";
export type { PillProps } from "./components/Pill/Pill";

export { HudPanel, Corners } from "./components/HudPanel/HudPanel";
export type {
  HudPanelProps,
  CornersProps,
} from "./components/HudPanel/HudPanel";

export { SectionLabel } from "./components/SectionLabel/SectionLabel";
export type { SectionLabelProps } from "./components/SectionLabel/SectionLabel";

export { Stat } from "./components/Stat/Stat";
export type { StatProps, StatTone } from "./components/Stat/Stat";

export { Sparkline } from "./components/Sparkline/Sparkline";
export type { SparklineProps } from "./components/Sparkline/Sparkline";

export { EmptyState } from "./components/EmptyState/EmptyState";
export type { EmptyStateProps } from "./components/EmptyState/EmptyState";

export {
  TextField,
  TextAreaField,
  SelectField,
  SegmentedField,
} from "./components/Field/Field";
export type {
  TextFieldProps,
  TextAreaFieldProps,
  SelectFieldProps,
  SegmentedFieldProps,
  SelectOption,
} from "./components/Field/Field";

// ModalShell kept for backward compat — use Dialog for new code
export { ModalShell } from "./components/ModalShell/ModalShell";
export type { ModalShellProps } from "./components/ModalShell/ModalShell";

export { EntityFormModal } from "./components/EntityFormModal/EntityFormModal";
export type {
  EntityFormModalProps,
  EntityFormValues,
  FieldSchema,
  FieldKind,
} from "./components/EntityFormModal/EntityFormModal";

// ---------------------------------------------------------------------------
// Domain composites now live in apps/web/features/<domain>/components/.
// AgentCard, AgentRow, ApprovalCard, ActivityFeed, IntegrationCard, SkillTile,
// RunModal, PipelineCard, PipelineRunModal, PhaseChain (+ ModelBadge/ThinkBadge)
// and LimitsWidget were moved out of the DS — it stays domain-neutral.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Dashboard chrome (router-agnostic, domain-neutral — stays in DS)
// ---------------------------------------------------------------------------
export { ContextSwitch } from "./components/ContextSwitch/ContextSwitch";
export type { ContextSwitchProps } from "./components/ContextSwitch/ContextSwitch";

export { Sidebar } from "./components/Sidebar/Sidebar";
export type { SidebarProps, NavItem } from "./components/Sidebar/Sidebar";

export { TopBar } from "./components/TopBar/TopBar";
export type { TopBarProps } from "./components/TopBar/TopBar";

export { DashboardShell } from "./components/DashboardShell/DashboardShell";
export type {
  DashboardShellProps,
  LinkComponentType,
} from "./components/DashboardShell/DashboardShell";

// ---------------------------------------------------------------------------
// Legacy theme exports (for gradual migration)
// ---------------------------------------------------------------------------
// contextStyle is no longer needed — use DesignSystemProvider instead.
// Kept temporarily as a re-export to avoid breaking existing Storybook stories.
export { contextStyle } from "./theme/context";
export type { ContextName as LegacyContextName } from "./theme/tokens";
