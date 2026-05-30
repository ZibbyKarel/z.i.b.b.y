import { HudPanel, Icon, type IconName } from "@zibby/design-system"

export interface PlaceholderScreenProps {
  label: string
  glyph: IconName
}

/** Graceful placeholder for screens that follow the same card → modal pattern. */
export function PlaceholderScreen({ label, glyph }: PlaceholderScreenProps) {
  return (
    <div className="mx-auto max-w-[1400px]">
      <HudPanel className="p-10">
        <div className="flex flex-col items-center gap-3.5 py-10 text-center">
          <div className="grid h-14 w-14 place-items-center rounded border border-accent/35 bg-[rgba(255,255,255,0.02)] text-accent">
            <Icon name={glyph} size={26} />
          </div>
          <div className="text-3xl font-semibold">{label}</div>
          <p className="max-w-md font-mono text-base leading-relaxed text-foreground-dim">
            Tahle obrazovka je další na řadě. Drží stejný vzor — karty (= soubory na disku) → čudlík →
            modal s promptem → běh na pozadí.
          </p>
          <span className="font-mono text-sm tracking-wider text-foreground-faint">
            // v přípravě
          </span>
        </div>
      </HudPanel>
    </div>
  )
}
