import { useEffect, type PropsWithChildren } from "react";

interface ModalShellProps {
  open: boolean;
  title: string;
  onClose: () => void;
}

export function ModalShell({ open, title, onClose, children }: PropsWithChildren<ModalShellProps>) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-6">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="text-lg font-semibold text-slate-900">{title}</div>
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
            Close
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
