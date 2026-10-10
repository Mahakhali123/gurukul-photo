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
    <div className="mx-auto flex max-w-lg flex-col items-center justify-center border border-[#dddddd] bg-white px-6 py-14 text-center sm:py-16">
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[#dddddd] bg-[#eff2f6] text-[#cc0000]">
        <Camera className="h-8 w-8" />
      </span>
      <h3 className="h3-common">{title}</h3>
      <p className="mb-6 mt-2 text-[16px] leading-[28px] text-[#6c757d]">{description}</p>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link href="/photos" className="gk-btn gk-btn-primary">
          <FolderOpen className="h-4 w-4" />
          Browse gallery
        </Link>

        {onReset ? (
          <button onClick={onReset} className="gk-btn gk-btn-outline">
            <RefreshCw className="h-4 w-4" />
            {resetLabel}
          </button>
        ) : (
          <Link href="/albums" className="gk-btn gk-btn-outline">
            View albums
            <ArrowRight className="h-4 w-4" />
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
    <div className="mx-auto flex max-w-md flex-col items-center justify-center border border-[#cc0000]/30 bg-[#eff2f6] px-6 py-14 text-center">
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#cc0000]">
        <ImageOff className="h-8 w-8" />
      </span>
      <h3 className="h3-common">Something went wrong</h3>
      <p className="mb-6 mt-2 text-[16px] leading-[28px] text-[#6c757d]">{message}</p>

      <div className="flex flex-wrap items-center justify-center gap-4">
        {onRetry && (
          <button onClick={onRetry} className="gk-btn gk-btn-primary">
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        )}

        <Link href="/" className="gk-btn gk-btn-outline">
          Go home
        </Link>
      </div>
    </div>
  );
}
