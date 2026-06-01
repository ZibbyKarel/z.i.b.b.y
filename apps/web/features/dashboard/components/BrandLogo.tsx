import { Icon } from "@zibby/design-system";

export function BrandLogo() {
  return (
    <div className="px-1.5 pb-6 pt-1">
      <div className="flex items-center gap-3">
        <Icon name="butlerSign" size="xl" className="text-foreground" />
        <div className="font-mono text-2xl font-bold tracking-mono text-foreground">
          Z<span className="text-foreground-faint">·</span>I
          <span className="text-foreground-faint">·</span>B
          <span className="text-foreground-faint">·</span>B
          <span className="text-foreground-faint">·</span>Y
        </div>
      </div>
      <div className="mt-2 whitespace-nowrap font-mono text-2xs tracking-tighter text-foreground-faint">
        Zestful Intuitive Brainy Butler for You
      </div>
    </div>
  );
}
