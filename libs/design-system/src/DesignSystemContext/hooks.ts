import { useContext } from "react";
import type { ColorTokens, DesignTokens, FontTokens, SizeTokens } from "../tokens";
import { spacingValues, type Spacing } from "../tokens";
import { DesignSystemTokenContext } from "./DesignSystemProvider";
import { defaultDarkTokens } from "./themeRegistry";

function useTokensRequired(): DesignTokens {
  const ctx = useContext(DesignSystemTokenContext);
  return ctx ?? defaultDarkTokens;
}

export function useTokens(): DesignTokens {
  return useTokensRequired();
}

export function useTextColors(): ColorTokens["text"] {
  return useTokensRequired().color.text;
}

export function useAccentColors(): ColorTokens["accent"] {
  return useTokensRequired().color.accent;
}

export function useSizeTokens(): SizeTokens {
  return useTokensRequired().size;
}

export function useFontTokens(): FontTokens {
  return useTokensRequired().font;
}

export function useSpacing(token: Spacing): string {
  return spacingValues[token];
}
