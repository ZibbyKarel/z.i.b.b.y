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
  spacingToPx,
  resolvePadding,
  spacingValues,
  mergeTheme,
  tokensToCssVars,
} from "./tokens";
export type { Spacing, Padding, Size, Theme, PartialTheme } from "./tokens";

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
export { useTokens, useSpacing } from "./DesignSystemContext/hooks";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
export {
  Container,
  computeContainerStyle,
  CONTAINER_STYLE_KEYS,
} from "./components/Container";
export type { ContainerProps, ContainerAs } from "./components/Container";
export { Stack } from "./components/Stack";
export type { StackProps } from "./components/Stack";
export { Spacer } from "./components/Spacer";
export type { SpacerProps } from "./components/Spacer";
export { Grid, GridTestId } from "./components/Grid/Grid";
export type { GridProps, GridCols, GridAlign } from "./components/Grid/Grid";
export { Surface, SurfaceTestId } from "./components/Surface/Surface";
export type { SurfaceProps } from "./components/Surface/Surface";
export { Pressable, PressableTestId } from "./components/Pressable/Pressable";
export type { PressableProps } from "./components/Pressable/Pressable";

// ---------------------------------------------------------------------------
// Foundations
// ---------------------------------------------------------------------------
export { Icon, iconNames } from "./components/Icon/Icon";
export type { IconName, IconProps, IconStroke, IconTone } from "./components/Icon/Icon";

export { IconTile, IconTileTestId } from "./components/IconTile/IconTile";
export type {
  IconTileProps,
  IconTileSize,
  IconTileTone,
  IconTileRadius,
  IconTileShape,
} from "./components/IconTile/IconTile";

// ---------------------------------------------------------------------------
// Generic components
// ---------------------------------------------------------------------------
export {
  Typography,
  TypographyTestId,
} from "./components/Typography/Typography";
export type {
  TypographyProps,
  TypographyType,
  TypographyVariant,
  TypographyTone,
  TypographySize,
  TypographyWeight,
  TypographyTracking,
  TypographyLeading,
  TypographyAlign,
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
  CardHeader,
  CardContent,
  CardFooter,
  CardActions,
} from "./components/Card/Card";
export type { CardProps } from "./components/Card/Card";

export { Dialog, DialogBody } from "./components/Dialog/Dialog";
export type { DialogProps, DialogWidth } from "./components/Dialog/Dialog";

export { Tabs, TabList, Tab, TabPanel } from "./components/Tabs/Tabs";
export type { TabsProps, TabProps } from "./components/Tabs/Tabs";

export {
  Accordion,
  AccordionItem,
  AccordionSummary,
  AccordionDetails,
} from "./components/Accordion/Accordion";
export type {
  AccordionProps,
  AccordionItemProps,
  AccordionSummaryProps,
  AccordionDetailsProps,
} from "./components/Accordion/Accordion";

export { Button } from "./components/Button/Button";
export type { ButtonProps } from "./components/Button/Button";

export { Progress, usageTone } from "./components/Progress/Progress";
export type {
  ProgressProps,
  ProgressTone,
} from "./components/Progress/Progress";

export { StatusDot } from "./components/StatusDot/StatusDot";
export type { StatusDotProps, DotTone } from "./components/StatusDot/StatusDot";

export { Corners } from "./components/Card/Card";
export type { CornersProps, CornersTone } from "./components/Card/Card";

export { Stat } from "./components/Stat/Stat";
export type { StatProps, StatTone } from "./components/Stat/Stat";

export { Sparkline } from "./components/Sparkline/Sparkline";
export type { SparklineProps } from "./components/Sparkline/Sparkline";

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

// ---------------------------------------------------------------------------
// Dashboard chrome (router-agnostic, domain-neutral — stays in DS)
// ---------------------------------------------------------------------------
export { ButtonGroup } from "./components/ButtonGroup/ButtonGroup";
export type {
  ButtonGroupProps,
  ButtonGroupOption,
  ButtonGroupTone,
} from "./components/ButtonGroup/ButtonGroup";

export {
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemBadge,
  ListTestId,
} from "./components/List/List";
export type {
  ListProps,
  ListItemProps,
  ListItemIconProps,
  ListItemBadgeProps,
  NavItem,
  LinkComponentType,
} from "./components/List/List";
