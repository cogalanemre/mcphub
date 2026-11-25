import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, Copy, Edit, Eye, EyeOff, Star, Trash2 } from 'lucide-react';
import type { VaultEntry, VaultSecrets } from '@/types';
import { revealVaultSecrets } from '@/services/vaultService';
import { copyText } from '@/utils/clipboard';
import { rankVaultTags, vaultEndpoint } from '@/utils/vaultFilters';
import VaultAvatar from './VaultAvatar';
import VaultTagChip from './VaultTagChip';

const MASK = '••••••••••';

type SecretKind = 'password' | 'token';

interface CopyButtonProps {
  value: string | (() => Promise<string | undefined>);
  label: string;
}

const CopyButton: React.FC<CopyButtonProps> = ({ value, label }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    const text = typeof value === 'string' ? value : await value();
    if (text && (await copyText(text))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <button
      type="button"
      className="hub-icon-btn sm"
      onClick={handleCopy}
      aria-label={label}
      title={label}
    >
      {copied ? <Check size={12} className="text-[var(--hub-ok)]" /> : <Copy size={12} />}
    </button>
  );
};

interface DetailRowProps {
  label: string;
  children: React.ReactNode;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, children }) => (
  <div className="grid grid-cols-[120px_1fr] items-center gap-3 py-1.5">
    <span className="text-[12px] text-[var(--hub-ink-3)]">{label}</span>
    <div className="flex items-center gap-2 min-w-0">{children}</div>
  </div>
);

interface VaultEntryCardProps {
  entry: VaultEntry;
  onEdit: (entry: VaultEntry) => void;
  onDelete: (entry: VaultEntry) => void;
  onToggleStar: (entry: VaultEntry) => void;
  onTagClick: (tag: string) => void;
  tagRank: ReadonlyMap<string, number>;
}

