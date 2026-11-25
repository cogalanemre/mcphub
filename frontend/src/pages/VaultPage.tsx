import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Plus, RefreshCw, Search, X } from 'lucide-react';
import type { VaultEntry } from '@/types';
import VaultEntryCard from '@/components/VaultEntryCard';
import VaultEntryForm from '@/components/VaultEntryForm';
import VaultTagChip from '@/components/VaultTagChip';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/contexts/ToastContext';
import { deleteVaultEntry, listVaultEntries, setVaultEntryStarred } from '@/services/vaultService';
import {
  filterVaultEntries,
  getVaultTagOptions,
  sortVaultEntries,
  vaultTagKey,
} from '@/utils/vaultFilters';

const VaultPage: React.FC = () => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [revision, setRevision] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<VaultEntry | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deleting, setDeleting] = useState<VaultEntry | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const tagParams = searchParams.getAll('tag').join('\n');
  const selectedTags = useMemo(
    () => Array.from(new Set(tagParams.split('\n').map(vaultTagKey).filter(Boolean))),
    [tagParams],
  );

  const setSelectedTags = useCallback(
    (tags: string[]) =>
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.delete('tag');
          for (const value of tags) next.append('tag', value);
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  const toggleTag = (value: string) =>
    setSelectedTags(
      selectedTags.includes(value)
        ? selectedTags.filter((item) => item !== value)
        : [...selectedTags, value],
    );

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setEntries(await listVaultEntries());
      setRevision((value) => value + 1);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('vault.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const tagOptions = useMemo(() => getVaultTagOptions(entries), [entries]);
  const tagRank = useMemo(
    () => new Map(tagOptions.map((option, index) => [option.value, index])),
    [tagOptions],
  );
  const tagChips = useMemo(
    () => [
      ...tagOptions,
      ...selectedTags
        .filter((value) => !tagOptions.some((option) => option.value === value))
        .map((value) => ({ value, label: value, count: 0 })),
    ],
    [tagOptions, selectedTags],
  );
  const visible = useMemo(
    () => sortVaultEntries(filterVaultEntries(entries, { tags: selectedTags, search })),
    [entries, selectedTags, search],
  );

  const handleSaved = (saved: VaultEntry) => {
    setEntries((current) => [...current.filter((entry) => entry.id !== saved.id), saved]);
    void load();
    showToast(t(editing ? 'vault.updated' : 'vault.created'), 'success');
    setEditing(null);
    setIsAdding(false);
  };

  const handleToggleStar = async (target: VaultEntry) => {
    const starred = !target.starred;
    const apply = (value: boolean) =>
      setEntries((current) =>
        current.map((entry) => (entry.id === target.id ? { ...entry, starred: value } : entry)),
      );
    apply(starred);
    try {
      await setVaultEntryStarred(target.id, starred);
    } catch (starError) {
      apply(!starred);
      showToast(starError instanceof Error ? starError.message : t('vault.starError'), 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    try {
      await deleteVaultEntry(target.id);
      setEntries((current) => current.filter((entry) => entry.id !== target.id));
      showToast(t('vault.deleted'), 'success');
    } catch (deleteError) {
      showToast(
        deleteError instanceof Error ? deleteError.message : t('vault.deleteError'),
        'error',
      );
    }
  };

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="hub-h1">{t('vault.title')}</h1>
          <p className="hub-sub">{t('vault.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            className="hub-btn"
            onClick={load}
            disabled={isLoading}
            aria-label={t('common.refresh')}
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            {t('common.refresh')}
          </button>
          <button className="hub-btn primary" onClick={() => setIsAdding(true)}>
            <Plus size={13} /> {t('vault.add')}
          </button>
        </div>
      </div>

      {tagChips.length > 0 && (
        <div
          role="group"
          aria-label={t('vault.tags')}
          className="flex flex-wrap items-center gap-2 mb-4"
        >
          {tagChips.map(({ value, label, count }) => {
            const selected = selectedTags.includes(value);
            return (
              <VaultTagChip
                key={value}
                tag={label}
                count={count}
                size="md"
                selected={selected}
                dimmed={selectedTags.length > 0 && !selected}
                onClick={() => toggleTag(value)}
              />
            );
          })}
        </div>
      )}

      {error && (
        <div
          className="hub-card flex items-center justify-between gap-3 mb-4"
          style={{
            padding: '10px 14px',
            borderColor: 'oklch(0.85 0.1 25)',
            background: 'oklch(0.97 0.03 25)',
            color: 'oklch(0.4 0.18 25)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle size={14} className="flex-shrink-0" />
            <span className="truncate text-[13px]">{error}</span>
          </div>
          <button
            className="hub-icon-btn sm"
            onClick={() => setError(null)}
            aria-label={t('app.closeButton')}
          >
            <X size={13} />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div
          className="hub-card flex items-center gap-2 px-2.5 flex-1"
          style={{ height: 30, background: 'var(--hub-surface)', maxWidth: 360 }}
        >
          <Search size={13} style={{ color: 'var(--hub-ink-3)' }} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="flex-1 bg-transparent outline-none text-[13px]"
            style={{ color: 'var(--hub-ink)' }}
            placeholder={t('vault.searchPlaceholder')}
            aria-label={t('vault.searchPlaceholder')}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="hub-icon-btn sm"
              aria-label={t('app.closeButton')}
            >
              <X size={11} />
            </button>
          )}
        </div>

        <div className="ml-auto hub-mono text-[12px]" style={{ color: 'var(--hub-ink-3)' }}>
          {visible.length}/{entries.length}
        </div>
      </div>

      {isLoading && entries.length === 0 ? (
        <div className="hub-card p-6 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <RefreshCw size={20} className="animate-spin" style={{ color: 'var(--hub-ink-3)' }} />
            <p style={{ color: 'var(--hub-ink-3)' }}>{t('app.loading')}</p>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="hub-card p-10 text-center" style={{ color: 'var(--hub-ink-3)' }}>
          <p>{entries.length === 0 ? t('vault.empty') : t('vault.noMatches')}</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {visible.map((entry) => (
            <VaultEntryCard
              key={entry.id}
              entry={entry}
              onEdit={setEditing}
              onDelete={setDeleting}
              onToggleStar={handleToggleStar}
              tagRank={tagRank}
              revision={revision}
              onTagClick={(value) => {
                const key = vaultTagKey(value);
                if (!selectedTags.includes(key)) setSelectedTags([...selectedTags, key]);
              }}
            />
          ))}
        </div>
      )}

      {(isAdding || editing) && (
        <VaultEntryForm
          key={editing?.id ?? 'new'}
          entry={editing}
          defaultTags={selectedTags.map(
            (value) => tagOptions.find((option) => option.value === value)?.label ?? value,
          )}
          tagSuggestions={tagOptions.map((option) => option.label)}
          linkableEntries={entries}
          onSaved={handleSaved}
          onCancel={() => {
            setEditing(null);
            setIsAdding(false);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={t('vault.confirmDeleteTitle')}
        message={t('vault.confirmDelete', { name: deleting?.name ?? '' })}
        confirmText={t('vault.delete')}
        variant="danger"
      />
    </div>
  );
};

export default VaultPage;
