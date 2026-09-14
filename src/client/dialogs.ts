import { useEffect } from "react";

const focusable =
  "button, a[href], input, select, textarea, summary, [tabindex]";
const items = (dialog: HTMLElement) =>
  [...dialog.querySelectorAll<HTMLElement>(focusable)].filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.matches(":disabled") &&
      el.getClientRects().length &&
      getComputedStyle(el).visibility !== "hidden",
  );

// One owner for keyboard focus, including inspection above a catalog and
// automatic card reveals. Only the foremost dialog handles Tab and Escape.
export function useModalNavigation() {
  useEffect(() => {
    let active: HTMLElement | undefined;
    const triggers = new Map<HTMLElement, HTMLElement | null>();
    const layer = (el: HTMLElement) => {
      let z = 0;
      for (let node: HTMLElement | null = el; node; node = node.parentElement)
        z = Math.max(z, Number(getComputedStyle(node).zIndex) || 0);
      return z;
    };
    const focus = (dialog: HTMLElement) => {
      if (!dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
      (items(dialog)[0] ?? dialog).focus({ preventScroll: true });
    };
    const update = () => {
      const dialogs = [
        ...document.querySelectorAll<HTMLElement>(
          '[role="dialog"][aria-modal="true"]',
        ),
      ]
        .filter((el) => el.getClientRects().length)
        .sort((a, b) => layer(a) - layer(b));
      const next = dialogs.at(-1);
      if (next === active) return;
      const previous = active;
      const restore = previous && triggers.get(previous);
      if (next && !triggers.has(next))
        triggers.set(next, document.activeElement as HTMLElement | null);
      active = next;
      if (
        previous &&
        !previous.isConnected &&
        restore?.isConnected &&
        (!next || next.contains(restore))
      )
        restore.focus({ preventScroll: true });
      else if (next) focus(next);
      for (const dialog of triggers.keys())
        if (!dialog.isConnected) triggers.delete(dialog);
    };
    const key = (e: KeyboardEvent) => {
      if (!active) return;
      if (e.key === "Escape") {
        // Dismiss a temporary hover enlargement before closing its dialog.
        if (document.querySelector(".card-zoom")) return;
        const close = active.querySelector<HTMLButtonElement>(
          "[data-dialog-close]",
        );
        if (close) {
          e.preventDefault();
          e.stopImmediatePropagation();
          close.click();
        }
      }
      if (e.key === "Tab") {
        const controls = items(active),
          first = controls[0],
          last = controls.at(-1);
        if (!first) {
          e.preventDefault();
          active.focus();
        } else if (
          !controls.includes(document.activeElement as HTMLElement) ||
          (e.shiftKey && document.activeElement === first) ||
          (!e.shiftKey && document.activeElement === last)
        ) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus();
        }
      }
    };
    const keepFocus = (e: FocusEvent) => {
      if (active?.isConnected && !active.contains(e.target as Node))
        focus(active);
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", key, true);
    document.addEventListener("focusin", keepFocus);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("focusin", keepFocus);
    };
  }, []);
}
