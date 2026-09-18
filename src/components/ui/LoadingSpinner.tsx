import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function LoadingSpinner({ label = 'Loading photos...', size = 'md' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div className="flex flex-col items-center justify-center px-4 py-16">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#fff7ed] ring-1 ring-[#fed7aa]">
        <Loader2 className={`${sizeClasses[size]} animate-spin text-[#ea580c]`} />
      </span>
      {label && <p className="mt-4 animate-pulse text-[14px] font-medium text-[#64748b]">{label}</p>}
    </div>
  );
}

export function PhotoSkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex aspect-[4/3] animate-pulse flex-col justify-end overflow-hidden rounded-[20px] bg-[#f1f5f9] p-3"
        >
          <div className="mb-1.5 h-4 w-3/4 rounded bg-[#e2e8f0]" />
          <div className="h-3 w-1/2 rounded bg-[#e2e8f0]" />
        </div>
      ))}
    </div>
  );
}
