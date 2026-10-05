import { useEffect, useRef, type HTMLAttributes } from "react";

export function Dialog({ children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = ref.current;
    if (!dialog) return;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ),
      ).filter((el) => el.getClientRects().length > 0);
    (focusable()[0] || dialog).focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const items = focusable(),
          first = items[0],
          last = items.at(-1);
        if (!first) {
          event.preventDefault();
          dialog.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialog)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      if (event.key === "Escape") {
        const close = dialog.querySelector<HTMLButtonElement>(
          "button[data-dialog-close]",
        );
        if (close && !close.disabled) {
          event.preventDefault();
          event.stopPropagation();
          close.click();
        }
      }
    };
    dialog.addEventListener("keydown", handler);
    return () => {
      dialog.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      {...props}
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={props["aria-label"] || "Janela de atendimento"}
      tabIndex={-1}
    >
      {children}
    </div>
  );
}
