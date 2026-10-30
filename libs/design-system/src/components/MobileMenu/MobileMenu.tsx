"use client";
import { useState } from "react";
import { cn } from "../../utils/cn";
import { focusRingInset } from "../../utils/focus";
import { Button } from "../Button/Button";
import { Icon } from "../Icon/Icon";
import { Sheet } from "../Sheet/Sheet";
import type { SubNavLinkComponent } from "../SubNav/SubNav";

export enum MobileMenuTestId {
  Trigger = "mobile-menu-trigger",
  Tree = "mobile-menu-tree",
  Section = "mobile-menu-section",
  Item = "mobile-menu-item",
}

export interface MobileMenuItem {
  href: string;
  label: string;
  active?: boolean;
}

export interface MobileMenuSection {
  id: string;
  label: string;
  href: string;
  active?: boolean;
  items: MobileMenuItem[];
}

export interface MobileMenuProps {
  sections: MobileMenuSection[];
  /** Overrides the rendered anchor — same contract as `SubNav`. */
  linkComponent?: SubNavLinkComponent;
  /** Trigger `aria-label` and sheet title. */
  label?: string;
  closeLabel?: string;
}

const rowClass = (active: boolean) =>
  cn(
    "flex min-h-11 w-full items-center gap-2 border-l-2 px-3 text-left font-sans text-[14px] font-medium transition-colors",
    focusRingInset,
    active ? "border-ink text-ink" : "border-transparent text-ink-2 hover:bg-hover hover:text-ink",
  );

const activeIds = (sections: MobileMenuSection[]) =>
  new Set(sections.filter((s) => s.active).map((s) => s.id));

/**
 * The phone navigation: a hamburger button opening a left {@link Sheet} with the
 * top-level sections as an expandable tree (each section discloses its sub-pages).
 * The section holding the active page starts expanded; following any link closes
 * the sheet. A section without sub-pages is a plain link.
 */
export function MobileMenu({
  sections,
  linkComponent,
  label = "Menu",
  closeLabel = "Close",
}: MobileMenuProps) {
  const Link = linkComponent ?? "a";
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => activeIds(sections));

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const close = () => setOpen(false);

  return (
    <>
      <Button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        data-testid={MobileMenuTestId.Trigger}
        icon="menu"
        intent="ghost"
        onClick={() => {
          // Re-open on the page the user is on now.
          setExpanded(activeIds(sections));
          setOpen(true);
        }}
        size="sm"
      />
      <Sheet
        closeLabel={closeLabel}
        onClose={close}
        open={open}
        side="left"
        title={label}
        width="sm"
      >
        <ul
          className="-mx-5 -my-5 flex list-none flex-col py-2"
          data-testid={MobileMenuTestId.Tree}
        >
          {sections.map((section) => {
            const isOpen = expanded.has(section.id);
            const panelId = `mobile-menu-${section.id}`;
            return (
              <li data-testid={`${MobileMenuTestId.Section}-${section.id}`} key={section.id}>
                {section.items.length === 0 ? (
                  <Link
                    aria-current={section.active ? "page" : undefined}
                    className={rowClass(Boolean(section.active))}
                    href={section.href}
                    onClick={close}
                  >
                    {section.label}
                  </Link>
                ) : (
                  <>
                    <button
                      aria-controls={panelId}
                      aria-expanded={isOpen}
                      className={cn(rowClass(Boolean(section.active)), "justify-between")}
                      onClick={() => toggle(section.id)}
                      type="button"
                    >
                      <span>{section.label}</span>
                      <span className={cn("transition-transform", isOpen && "rotate-90")}>
                        <Icon name="chevron" size="sm" />
                      </span>
                    </button>
                    {isOpen && (
                      <ul className="flex list-none flex-col pb-1" id={panelId}>
                        {section.items.map((item) => (
                          <li key={item.href}>
                            <Link
                              aria-current={item.active ? "page" : undefined}
                              className={cn(
                                rowClass(Boolean(item.active)),
                                "pl-8 text-[13px] font-normal",
                                item.active && "font-medium",
                              )}
                              data-testid={`${MobileMenuTestId.Item}-${item.href}`}
                              href={item.href}
                              onClick={close}
                            >
                              {item.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}
