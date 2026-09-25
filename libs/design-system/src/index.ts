// z.i.b.b.y design system — public surface.
// Apps import only from here; raw Tailwind classes never leave this library.

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
export { cn } from "./utils/cn";
export { mergeRefs } from "./utils/refs";

// ---------------------------------------------------------------------------
// Token system
// ---------------------------------------------------------------------------
export {
  LAYOUT,
  mergeTheme,
  resolvePadding,
  spacingToPx,
  spacingValues,
  tokensToCssVars,
} from "./tokens";
export type { Padding, PartialTheme, Size, Spacing, Theme } from "./tokens";

// ---------------------------------------------------------------------------
// Canonical state vocabulary (the living-state contract — see theme/LIVING-STATE.md)
// ---------------------------------------------------------------------------
export {
  LEGACY_TONE_MAP,
  normalizeStateTone,
  normalizeToneLike,
  resetStateToneHexCache,
  resolveStateToneHex,
  STATE_LABEL,
  STATE_ORDER,
  STATE_TONES,
  stateToneHex,
  stateToneVar,
} from "./stateTone";
export type { AnyStateTone, LegacyStateTone, StateTone } from "./stateTone";

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
export {
  DesignSystemProvider,
  THEME_STORAGE_KEY,
} from "./DesignSystemContext/DesignSystemProvider";
export type {
  DesignSystemProviderProps,
  ResolvedTheme,
  ThemeChoice,
} from "./DesignSystemContext/DesignSystemProvider";
export { ThemeScript, ThemeScriptTestId } from "./DesignSystemContext/ThemeScript";
export type { ThemeScriptProps } from "./DesignSystemContext/ThemeScript";
export { useSpacing, useTokens } from "./DesignSystemContext/hooks";
export { useOverlayStack } from "./hooks/useOverlayStack";
export type { OverlayStackHandle } from "./hooks/useOverlayStack";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
export {
  computeContainerStyle,
  Container,
  ContainerTestId,
  CONTAINER_STYLE_KEYS,
} from "./components/Container";
export type { ContainerAs, ContainerProps } from "./components/Container";
export { Grid, GridTestId } from "./components/Grid/Grid";
export type { GridAlign, GridCols, GridProps } from "./components/Grid/Grid";
export { Pressable, PressableTestId } from "./components/Pressable/Pressable";
export type { PressableProps, PressableChipTone } from "./components/Pressable/Pressable";
export { Spacer, SpacerTestId } from "./components/Spacer";
export type { SpacerProps } from "./components/Spacer";
export { Row, Stack, StackTestId } from "./components/Stack";
export type { RowProps, StackProps } from "./components/Stack";
export { Surface, SurfaceTestId } from "./components/Surface/Surface";
export type { SurfaceProps } from "./components/Surface/Surface";

// ---------------------------------------------------------------------------
// Foundations
// ---------------------------------------------------------------------------
export { Icon, IconTestId, iconNames } from "./components/Icon/Icon";
export type { IconName, IconProps, IconStroke, IconTone } from "./components/Icon/Icon";

export { IconTile, IconTileTestId } from "./components/IconTile/IconTile";
export type {
  IconTileProps,
  IconTileRadius,
  IconTileShape,
  IconTileSize,
  IconTileTone,
} from "./components/IconTile/IconTile";

export { EntityHero, EntityHeroTestId } from "./components/EntityHero/EntityHero";
export type { EntityHeroProps } from "./components/EntityHero/EntityHero";

// ---------------------------------------------------------------------------
// Generic components
// ---------------------------------------------------------------------------
export { Typography, TypographyTestId } from "./components/Typography/Typography";
export type {
  TypographyAlign,
  TypographyLeading,
  TypographyProps,
  TypographySize,
  TypographyTone,
  TypographyTracking,
  TypographyType,
  TypographyVariant,
  TypographyWeight,
} from "./components/Typography/Typography";

export { Divider, DividerTestId } from "./components/Divider/Divider";
export type { DividerProps } from "./components/Divider/Divider";

export { Chip, ChipTestId } from "./components/Chip/Chip";
export type { ChipProps, ChipTone } from "./components/Chip/Chip";

