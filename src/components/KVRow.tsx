'use client';

import type { Theme } from '@/lib/themes';

type Props = {
  T: Theme;
  k: string;
  v: string;
  masked?: boolean;
};

export default function KVRow({ T, k, v, masked }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1.5fr',
        gap: 8,
        padding: '6px 10px',
        background: T.bgHover,
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: T.accent }}>{k}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: T.text, wordBreak: 'break-all' }}>
        {masked ? v.slice(0, 24) + '…' : v}
      </span>
    </div>
  );
}
