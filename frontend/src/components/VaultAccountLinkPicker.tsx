import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import type { VaultAccount, VaultEntry } from '@/types';

interface VaultAccountLinkPickerProps {
  entries: VaultEntry[];
  excludeEntryId?: string;
  onPick: (entry: VaultEntry, account: VaultAccount) => void;
}

const VaultAccountLinkPicker: React.FC<VaultAccountLinkPickerProps> = ({
  entries,
  excludeEntryId,
  onPick,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const sources = entries
    .filter((entry) => entry.id !== excludeEntryId)
    .map((entry) => ({ entry, accounts: entry.accounts.filter((account) => !account.link) }))
    .filter(({ accounts }) => accounts.length > 0);

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        className="hub-btn sm"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <Link2 size={12} /> {t('vault.linkAccount')}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-1 w-72 max-h-64 overflow-y-auto rounded-md py-1"
          style={{
            background: 'var(--hub-surface)',
            border: '1px solid var(--hub-line)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
          }}
        >
          {sources.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[var(--hub-ink-3)]">
              {t('vault.linkPickerEmpty')}
            </p>
          ) : (
            sources.map(({ entry, accounts }) => (
              <div key={entry.id} className="py-0.5">
                <div className="px-3 pt-1.5 pb-0.5 text-[11px] font-medium truncate text-[var(--hub-ink-3)]">
                  {entry.name}
                </div>
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-[var(--hub-ink)] hover:bg-[var(--hub-surface-hover)]"
                    onClick={() => {
                      onPick(entry, account);
                      setOpen(false);
                    }}
                  >
                    <Link2 size={12} className="flex-shrink-0 text-[var(--hub-ink-3)]" />
                    <span className="truncate">{account.username || t('vault.noUsername')}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default VaultAccountLinkPicker;
