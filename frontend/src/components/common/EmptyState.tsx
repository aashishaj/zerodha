import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
}

export function EmptyState({ title, description, icon }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center bg-white p-8 text-center">
      {icon && <div className="mb-3">{icon}</div>}
      <div className="text-[16px] font-medium text-[#444]">{title}</div>
      <div className="mt-1 max-w-sm text-[12px] leading-5 text-[#8a94a4]">{description}</div>
    </div>
  );
}