const VaultEntryCard: React.FC<VaultEntryCardProps> = ({
  entry,
  onEdit,
  onDelete,
  onToggleStar,
  onTagClick,
  tagRank,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [secrets, setSecrets] = useState<VaultSecrets | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [revealError, setRevealError] = useState<string | null>(null);
  const endpoint = vaultEndpoint(entry);
  const counts = [
    entry.accounts.length > 0 && t('vault.accountCount', { count: entry.accounts.length }),
    entry.tokens.length > 0 && t('vault.tokenCount', { count: entry.tokens.length }),
  ].filter(Boolean);

  const loadSecrets = async (): Promise<VaultSecrets | null> => {
    if (secrets) return secrets;
    try {
      const loaded = await revealVaultSecrets(entry.id);
      setSecrets(loaded);
      setRevealError(null);
      return loaded;
    } catch (error) {
      setRevealError(error instanceof Error ? error.message : t('vault.revealError'));
      return null;
    }
  };

  const toggleVisible = async (key: string) => {
    if (!visible[key] && !(await loadSecrets())) return;
    setVisible((current) => ({ ...current, [key]: !current[key] }));
  };

  const pickSecret = (
    source: VaultSecrets | null,
    kind: SecretKind,
    id: string,
  ): string | undefined => (kind === 'token' ? source?.tokens[id] : source?.passwords[id]);

  const renderSecret = (kind: SecretKind, id: string, label: string) => {
    const key = `${kind}:${id}`;
    return (
      <>
        <span className="hub-mono text-[12.5px] truncate text-[var(--hub-ink)]">
          {visible[key] ? (pickSecret(secrets, kind, id) ?? '') : MASK}
        </span>
        <button
          type="button"
          className="hub-icon-btn sm"
          onClick={() => toggleVisible(key)}
          aria-label={visible[key] ? t('vault.hide', { label }) : t('vault.show', { label })}
          title={visible[key] ? t('vault.hide', { label }) : t('vault.show', { label })}
        >
          {visible[key] ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
        <CopyButton
          label={t('vault.copy', { label })}
          value={async () => pickSecret(await loadSecrets(), kind, id)}
        />
      </>
    );
  };

  return (
    <div className="hub-card overflow-visible" style={{ marginBottom: 10 }}>
      <div
        className="flex items-center gap-3 cursor-pointer px-4 py-3 transition-colors hover:bg-[var(--hub-surface-hover)]"
        onClick={() => setExpanded((value) => !value)}
      >
        <ChevronRight
          size={12}
          style={{
            color: 'var(--hub-ink-3)',
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s',
            flexShrink: 0,
          }}
        />
        <VaultAvatar name={entry.name} image={entry.image} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className="hub-mono truncate text-[13.5px] text-[var(--hub-ink)]"
              title={entry.name}
            >
              {entry.name}
            </span>
            {endpoint && (
              <span className="hub-mono text-[11.5px] text-[var(--hub-ink-3)] truncate">
                {endpoint}
              </span>
            )}
          </div>
          {entry.description && (
            <div
              className="text-[11.5px] truncate text-[var(--hub-ink-3)]"
              style={{ marginTop: 1 }}
              title={entry.description}
            >
              {entry.description}
            </div>
          )}
          {entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5" style={{ marginTop: 4 }}>
              {rankVaultTags(entry.tags, tagRank).map((tag) => (
                <VaultTagChip
                  key={tag}
                  tag={tag}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTagClick(tag);
                  }}
                />
              ))}
            </div>
          )}
        </div>
        {counts.length > 0 && (
          <span className="hidden sm:inline hub-mono text-[11px] text-[var(--hub-ink-3)] flex-shrink-0">
            {counts.join(' · ')}
          </span>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            className="hub-icon-btn sm"
            onClick={(event) => {
              event.stopPropagation();
              onToggleStar(entry);
            }}
            aria-pressed={entry.starred}
            aria-label={entry.starred ? t('vault.unstar') : t('vault.star')}
            title={entry.starred ? t('vault.unstar') : t('vault.star')}
            style={entry.starred ? { color: 'var(--hub-warn)' } : undefined}
          >
            <Star size={13} fill={entry.starred ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            className="hub-icon-btn sm"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(entry);
            }}
            aria-label={t('vault.edit')}
            title={t('vault.edit')}
          >
            <Edit size={13} />
          </button>
          <button
            type="button"
            className="hub-icon-btn sm"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(entry);
            }}
            aria-label={t('vault.delete')}
            title={t('vault.delete')}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {expanded && (
        <div
          className="px-4 pb-3 pt-1"
          style={{ borderTop: '1px solid var(--hub-line-2)', paddingLeft: 62 }}
        >
          {revealError && (
            <p className="text-[12px] py-1.5" style={{ color: 'var(--hub-err)' }}>
              {revealError}
            </p>
          )}
          {entry.url && (
            <DetailRow label={t('vault.url')}>
              <span
                className="hub-mono text-[12.5px] truncate text-[var(--hub-ink)]"
                title={entry.url}
              >
                {entry.url}
              </span>
              <CopyButton value={entry.url} label={t('vault.copy', { label: t('vault.url') })} />
            </DetailRow>
          )}
          {entry.host && (
            <DetailRow label={t('vault.host')}>
              <span className="hub-mono text-[12.5px] truncate text-[var(--hub-ink)]">
                {entry.host}
              </span>
              <CopyButton value={entry.host} label={t('vault.copy', { label: t('vault.host') })} />
            </DetailRow>
          )}
          {entry.port && (
            <DetailRow label={t('vault.port')}>
              <span className="hub-mono text-[12.5px] text-[var(--hub-ink)]">{entry.port}</span>
              <CopyButton
                value={String(entry.port)}
                label={t('vault.copy', { label: t('vault.port') })}
              />
            </DetailRow>
          )}
          {entry.accounts.map((account, index) => (
            <DetailRow key={account.id} label={index === 0 ? t('vault.sectionAccounts') : ''}>
              {account.username ? (
                <>
                  <span className="hub-mono text-[12.5px] truncate text-[var(--hub-ink)]">
                    {account.username}
                  </span>
                  <CopyButton
                    value={account.username}
                    label={t('vault.copy', { label: t('vault.username') })}
                  />
                </>
              ) : (
                <span className="text-[12px] italic text-[var(--hub-ink-3)]">
                  {t('vault.noUsername')}
                </span>
              )}
              <span className="text-[var(--hub-ink-3)]" aria-hidden="true">
                ·
              </span>
              {account.hasPassword ? (
                renderSecret('password', account.id, t('vault.password'))
              ) : (
                <span className="text-[12px] text-[var(--hub-ink-3)]">{t('vault.noPassword')}</span>
              )}
            </DetailRow>
          ))}
          {entry.tokens.map((token, index) => (
            <DetailRow key={token.id} label={index === 0 ? t('vault.sectionTokens') : ''}>
              {token.name ? (
                <span className="hub-mono text-[12.5px] truncate text-[var(--hub-ink)]">
                  {token.name}
                </span>
              ) : (
                <span className="text-[12px] italic text-[var(--hub-ink-3)]">
                  {t('vault.noTokenName')}
                </span>
              )}
              <span className="text-[var(--hub-ink-3)]" aria-hidden="true">
                ·
              </span>
              {renderSecret('token', token.id, token.name || t('vault.bearerToken'))}
            </DetailRow>
          ))}
          {!entry.url &&
            !entry.host &&
            !entry.port &&
            entry.accounts.length === 0 &&
            entry.tokens.length === 0 && (
              <p className="text-[12px] py-1.5 text-[var(--hub-ink-3)]">
                {t('vault.emptyDetails')}
              </p>
            )}
        </div>
      )}
    </div>
  );
};

export default VaultEntryCard;