export { Checkbox, CheckboxTestId } from "./components/Checkbox/Checkbox";
export type { CheckboxProps, CheckboxSize } from "./components/Checkbox/Checkbox";

export { Tag, TagTestId, riskIcon } from "./components/Tag/Tag";
export type { RiskKind, TagProps, TagTone } from "./components/Tag/Tag";

export { Kbd, KbdTestId } from "./components/Kbd/Kbd";
export type { KbdProps } from "./components/Kbd/Kbd";

export { SearchBar, SearchBarTestId } from "./components/SearchBar/SearchBar";
export type { SearchBarProps } from "./components/SearchBar/SearchBar";

export { SearchInput, SearchInputTestId } from "./components/SearchInput/SearchInput";
export type { SearchInputProps } from "./components/SearchInput/SearchInput";

export { SearchMenu, SearchMenuTestId } from "./components/SearchMenu/SearchMenu";
export type {
  SearchMenuItem,
  SearchMenuProps,
  SearchMenuSection,
} from "./components/SearchMenu/SearchMenu";

export { Alert, AlertTestId } from "./components/Alert/Alert";
export type { AlertProps, AlertSeverity } from "./components/Alert/Alert";

export {
  Card,
  CardActions,
  CardContent,
  CardFooter,
  CardHeader,
  CardTestId,
} from "./components/Card/Card";
export type { CardProps } from "./components/Card/Card";

export { LivingGlow, LivingGlowTestId } from "./components/LivingGlow/LivingGlow";
export type { LivingGlowIntensity, LivingGlowProps } from "./components/LivingGlow/LivingGlow";

export { FloatingPanel, FloatingPanelTestId } from "./components/FloatingPanel/FloatingPanel";
export type { FloatingPanelProps } from "./components/FloatingPanel/FloatingPanel";

export { Dialog, DialogBody, DialogTestId } from "./components/Dialog/Dialog";
export type { DialogProps, DialogWidth } from "./components/Dialog/Dialog";

export { Tab, TabList, TabPanel, Tabs, TabsTestId } from "./components/Tabs/Tabs";
export type { TabProps, TabsProps } from "./components/Tabs/Tabs";

export {
  Accordion,
  AccordionDetails,
  AccordionItem,
  AccordionSummary,
  AccordionTestId,
} from "./components/Accordion/Accordion";
export type {
  AccordionDetailsProps,
  AccordionItemProps,
  AccordionProps,
  AccordionSummaryProps,
} from "./components/Accordion/Accordion";

export { Button, ButtonTestId } from "./components/Button/Button";
export type { ButtonIntent, ButtonProps, ButtonSize } from "./components/Button/Button";

export { HoldButton, HoldButtonTestId } from "./components/HoldButton/HoldButton";
export type {
  HoldButtonProps,
  HoldButtonSize,
  HoldButtonTone,
} from "./components/HoldButton/HoldButton";

export { getUsageTone, Progress, ProgressTestId } from "./components/Progress/Progress";
export type { ProgressProps, ProgressTone } from "./components/Progress/Progress";

export { ProgressRing, ProgressRingTestId } from "./components/ProgressRing/ProgressRing";
export type { ProgressRingProps, ProgressRingSize } from "./components/ProgressRing/ProgressRing";

export { OrbitLoader, OrbitLoaderTestId } from "./components/OrbitLoader/OrbitLoader";
export type { OrbitLoaderProps, OrbitLoaderSize } from "./components/OrbitLoader/OrbitLoader";

export { StatusDot, StatusDotTestId } from "./components/StatusDot/StatusDot";
export type { DotTone, StatusDotProps } from "./components/StatusDot/StatusDot";

export { AgentGlyph, AgentGlyphTestId } from "./components/AgentGlyph/AgentGlyph";
export type { AgentGlyphProps, GlyphSize } from "./components/AgentGlyph/AgentGlyph";

export { StatePill, StatePillTestId } from "./components/StatePill/StatePill";
export type { StatePillProps } from "./components/StatePill/StatePill";

