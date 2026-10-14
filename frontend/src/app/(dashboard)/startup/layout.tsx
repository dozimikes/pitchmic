import * as React from 'react';

export default function StartupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {children}
    </div>
  );
}
