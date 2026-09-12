import type { SVGProps } from 'react';

export function Logo(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" {...props}>
    <rect width="32" height="32" rx="9" fill="var(--primary, #4fb87a)" />
    <path d="M23 11a9 9 0 1 0 1.5 8M23 5v7h-7" fill="none" stroke="var(--panel, #09231b)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 12c-2 3-4 5-4 7a4 4 0 0 0 8 0c0-2-2-4-4-7Z" fill="var(--panel, #09231b)" />
  </svg>;
}
export function Wordmark() {
  return <><Logo className="brand-icon" /><span className="wordmark-text">Alga<span>Carbon</span></span></>;
}
