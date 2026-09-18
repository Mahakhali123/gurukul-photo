import React from 'react';
import Link from 'next/link';
import { ImageOff, RefreshCw, FolderOpen, ArrowRight, Camera } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  onReset?: () => void;
  resetLabel?: string;
}

export function EmptyState({
  title = 'No photos found.',
  description = 'Try a different search or filter — new photos are added regularly.',
  onReset,
  resetLabel = 'Clear filters',
}: EmptyStateProps) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center justify-center rounded-[24px] border border-[#e6eaf1] bg-white px-6 py-14 text-center shadow-sm sm:py-16">
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#fff7ed] text-[#ea580c] ring-1 ring-[#fed7aa]">
        <Camera className="h-8 w-8" />
      </span>
      <h3 className="text-[22px] font-extrabold text-[#16294d]">{title}</h3>
      <p className="mb-6 mt-2 text-[14px] leading-relaxed text-[#64748b]">
        {description}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/photos"
          className="btn-saffron !min-h-[46px] !px-6 !py-2.5 !text-[14px]"
        >
          <FolderOpen className="mr-2 h-4 w-4" />
          <span>Browse gallery</span>
        </Link>

        {onReset ? (
          <button
            onClick={onReset}
            className="btn-outline !min-h-[46px] !px-5 !py-2.5 !text-[14px]"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            <span>{resetLabel}</span>
          </button>
        ) : (
          <Link
            href="/albums"
            className="btn-outline !min-h-[46px] !px-5 !py-2.5 !text-[14px]"
          >
            <span>View albums</span>
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

export function ErrorMessage({
  message = 'Unable to load photos. Please try again.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-[24px] border border-[#fecaca] bg-[#fff5f5] px-6 py-14 text-center">
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-[#dc2626] shadow-sm">
        <ImageOff className="h-8 w-8" />
      </span>
      <h3 className="text-[20px] font-extrabold text-[#16294d]">Something went wrong</h3>
      <p className="mb-6 mt-2 text-[14px] leading-relaxed text-[#64748b]">{message}</p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {onRetry && (
          <button
            onClick={onRetry}
            className="btn-saffron !min-h-[46px] !px-6 !py-2.5 !text-[14px]"
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            <span>Try again</span>
          </button>
        )}

        <Link
          href="/"
          className="btn-outline !min-h-[46px] !px-5 !py-2.5 !text-[14px]"
        >
          <span>Go home</span>
        </Link>
      </div>
    </div>
  );
}
