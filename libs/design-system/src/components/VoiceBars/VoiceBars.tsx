export enum VoiceBarsTestId {
  Root = "voice-bars-root",
  Bar = "voice-bars-bar",
}

const DELAYS = [
  "[animation-delay:0s]",
  "[animation-delay:.12s]",
  "[animation-delay:.24s]",
  "[animation-delay:.36s]",
];

/** Four animated bars — the "listening" glyph of a voice button. Static under reduced motion. */
export function VoiceBars() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-3 items-center gap-0.5"
      data-testid={VoiceBarsTestId.Root}
    >
      {DELAYS.map((delay) => (
        <span
          className={`h-3 w-0.5 origin-center bg-run animate-zb-bar ${delay}`}
          data-testid={VoiceBarsTestId.Bar}
          key={delay}
        />
      ))}
    </span>
  );
}