export { CellStrip, CellStripTestId } from "./components/CellStrip/CellStrip";
export type { CellStripProps } from "./components/CellStrip/CellStrip";

export { Toggle, ToggleTestId } from "./components/Toggle/Toggle";
export type { ToggleProps, ToggleSize } from "./components/Toggle/Toggle";
export { Tooltip, TooltipTestId } from "./components/Tooltip/Tooltip";
export type { TooltipProps, TooltipSide } from "./components/Tooltip/Tooltip";

export { Panel, PanelTestId } from "./components/Panel/Panel";
export type { PanelProps } from "./components/Panel/Panel";

export { CodeBlock, CodeBlockTestId } from "./components/CodeBlock/CodeBlock";
export type { CodeBlockHeight, CodeBlockProps } from "./components/CodeBlock/CodeBlock";

export { Corners } from "./components/Card/Card";
export type { CornersProps, CornersTone } from "./components/Card/Card";

export { Stat, StatTestId } from "./components/Stat/Stat";
export type { StatProps, StatTone } from "./components/Stat/Stat";

export { Sparkline, SparklineTestId } from "./components/Sparkline/Sparkline";
export type { SparklineProps } from "./components/Sparkline/Sparkline";

export { Field, FieldTestId } from "./components/form/Field";
export type { FieldControl, FieldLayout, FieldProps, SelectOption } from "./components/form/Field";

export {
  TextInputField,
  TextInputFieldTestId,
} from "./components/form/TextInputField/TextInputField";
export type { TextInputFieldProps } from "./components/form/TextInputField/TextInputField";

export { NumberField, NumberFieldTestId } from "./components/form/NumberField/NumberField";
export type { NumberFieldProps } from "./components/form/NumberField/NumberField";

export { TextAreaField, TextAreaFieldTestId } from "./components/form/TextAreaField/TextAreaField";
export type { TextAreaFieldProps } from "./components/form/TextAreaField/TextAreaField";

export {
  HighlightTextAreaField,
  HighlightTextAreaFieldTestId,
} from "./components/form/HighlightTextAreaField/HighlightTextAreaField";
export type {
  HighlightRange,
  HighlightTextAreaFieldProps,
  HighlightTone,
} from "./components/form/HighlightTextAreaField/HighlightTextAreaField";

export { SelectField } from "./components/form/SelectField/SelectField";
export type {
  SelectFieldMultiProps,
  SelectFieldProps,
  SelectFieldSingleProps,
} from "./components/form/SelectField/SelectField";

export { SegmentPickerField } from "./components/form/SegmentPickerField/SegmentPickerField";
export type { SegmentPickerFieldProps } from "./components/form/SegmentPickerField/SegmentPickerField";

export {
  SchedulePicker,
  SchedulePickerTestId,
} from "./components/form/SchedulePicker/SchedulePicker";
export type {
  Schedule,
  ScheduleRepeat,
  SchedulePickerLabels,
  SchedulePickerProps,
} from "./components/form/SchedulePicker/SchedulePicker";

export { ScheduleField } from "./components/form/ScheduleField/ScheduleField";
export type { ScheduleFieldProps } from "./components/form/ScheduleField/ScheduleField";

export { ToggleField, ToggleFieldTestId } from "./components/form/ToggleField/ToggleField";
export type { ToggleFieldProps } from "./components/form/ToggleField/ToggleField";

export {
  FilePickerField,
  FilePickerFieldTestId,
} from "./components/form/FilePickerField/FilePickerField";
export type { FilePickerFieldProps } from "./components/form/FilePickerField/FilePickerField";

export { DropZone, DropZoneTestId } from "./components/DropZone/DropZone";
export type { DropZoneProps, FileAccept, FileRejection } from "./components/DropZone/DropZone";

export { FilePreview, FilePreviewTestId, iconForFile } from "./components/FilePreview/FilePreview";
export type { FilePreviewProps } from "./components/FilePreview/FilePreview";

export { DropZoneField } from "./components/form/DropZoneField/DropZoneField";
export type { DropZoneFieldProps } from "./components/form/DropZoneField/DropZoneField";

