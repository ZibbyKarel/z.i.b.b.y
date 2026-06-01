import type { CSSProperties, HTMLAttributes, Ref } from "react";
import { spacingToPx, resolvePadding, type Padding } from "../../tokens";

export type ContainerAs =
  | "div"
  | "section"
  | "article"
  | "aside"
  | "main"
  | "header"
  | "footer"
  | "nav"
  | "span"
  | "ul"
  | "ol"
  | "li"
  | "label"
  | "form";

export interface ContainerProps extends Omit<HTMLAttributes<HTMLElement>, "className"> {
  as?: ContainerAs;
  // Padding
  padding?: Padding;
  // Dimensions
  width?: string;
  height?: string;
  minWidth?: string;
  minHeight?: string;
  maxWidth?: string;
  maxHeight?: string;
  // Positioning
  position?: CSSProperties["position"];
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  zIndex?: number;
  // Overflow
  overflow?: CSSProperties["overflow"];
  overflowX?: CSSProperties["overflowX"];
  overflowY?: CSSProperties["overflowY"];
  // Other
  cursor?: CSSProperties["cursor"];
  pointerEvents?: CSSProperties["pointerEvents"];
  userSelect?: CSSProperties["userSelect"];
  textAlign?: CSSProperties["textAlign"];
  resize?: CSSProperties["resize"];
  // Flex child
  grow?: boolean;
  shrink?: boolean;
  minW0?: boolean;
  ref?: Ref<HTMLElement>;
}

export const CONTAINER_STYLE_KEYS: Array<keyof ContainerProps> = [
  "padding","width","height","minWidth","minHeight",
  "maxWidth","maxHeight","position","top","right","bottom","left","zIndex",
  "overflow","overflowX","overflowY","cursor","pointerEvents","userSelect",
  "textAlign","resize","grow","shrink","minW0",
];

export function computeContainerStyle(props: ContainerProps): CSSProperties {
  const style: CSSProperties = {};

  if (props.padding !== undefined) {
    const [t, r, b, l] = resolvePadding(props.padding).map(spacingToPx);
    style.padding = `${t} ${r} ${b} ${l}`;
  }
  if (props.width)      style.width = props.width;
  if (props.height)     style.height = props.height;
  if (props.minWidth)   style.minWidth = props.minWidth;
  if (props.minHeight)  style.minHeight = props.minHeight;
  if (props.maxWidth)   style.maxWidth = props.maxWidth;
  if (props.maxHeight)  style.maxHeight = props.maxHeight;
  if (props.position)   style.position = props.position;
  if (props.top)        style.top = props.top;
  if (props.right)      style.right = props.right;
  if (props.bottom)     style.bottom = props.bottom;
  if (props.left)       style.left = props.left;
  if (props.zIndex !== undefined) style.zIndex = props.zIndex;
  if (props.overflow)   style.overflow = props.overflow;
  if (props.overflowX)  style.overflowX = props.overflowX;
  if (props.overflowY)  style.overflowY = props.overflowY;
  if (props.cursor)     style.cursor = props.cursor;
  if (props.pointerEvents) style.pointerEvents = props.pointerEvents;
  if (props.userSelect) style.userSelect = props.userSelect;
  if (props.textAlign)  style.textAlign = props.textAlign;
  if (props.resize)     style.resize = props.resize;
  if (props.grow)       style.flexGrow = 1;
  if (props.shrink === false) style.flexShrink = 0;
  if (props.minW0)      style.minWidth = "0";

  return style;
}

export function Container({
  as: Tag = "div",
  padding,
  width,
  height,
  minWidth,
  minHeight,
  maxWidth,
  maxHeight,
  position,
  top,
  right,
  bottom,
  left,
  zIndex,
  overflow,
  overflowX,
  overflowY,
  cursor,
  pointerEvents,
  userSelect,
  textAlign,
  resize,
  grow,
  shrink,
  minW0,
  style,
  ref,
  ...rest
}: ContainerProps) {
  const layoutStyle = computeContainerStyle({
    padding,
    width, height, minWidth, minHeight, maxWidth, maxHeight,
    position, top, right, bottom, left, zIndex,
    overflow, overflowX, overflowY,
    cursor, pointerEvents, userSelect, textAlign, resize,
    grow, shrink, minW0,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Tag {...(rest as any)} ref={ref as Ref<HTMLElement>} style={{ ...layoutStyle, ...style }} />;
}
