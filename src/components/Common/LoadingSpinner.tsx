import React from 'react';
import { Spinner } from '@heroui/react';

export default function LoadingSpinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8">
      <Spinner size="lg" />
      {label && <p className="text-sm text-muted">{label}</p>}
    </div>
  );
}