export { MarkdownEditor, MarkdownEditorTestId } from "./components/MarkdownEditor/MarkdownEditor";
export type { MarkdownEditorProps } from "./components/MarkdownEditor/MarkdownEditor";
export { Markdown, MarkdownTestId } from "./components/Markdown/Markdown";
export type { MarkdownProps, MarkdownVariant } from "./components/Markdown/Markdown";

export { GraphInlineInput, GraphInlineInputTestId } from "./components/Graph/GraphInlineInput";
export type {
  GraphInlineInputProps,
  GraphInlineInputVariant,
} from "./components/Graph/GraphInlineInput";
export { GraphIconButton, GraphIconButtonTestId } from "./components/Graph/GraphIconButton";
export type {
  GraphIconButtonProps,
  GraphIconButtonVariant,
} from "./components/Graph/GraphIconButton";

export {
  iconDockLinkAttrs,
  immersiveBackLinkAttrs,
  hiddenBelowLgFlexAttrs,
  htmlFontAttrs,
} from "./utils/domAttrs";

// ---------------------------------------------------------------------------
// Dashboard chrome (router-agnostic, domain-neutral — stays in DS)
// ---------------------------------------------------------------------------
export { ButtonGroup, ButtonGroupTestId } from "./components/ButtonGroup/ButtonGroup";
export type {
  ButtonGroupOption,
  ButtonGroupProps,
  ButtonGroupTone,
} from "./components/ButtonGroup/ButtonGroup";

export { Dropdown, DropdownTestId } from "./components/Dropdown/Dropdown";
export type {
  DropdownMultiProps,
  DropdownOption,
  DropdownProps,
  DropdownSingleProps,
  DropdownSize,
  DropdownTone,
  DropdownVariant,
} from "./components/Dropdown/Dropdown";

export { MenuSurface, MenuSurfaceTestId } from "./components/MenuSurface/MenuSurface";
export type { MenuSurfaceAlign, MenuSurfaceProps } from "./components/MenuSurface/MenuSurface";

export { DropDownButton, DropDownButtonTestId } from "./components/DropDownButton/DropDownButton";
export type {
  DropDownButtonItem,
  DropDownButtonProps,
} from "./components/DropDownButton/DropDownButton";

export { MenuButton, MenuButtonTestId } from "./components/MenuButton/MenuButton";
export type { MenuButtonItem, MenuButtonProps } from "./components/MenuButton/MenuButton";

export {
  List,
  ListItem,
  ListItemBadge,
  ListItemIcon,
  ListItemText,
  ListTestId,
} from "./components/List/List";
export type {
  ListItemBadgeProps,
  ListItemIconProps,
  ListItemProps,
  ListProps,
  NavItem,
} from "./components/List/List";

// ---------------------------------------------------------------------------
// Overlay and navigation (ZA-05)
// ---------------------------------------------------------------------------
export { Sheet, SheetTestId } from "./components/Sheet/Sheet";
export type { SheetProps, SheetSide, SheetWidth } from "./components/Sheet/Sheet";

export { CommandPalette, CommandPaletteTestId } from "./components/CommandPalette/CommandPalette";
export type {
  CommandPaletteGroup,
  CommandPaletteItem,
  CommandPaletteProps,
} from "./components/CommandPalette/CommandPalette";

export { ApprovalCard, ApprovalCardTestId } from "./components/ApprovalCard/ApprovalCard";
export type {
  ApprovalCardDensity,
  ApprovalCardProps,
} from "./components/ApprovalCard/ApprovalCard";

export { SubNav, SubNavTestId } from "./components/SubNav/SubNav";
export type { SubNavItem, SubNavLinkComponent, SubNavProps } from "./components/SubNav/SubNav";

export { PatternCard, PatternCardTestId } from "./components/PatternCard/PatternCard";
export type { PatternCardProps } from "./components/PatternCard/PatternCard";

export { GoalCard, GoalCardTestId } from "./components/GoalCard/GoalCard";
export type { GoalCardProps } from "./components/GoalCard/GoalCard";

export { ContactRow, ContactRowTestId } from "./components/ContactRow/ContactRow";
export type { ContactRowProps } from "./components/ContactRow/ContactRow";

