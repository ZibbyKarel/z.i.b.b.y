import type { Ref } from "react";

export enum WidgetCatalogTestId {
  Root = "widget-catalog-root",
  Close = "widget-catalog-close",
  /** Suffixed with the entry id, e.g. `widget-catalog-entry-prs`. */
  Entry = "widget-catalog-entry",
  /** Suffixed with the entry id. */
  Add = "widget-catalog-add",
  Empty = "widget-catalog-empty",
}

export interface WidgetCatalogEntry {
  id: string;
  label: string;
  description: string;
}

export interface WidgetCatalogProps {
  title: string;
  entries: readonly WidgetCatalogEntry[];
  onAdd: (id: string) => void;
  onClose: () => void;
  addLabel: string;
  closeLabel: string;
  /** Shown when `entries` is empty. */
  emptyText: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Popover listing the widgets not yet on a board, each with an ADD button. Positioned
 * `absolute` (top 54px / right 150px, z 40) — render it inside the screen's
 * `relative` root, below the `CommandBar`.
 */
export function WidgetCatalog({
  title,
  entries,
  onAdd,
  onClose,
  addLabel,
  closeLabel,
  emptyText,
  ref,
}: WidgetCatalogProps) {
  return (
    <div
      className="absolute right-[150px] top-[54px] z-40 flex w-[280px] flex-col border border-ink bg-panel leading-[normal]"
      data-testid={WidgetCatalogTestId.Root}
      ref={ref}
    >
      <div className="flex justify-between border-b border-line px-[12px] py-[10px] font-mono text-[10px] tracking-[.14em] text-ink-3">
        <span>{title}</span>
        <button
          aria-label={closeLabel}
          className="cursor-pointer bg-transparent text-ink-3 hover:text-ink"
          data-testid={WidgetCatalogTestId.Close}
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>
      {entries.map((entry) => (
        <div
          className="flex items-center gap-[10px] border-b border-line px-[12px] py-[9px]"
          data-testid={`${WidgetCatalogTestId.Entry}-${entry.id}`}
          key={entry.id}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <span className="font-mono text-[11px] tracking-[.12em]">{entry.label}</span>
            <span className="text-[12px] text-ink-2">{entry.description}</span>
          </div>
          <button
            className="cursor-pointer border border-line-2 bg-transparent px-[9px] py-[5px] font-mono text-[10px] tracking-[.12em] text-ink-2 hover:bg-panel-2 hover:text-ink"
            data-testid={`${WidgetCatalogTestId.Add}-${entry.id}`}
            onClick={() => onAdd(entry.id)}
            type="button"
          >
            {addLabel}
          </button>
        </div>
      ))}
      {entries.length === 0 ? (
        <div className="p-[12px] text-[12px] text-ink-2" data-testid={WidgetCatalogTestId.Empty}>
          {emptyText}
        </div>
      ) : null}
    </div>
  );
}
