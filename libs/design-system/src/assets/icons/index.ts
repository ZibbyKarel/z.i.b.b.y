import type { ReactNode } from "react";

import { grid } from "./grid";
import { spark } from "./spark";
import { plug } from "./plug";
import { clock } from "./clock";
import { brain } from "./brain";
import { pulse } from "./pulse";
import { cart } from "./cart";
import { film } from "./film";
import { server } from "./server";
import { doc } from "./doc";
import { play } from "./play";
import { run } from "./run";
import { wait } from "./wait";
import { ok } from "./ok";
import { edit } from "./edit";
import { bolt } from "./bolt";
import { check } from "./check";
import { x } from "./x";
import { stop } from "./stop";
import { plus } from "./plus";
import { chevron } from "./chevron";
import { dots } from "./dots";
import { file } from "./file";
import { shield } from "./shield";
import { search } from "./search";
import { gear } from "./gear";
import { bot } from "./bot";
import { flow } from "./flow";
import { compass } from "./compass";
import { code } from "./code";
import { flask } from "./flask";
import { dollar } from "./dollar";
import { branch } from "./branch";
import { pause } from "./pause";
import { retry } from "./retry";
import { checkpoint } from "./checkpoint";
import { moon } from "./moon";
import { coffee } from "./coffee";
import { link } from "./link";
import { warn } from "./warn";
import { arrow } from "./arrow";
import { butlerSign } from "./butlerSign";
import { pin } from "./pin";
import { paperclip } from "./paperclip";
import { mic } from "./mic";
import { trash } from "./trash";
import { expand } from "./expand";
import { collapse } from "./collapse";
import { help } from "./help";

/** Every glyph available in the dashboard icon set. */
export const iconNames = [
  "grid",
  "spark",
  "plug",
  "clock",
  "brain",
  "pulse",
  "cart",
  "film",
  "server",
  "doc",
  "play",
  "run",
  "wait",
  "ok",
  "edit",
  "bolt",
  "check",
  "x",
  "stop",
  "plus",
  "chevron",
  "dots",
  "file",
  "shield",
  "search",
  "gear",
  "bot",
  "flow",
  "compass",
  "code",
  "flask",
  "dollar",
  "branch",
  "pause",
  "retry",
  "checkpoint",
  "moon",
  "coffee",
  "link",
  "warn",
  "arrow",
  "butlerSign",
  "pin",
  "paperclip",
  "mic",
  "trash",
  "expand",
  "collapse",
  "help",
] as const;

export type IconName = (typeof iconNames)[number];

/** Inner SVG markup for each glyph, keyed by name. */
export const paths: Record<IconName, ReactNode> = {
  grid,
  spark,
  plug,
  clock,
  brain,
  pulse,
  cart,
  film,
  server,
  doc,
  play,
  run,
  wait,
  ok,
  edit,
  bolt,
  check,
  x,
  stop,
  plus,
  chevron,
  dots,
  file,
  shield,
  search,
  gear,
  bot,
  flow,
  compass,
  code,
  flask,
  dollar,
  branch,
  pause,
  retry,
  checkpoint,
  moon,
  coffee,
  link,
  warn,
  arrow,
  butlerSign,
  pin,
  paperclip,
  mic,
  trash,
  expand,
  collapse,
  help,
};