export { Breadcrumb, BreadcrumbTestId } from "./components/Breadcrumb/Breadcrumb";
export type { BreadcrumbItem, BreadcrumbProps } from "./components/Breadcrumb/Breadcrumb";

// ---------------------------------------------------------------------------
// Data & layout (ZA-04)
// ---------------------------------------------------------------------------
export { SectionLabel, SectionLabelTestId } from "./components/SectionLabel/SectionLabel";
export type { SectionLabelProps } from "./components/SectionLabel/SectionLabel";

export {
  SegmentedControl,
  SegmentedControlTestId,
} from "./components/SegmentedControl/SegmentedControl";
export type {
  SegmentedControlItem,
  SegmentedControlProps,
  SegmentedControlSize,
} from "./components/SegmentedControl/SegmentedControl";

export { MetricStrip, MetricStripTestId } from "./components/MetricStrip/MetricStrip";
export type { MetricStripItem, MetricStripProps } from "./components/MetricStrip/MetricStrip";

export { DataTable, DataTableTestId } from "./components/DataTable/DataTable";
export type {
  ColumnWidth,
  DataTableColumn,
  DataTableProps,
} from "./components/DataTable/DataTable";

export { FilterBar, FilterBarTestId } from "./components/FilterBar/FilterBar";
export type { FilterBarProps } from "./components/FilterBar/FilterBar";

export { LogStream, LogStreamTestId } from "./components/LogStream/LogStream";
export type { LogStreamLine, LogStreamProps } from "./components/LogStream/LogStream";

export {
  ChainRouteStrip,
  ChainRouteStripTestId,
} from "./components/ChainRouteStrip/ChainRouteStrip";
export type {
  ChainRouteStripGate,
  ChainRouteStripProps,
  ChainRouteStripSize,
  ChainRouteStripStep,
} from "./components/ChainRouteStrip/ChainRouteStrip";

export {
  PipelineStepStrip,
  PipelineStepStripTestId,
} from "./components/PipelineStepStrip/PipelineStepStrip";
export type {
  PipelineStepStripPhase,
  PipelineStepStripProps,
} from "./components/PipelineStepStrip/PipelineStepStrip";

export { GateToggle, GateToggleTestId } from "./components/GateToggle/GateToggle";
export type { GateMode, GateToggleProps } from "./components/GateToggle/GateToggle";

export { BudgetMeter, BudgetMeterTestId } from "./components/BudgetMeter/BudgetMeter";
export type { BudgetMeterProps } from "./components/BudgetMeter/BudgetMeter";

export { LimitBar, LimitBarTestId } from "./components/LimitBar/LimitBar";
export type { LimitBarProps } from "./components/LimitBar/LimitBar";

export { Slider, SliderTestId } from "./components/Slider/Slider";
export type { SliderProps } from "./components/Slider/Slider";

export { DiffView, DiffViewTestId } from "./components/DiffView/DiffView";
export type {
  DiffHunk,
  DiffLine,
  DiffLineType,
  DiffViewProps,
  DiffViewStat,
} from "./components/DiffView/DiffView";

export {
  CONFIRM_DELETE_TIMEOUT_MS,
  ConfirmDeleteButton,
  ConfirmDeleteButtonTestId,
} from "./components/ConfirmDeleteButton/ConfirmDeleteButton";
export type { ConfirmDeleteButtonProps } from "./components/ConfirmDeleteButton/ConfirmDeleteButton";

export { OrgNode, OrgNodeTestId } from "./components/OrgNode/OrgNode";
export type { OrgNodeProps } from "./components/OrgNode/OrgNode";

export { Legend, LegendTestId } from "./components/Legend/Legend";
export type { LegendItem, LegendProps } from "./components/Legend/Legend";

export { EmptyState, EmptyStateTestId } from "./components/EmptyState/EmptyState";
export type { EmptyStateProps } from "./components/EmptyState/EmptyState";

