import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import clsx from "clsx";

export function IconButton({
  className,
  children,
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return (
    <button
      className={clsx(
        "inline-flex h-7 w-7 items-center justify-center rounded-sm border border-transparent bg-white text-[#6b7280] transition hover:bg-[#f7f8fa]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
