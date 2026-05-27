import type { HTMLAttributes } from 'react';

interface TGCardProps extends HTMLAttributes<HTMLDivElement> {}

export function TGCard({ className = '', ...props }: TGCardProps) {
  return (
    <div
      className={`rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#2A2B2D] p-4 ${className}`}
      {...props}
    />
  );
}