// ---------------------------------------------------------------------------
// Immersive orb map — pure geometry/state helpers, WebGL/DOM primitives, and
// the composed OrbMap. See immersive/index.ts for the hand-authored barrel
// this section mirrors.
// ---------------------------------------------------------------------------
export { ellipseLayout } from "./immersive/ellipseLayout";
export type { EllipseInsets, EllipseLayout, OrbPosition } from "./immersive/ellipseLayout";

export { ORB_MOTION, ORB_STATE, ORB_STATE_COLOR } from "./immersive/orbState";
export type { OrbMotion, OrbState, OrbStateStyle } from "./immersive/orbState";

export { hashSeed, seededRandom } from "./immersive/seededRandom";
export { canMountWebGL } from "./immersive/canMountWebGL";

export { Orb, OrbTestId } from "./immersive/Orb/Orb";
export type { OrbMotionOverrides, OrbProps } from "./immersive/Orb/Orb";

export { OrbitField, OrbitFieldTestId } from "./immersive/OrbitField/OrbitField";
export type { OrbitFieldProps } from "./immersive/OrbitField/OrbitField";

export { OrbNode, OrbNodeTestId } from "./immersive/OrbNode/OrbNode";
export type { OrbNodeProps } from "./immersive/OrbNode/OrbNode";

export { CoreOrb, CoreOrbTestId } from "./immersive/CoreOrb/CoreOrb";
export type { CoreOrbProps } from "./immersive/CoreOrb/CoreOrb";

export { ConnectorLayer, ConnectorLayerTestId } from "./immersive/ConnectorLayer/ConnectorLayer";
export type { ConnectorLayerProps, ConnectorNode } from "./immersive/ConnectorLayer/ConnectorLayer";

export {
  DEFAULT_DURATION_MS,
  HandoffFlare,
  HandoffFlareTestId,
  RETIRE_BUFFER_MS,
} from "./immersive/HandoffFlare/HandoffFlare";
export type { HandoffFlareProps } from "./immersive/HandoffFlare/HandoffFlare";
export { arcPath } from "./immersive/HandoffFlare/arcPath";

export { ORB_MAP_CORE_ID, OrbMap, OrbMapTestId } from "./immersive/OrbMap/OrbMap";
export type { OrbMapCore, OrbMapFlare, OrbMapNode, OrbMapProps } from "./immersive/OrbMap/OrbMap";

export { GlassSurface, GlassSurfaceTestId } from "./immersive/GlassSurface/GlassSurface";
export type { GlassSurfaceProps } from "./immersive/GlassSurface/GlassSurface";

export {
  ImmersiveShell,
  ImmersiveShellTestId,
  MAIN_CONTENT_ID,
} from "./immersive/ImmersiveShell/ImmersiveShell";
export type { ImmersiveShellProps } from "./immersive/ImmersiveShell/ImmersiveShell";

// ---------------------------------------------------------------------------
// Shell components + Splash (ZA-06)
// ---------------------------------------------------------------------------
export {
  AppFrame,
  AppFrameTestId,
  APP_FRAME_MAIN_CONTENT_ID,
} from "./components/AppFrame/AppFrame";
export type { AppFrameProps } from "./components/AppFrame/AppFrame";

export { AppHeader, AppHeaderTestId } from "./components/AppHeader/AppHeader";
export type { AppHeaderProps } from "./components/AppHeader/AppHeader";

export { Rail, RailTestId } from "./components/Rail/Rail";
export type { RailProps } from "./components/Rail/Rail";

export { ChatDock, ChatDockTestId } from "./components/ChatDock/ChatDock";
export type { ChatDockProps } from "./components/ChatDock/ChatDock";

export {
  Splash,
  SplashTestId,
  SPLASH_EXIT_MS,
  SPLASH_REVEAL_MS,
  SPLASH_WALK_MS,
} from "./components/Splash/Splash";
export type { SplashPhase, SplashProps } from "./components/Splash/Splash";

export { Wordmark, WordmarkTestId } from "./components/Wordmark/Wordmark";
export type { WordmarkProps } from "./components/Wordmark/Wordmark";

export { SkipLink, SkipLinkTestId } from "./components/SkipLink/SkipLink";
export type { SkipLinkProps } from "./components/SkipLink/SkipLink";
