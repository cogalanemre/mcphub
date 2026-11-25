import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, X } from 'lucide-react';
import type { VaultEntry } from '@/types';
import { parseVaultHeaderValue, vaultHeaderValue } from '@/utils/vaultFilters';
import { FORM_CONTROL_CLASS } from './FormPrimitives';

interface VaultHeaderValueProps {
  value: string;
  headerName: string;
  placeholder: string;
  entries: VaultEntry[] | null;
  onChange: (value: string) => void;
}

const VaultHeaderValue: React.FC<VaultHeaderValueProps> = ({
  value,
  headerName,
  placeholder,
  entries,
  onChange,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const parsed = parseVaultHeaderValue(value);

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

  if (parsed) {
    const entry = entries?.find((item) => item.id === parsed.entryId);
    const token = entry?.tokens.find((item) => item.id === parsed.tokenId);
    return (
      <div className="flex-1 min-w-0 flex items-center gap-1">
        <div
          className={`${FORM_CONTROL_CLASS} flex-1 min-w-0 flex items-center gap-1.5`}
          title={value}
        >
          {parsed.prefix.trim() && (
            <span className="hub-mono text-[var(--hub-ink-3)] flex-shrink-0">
              {parsed.prefix.trim()}
            </span>
          )}
          <KeyRound size={13} className="flex-shrink-0 text-[var(--hub-accent)]" />
          {entry && token ? (
            <span className="truncate text-[var(--hub-ink)]">
              {entry.name} / {token.name || t('vault.noTokenName')}
            </span>
          ) : (
            <span
              className="truncate"
              style={{ color: entries ? 'var(--hub-warn)' : 'var(--hub-ink-2)' }}
            >
              {entries ? t('vault.referenceMissing') : t('vault.reference')}
            </span>
          )}
          {parsed.suffix.trim() && (
            <span className="hub-mono truncate text-[var(--hub-ink-3)]">
              {parsed.suffix.trim()}
            </span>
          )}
        </div>
        <button
          type="button"
          className="hub-icon-btn sm flex-shrink-0"
          onClick={() => onChange('')}
          aria-label={t('vault.removeReference')}
          title={t('vault.removeReference')}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  const withTokens = (entries ?? []).filter((entry) => entry.tokens.length > 0);
  return (
    <div ref={container} className="relative flex-1 min-w-0 flex items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${FORM_CONTROL_CLASS} flex-1 min-w-0`}
        placeholder={placeholder}
      />
      {entries && (
        <button
          type="button"
          className="hub-icon-btn sm flex-shrink-0"
          onClick={() => setOpen((current) => !current)}
          aria-label={t('vault.pickFromVault')}
          aria-expanded={open}
          title={t('vault.pickFromVault')}
        >
          <KeyRound size={14} />
        </button>
      )}
      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-1 w-72 max-h-64 overflow-y-auto rounded-md py-1"
          style={{
            background: 'var(--hub-surface)',
            border: '1px solid var(--hub-line)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
          }}
        >
          {withTokens.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[var(--hub-ink-3)]">{t('vault.pickerEmpty')}</p>
          ) : (
            withTokens.map((entry) => (
              <div key={entry.id} className="py-0.5">
                <div className="px-3 pt-1.5 pb-0.5 text-[11px] font-medium truncate text-[var(--hub-ink-3)]">
                  {entry.name}
                </div>
                {entry.tokens.map((token) => (
                  <button
                    key={token.id}
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-[var(--hub-ink)] hover:bg-[var(--hub-surface-hover)]"
                    onClick={() => {
                      onChange(vaultHeaderValue(headerName, entry.id, token.id));
                      setOpen(false);
                    }}
                  >
                    <KeyRound size={12} className="flex-shrink-0 text-[var(--hub-ink-3)]" />
                    <span className="truncate">{token.name || t('vault.noTokenName')}</span>
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

export default VaultHeaderValue;
