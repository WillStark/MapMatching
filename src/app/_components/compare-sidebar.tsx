"use client";

import type { KeyboardEvent, ReactNode } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type CompareSidebarProps = {
  children: ReactNode;
  id: string;
  mobileOpen: boolean;
  onRequestClose: () => void;
};

export function CompareSidebar({
  children,
  id,
  mobileOpen,
  onRequestClose,
}: CompareSidebarProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!mobileOpen) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onRequestClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter(
      (element) =>
        element.tabIndex >= 0 && element.getAttribute("aria-hidden") !== "true",
    );

    if (focusableElements.length === 0) {
      event.preventDefault();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements.at(-1);
    const activeElement = document.activeElement;
    const focusIsInside = event.currentTarget.contains(activeElement);

    if (event.shiftKey && (!focusIsInside || activeElement === firstElement)) {
      event.preventDefault();
      lastElement?.focus();
      return;
    }

    if (!event.shiftKey && (!focusIsInside || activeElement === lastElement)) {
      event.preventDefault();
      firstElement?.focus();
    }
  }

  return (
    <div
      aria-label={mobileOpen ? "Cities & controls" : undefined}
      aria-modal={mobileOpen ? true : undefined}
      className="v2-sidebar-shell"
      data-open={mobileOpen}
      id={id}
      onKeyDown={handleKeyDown}
      role={mobileOpen ? "dialog" : undefined}
    >
      <aside aria-label="Comparison setup" className="v2-sidebar">
        <div className="v2-sidebar-close-row">
          <button
            autoFocus={mobileOpen}
            className="v2-sidebar-close min-h-11 min-w-11"
            key={mobileOpen ? "open" : "closed"}
            onClick={onRequestClose}
            type="button"
          >
            Close cities &amp; controls
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
