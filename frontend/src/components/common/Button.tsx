import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import clsx from "clsx";

export function Button({
  className,
  children,
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
