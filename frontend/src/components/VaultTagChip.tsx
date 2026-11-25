import React from 'react';
import { vaultTagColor } from '@/utils/vaultFilters';

interface VaultTagChipProps {
  tag: string;
  count?: number;
  selected?: boolean;
  dimmed?: boolean;
  size?: 'sm' | 'md';
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

const VaultTagChip: React.FC<VaultTagChipProps> = ({
  tag,
  count,
  selected,
  dimmed,
  size = 'sm',
  onClick,
}) => {
  const tint = vaultTagColor(tag);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="hub-tag hub-num uppercase gap-1.5 flex-shrink-0 transition-opacity"
      style={{
        fontFamily: 'inherit',
        fontSize: size === 'md' ? 11.5 : 11,
        fontWeight: 500,
        letterSpacing: '0.04em',
        lineHeight: 1,
        padding: size === 'md' ? '4px 9px' : '3px 8px',
        color: tint,
        borderColor: tint,
        background: selected ? `color-mix(in oklch, ${tint} 18%, transparent)` : undefined,
        opacity: dimmed ? 0.55 : 1,
      }}
    >
      {tag}
      {count !== undefined && <span style={{ opacity: 0.75 }}>{count}</span>}
    </button>
  );
};

export default VaultTagChip;
