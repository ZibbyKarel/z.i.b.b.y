// z.i.b.b.y design system — public surface.
// Apps import only from here; raw Tailwind classes never leave this library.

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
export { cn } from "./utils/cn";

// ---------------------------------------------------------------------------
// Token system
// ---------------------------------------------------------------------------
export {
  mergeTheme,
  resolvePadding,
  spacingToPx,
  spacingValues,
  tokensToCssVars,
} from "./tokens";
export type { Padding, PartialTheme, Size, Spacing, Theme } from "./tokens";

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
export { useSpacing, useTokens } from "./DesignSystemContext/hooks";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
export {
  computeContainerStyle,
  Container,
  CONTAINER_STYLE_KEYS,
} from "./components/Container";
export type { ContainerAs, ContainerProps } from "./components/Container";
export { Grid, GridTestId } from "./components/Grid/Grid";
export type { GridAlign, GridCols, GridProps } from "./components/Grid/Grid";
export { Pressable, PressableTestId } from "./components/Pressable/Pressable";
export type { PressableProps } from "./components/Pressable/Pressable";
export { Spacer } from "./components/Spacer";
export type { SpacerProps } from "./components/Spacer";
export { Stack } from "./components/Stack";
export type { StackProps } from "./components/Stack";
export { Surface, SurfaceTestId } from "./components/Surface/Surface";
export type { SurfaceProps } from "./components/Surface/Surface";

// ---------------------------------------------------------------------------
// Foundations
// ---------------------------------------------------------------------------
export { Icon, iconNames } from "./components/Icon/Icon";
export type {
  IconName,
  IconProps,
  IconStroke,
  IconTone,
} from "./components/Icon/Icon";

export { IconTile, IconTileTestId } from "./components/IconTile/IconTile";
export type {
  IconTileProps,
  IconTileRadius,
  IconTileShape,
  IconTileSize,
  IconTileTone,
} from "./components/IconTile/IconTile";

// ---------------------------------------------------------------------------
// Generic components
// ---------------------------------------------------------------------------
export {
  Typography,
  TypographyTestId,
} from "./components/Typography/Typography";
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

export { Divider } from "./components/Divider/Divider";
export type { DividerProps } from "./components/Divider/Divider";

export { Badge } from "./components/Badge/Badge";
export type { BadgeProps, BadgeTone } from "./components/Badge/Badge";

export { Chip } from "./components/Chip/Chip";
export type { ChipProps } from "./components/Chip/Chip";

export { Kbd } from "./components/Kbd/Kbd";
export type { KbdProps } from "./components/Kbd/Kbd";

export { SearchBar, SearchBarTestId } from "./components/SearchBar/SearchBar";
export type { SearchBarProps } from "./components/SearchBar/SearchBar";

export { Alert } from "./components/Alert/Alert";
export type { AlertProps, AlertSeverity } from "./components/Alert/Alert";

export {
  Card,
  CardActions,
  CardContent,
  CardFooter,
  CardHeader,
} from "./components/Card/Card";
export type { CardProps } from "./components/Card/Card";

export { Dialog, DialogBody } from "./components/Dialog/Dialog";
export type { DialogProps, DialogWidth } from "./components/Dialog/Dialog";

export { Tab, TabList, TabPanel, Tabs } from "./components/Tabs/Tabs";
export type { TabProps, TabsProps } from "./components/Tabs/Tabs";

export {
  Accordion,
  AccordionDetails,
  AccordionItem,
  AccordionSummary,
} from "./components/Accordion/Accordion";
export type {
  AccordionDetailsProps,
  AccordionItemProps,
  AccordionProps,
  AccordionSummaryProps,
} from "./components/Accordion/Accordion";

export { Button } from "./components/Button/Button";
export type { ButtonProps } from "./components/Button/Button";

export { getUsageTone, Progress } from "./components/Progress/Progress";
export type {
  ProgressProps,
  ProgressTone,
} from "./components/Progress/Progress";

export { StatusDot } from "./components/StatusDot/StatusDot";
export type { DotTone, StatusDotProps } from "./components/StatusDot/StatusDot";

export { Toggle, ToggleTestId } from "./components/Toggle/Toggle";
export type { ToggleProps, ToggleSize } from "./components/Toggle/Toggle";

export { Panel, PanelTestId } from "./components/Panel/Panel";
export type { PanelProps } from "./components/Panel/Panel";

export { CodeBlock, CodeBlockTestId } from "./components/CodeBlock/CodeBlock";
export type {
  CodeBlockHeight,
  CodeBlockProps,
} from "./components/CodeBlock/CodeBlock";

export { Corners } from "./components/Card/Card";
export type { CornersProps, CornersTone } from "./components/Card/Card";

export { Stat } from "./components/Stat/Stat";
export type { StatProps, StatTone } from "./components/Stat/Stat";

export { Sparkline } from "./components/Sparkline/Sparkline";
export type { SparklineProps } from "./components/Sparkline/Sparkline";

export { Field, FieldTestId } from "./components/form/Field";
export type {
  FieldControl,
  FieldLayout,
  FieldProps,
  SelectOption,
} from "./components/form/Field";

export {
  TextInputField,
  TextInputFieldTestId,
} from "./components/form/TextInputField/TextInputField";
export type { TextInputFieldProps } from "./components/form/TextInputField/TextInputField";

export { TextAreaField, TextAreaFieldTestId } from "./components/form/TextAreaField/TextAreaField";
export type { TextAreaFieldProps } from "./components/form/TextAreaField/TextAreaField";

export { SelectField } from "./components/form/SelectField/SelectField";
export type { SelectFieldProps } from "./components/form/SelectField/SelectField";

export {
  SegmentPickerField,
  SegmentPickerFieldTestId,
} from "./components/form/SegmentPickerField/SegmentPickerField";
export type { SegmentPickerFieldProps } from "./components/form/SegmentPickerField/SegmentPickerField";

export { ToggleField, ToggleFieldTestId } from "./components/form/ToggleField/ToggleField";
export type { ToggleFieldProps } from "./components/form/ToggleField/ToggleField";

export {
  MarkdownEditor,
  MarkdownEditorTestId,
} from "./components/MarkdownEditor/MarkdownEditor";
export type { MarkdownEditorProps } from "./components/MarkdownEditor/MarkdownEditor";

// ---------------------------------------------------------------------------
// Dashboard chrome (router-agnostic, domain-neutral — stays in DS)
// ---------------------------------------------------------------------------
export { ButtonGroup } from "./components/ButtonGroup/ButtonGroup";
export type {
  ButtonGroupOption,
  ButtonGroupProps,
  ButtonGroupTone,
} from "./components/ButtonGroup/ButtonGroup";

export { Dropdown, DropdownTestId } from "./components/Dropdown/Dropdown";
export type {
  DropdownOption,
  DropdownProps,
  DropdownVariant,
} from "./components/Dropdown/Dropdown";

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
