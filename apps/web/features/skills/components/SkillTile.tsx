import {
  cn,
  Button,
  Corners,
  Icon,
  type Skill,
} from "@zibby/design-system";

export interface SkillTileProps {
  skill: Skill;
  onRun: (skill: Skill) => void;
  className?: string;
}

export function SkillTile({ skill, onRun, className }: SkillTileProps) {
  return (
    <div
      className={cn(
        "group relative rounded-sm border border-border bg-panel p-3.5 transition-all",
        "hover:border-accent/35 hover:bg-panel-hi hover:shadow-card",
        className,
      )}
    >
      <Corners inset={5} />
      <div className="flex items-start gap-3">
        <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-sm border border-accent/20 bg-accent-dim text-accent">
          <Icon name={skill.glyph} size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-md font-semibold text-foreground">
            {skill.name}
          </div>
          <div className="mt-0.5 text-caption leading-snug text-foreground-dim">
            {skill.desc}
          </div>
        </div>
        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground-faint" aria-hidden />
      </div>
      <div className="mt-3.5 flex items-center justify-between">
        <span className="max-w-[130px] truncate font-mono text-xs text-foreground-faint">
          {skill.file.replace("~/zibby/skills/", "")}
        </span>
        <Button intent="run" size="sm" icon="play" onClick={() => onRun(skill)}>
          Spustit
        </Button>
      </div>
    </div>
  );
}
