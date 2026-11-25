import React, { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Plus, Trash2, X } from 'lucide-react';
import type { VaultEntry, VaultEntryInput } from '@/types';
import TagInput from './ui/TagInput';
import {
  FieldLabel,
  FORM_CONTROL_CLASS,
  FORM_TEXTAREA_CLASS,
  PasswordInput,
  SectionCard,
} from './server-form/FormPrimitives';
import { resizeImageToDataUrl } from '@/utils/vaultFilters';
import { createVaultEntry, updateVaultEntry } from '@/services/vaultService';
import VaultAvatar from './VaultAvatar';

interface AccountRow {
  key: string;
  id?: string;
  username: string;
  password: string;
  hasPassword: boolean;
}

interface TokenRow {
  key: string;
  id?: string;
  name: string;
  token: string;
  stored: boolean;
}

interface VaultEntryFormProps {
  entry?: VaultEntry | null;
  defaultTags?: string[];
  tagSuggestions: string[];
  onSaved: (entry: VaultEntry) => void;
  onCancel: () => void;
}

let rowCounter = 0;
const nextRowKey = () => `row-${++rowCounter}`;

const emptyRow = (): AccountRow => ({
  key: nextRowKey(),
  username: '',
  password: '',
  hasPassword: false,
});

const emptyTokenRow = (): TokenRow => ({
  key: nextRowKey(),
  name: '',
  token: '',
  stored: false,
});

const VaultEntryForm: React.FC<VaultEntryFormProps> = ({
  entry,
  defaultTags,
  tagSuggestions,
  onSaved,
  onCancel,
}) => {
  const { t } = useTranslation();
  const titleId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const isEdit = Boolean(entry);

  const [name, setName] = useState(entry?.name ?? '');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [tags, setTags] = useState<string[]>(entry?.tags ?? defaultTags ?? []);
  const [url, setUrl] = useState(entry?.url ?? '');
  const [host, setHost] = useState(entry?.host ?? '');
  const [port, setPort] = useState(entry?.port ? String(entry.port) : '');
  const [image, setImage] = useState<string | null>(entry?.image ?? null);
  const [accounts, setAccounts] = useState<AccountRow[]>(() =>
    entry?.accounts.length
      ? entry.accounts.map((account) => ({
          key: nextRowKey(),
          id: account.id,
          username: account.username,
          password: '',
          hasPassword: account.hasPassword,
        }))
      : [emptyRow()],
  );
  const [tokens, setTokens] = useState<TokenRow[]>(() =>
    entry?.tokens.length
      ? entry.tokens.map((token) => ({
          key: nextRowKey(),
          id: token.id,
          name: token.name,
          token: '',
          stored: true,
        }))
      : [emptyTokenRow()],
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateAccount = (key: string, patch: Partial<AccountRow>) =>
    setAccounts((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const updateToken = (key: string, patch: Partial<TokenRow>) =>
    setTokens((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const handleImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setImage(await resizeImageToDataUrl(file));
      setError(null);
    } catch {
      setError(t('vault.imageError'));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (!name.trim()) {
      setError(t('vault.nameRequired'));
      return;
    }
    if (tokens.some((row) => !row.stored && row.name.trim() && !row.token)) {
      setError(t('vault.tokenValueRequired'));
      return;
    }
    const payload: VaultEntryInput = {
      name: name.trim(),
      description,
      tags,
      url,
      host,
      port,
      image,
      accounts: accounts.map(({ id, username, password }) => ({
        id,
        username,
        password: password || undefined,
      })),
      tokens: tokens.map(({ id, name, token }) => ({ id, name, token: token || undefined })),
    };

    setIsSubmitting(true);
    setError(null);
    try {
      const saved = entry
        ? await updateVaultEntry(entry.id, payload)
        : await createVaultEntry(payload);
      onSaved(saved);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('vault.saveError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="hub-server-modal"
        style={{ maxWidth: '44rem' }}
      >
        <div
          className="flex items-center justify-between gap-3 px-5 py-3.5 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--hub-line)', background: 'var(--hub-surface)' }}
        >
          <h2 id={titleId} className="text-[15px] font-semibold text-[var(--hub-ink)] truncate">
            {isEdit ? t('vault.editTitle', { name: entry?.name }) : t('vault.addTitle')}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="hub-icon-btn sm flex-shrink-0"
            aria-label={t('app.closeButton')}
          >
            <X size={15} />
          </button>
        </div>

        <form
          id={`${titleId}-form`}
          noValidate
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4"
          style={{ background: 'var(--hub-bg-2)' }}
        >
          {error && (
            <div
              role="alert"
              className="rounded-md px-3 py-2 text-[13px]"
              style={{
                border: '1px solid oklch(0.85 0.1 25)',
                background: 'oklch(0.97 0.03 25)',
                color: 'oklch(0.4 0.18 25)',
              }}
            >
              {error}
            </div>
          )}

          <SectionCard title={t('vault.sectionGeneral')}>
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center gap-2 flex-shrink-0">
                <VaultAvatar name={name || '?'} image={image} size={64} />
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="hub-icon-btn sm"
                    onClick={() => fileInput.current?.click()}
                    aria-label={t('vault.uploadImage')}
                    title={t('vault.uploadImage')}
                  >
                    <ImagePlus size={13} />
                  </button>
                  {image && (
                    <button
                      type="button"
                      className="hub-icon-btn sm"
                      onClick={() => setImage(null)}
                      aria-label={t('vault.removeImage')}
                      title={t('vault.removeImage')}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handleImage}
                />
              </div>
              <div className="flex-1 min-w-0 grid gap-3 md:grid-cols-3">
                <div className="md:col-span-3">
                  <FieldLabel htmlFor="vault-name" required>
                    {t('vault.name')}
                  </FieldLabel>
                  <input
                    id="vault-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={128}
                    placeholder={t('vault.namePlaceholder')}
                    className={FORM_CONTROL_CLASS}
                    autoFocus
                  />
                </div>
                <div className="md:col-span-3">
                  <FieldLabel htmlFor="vault-description">{t('vault.description')}</FieldLabel>
                  <textarea
                    id="vault-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={2000}
                    rows={2}
                    className={FORM_TEXTAREA_CLASS}
                  />
                </div>
                <div className="md:col-span-3">
                  <FieldLabel htmlFor="vault-tags">{t('vault.tags')}</FieldLabel>
                  <TagInput
                    id="vault-tags"
                    value={tags}
                    onChange={setTags}
                    suggestions={tagSuggestions}
                    placeholder={t('vault.tagsPlaceholder')}
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title={t('vault.sectionConnection')}>
            <div className="grid gap-3 md:grid-cols-6">
              <div className="md:col-span-6">
                <FieldLabel htmlFor="vault-url">{t('vault.url')}</FieldLabel>
                <input
                  id="vault-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="mongodb://db.example.com:27017"
                  className={FORM_CONTROL_CLASS}
                />
              </div>
              <div className="md:col-span-4">
                <FieldLabel htmlFor="vault-host">{t('vault.host')}</FieldLabel>
                <input
                  id="vault-host"
                  value={host}
                  onChange={(event) => setHost(event.target.value)}
                  placeholder="10.0.0.12"
                  className={FORM_CONTROL_CLASS}
                />
              </div>
              <div className="md:col-span-2">
                <FieldLabel htmlFor="vault-port">{t('vault.port')}</FieldLabel>
                <input
                  id="vault-port"
                  value={port}
                  onChange={(event) => setPort(event.target.value.replace(/[^0-9]/g, ''))}
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="27017"
                  className={FORM_CONTROL_CLASS}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title={t('vault.sectionAccounts')}
            description={t('vault.accountsHint')}
            action={
              <button
                type="button"
                className="hub-btn sm"
                onClick={() => setAccounts((rows) => [...rows, emptyRow()])}
              >
                <Plus size={12} /> {t('vault.addAccount')}
              </button>
            }
          >
            {accounts.length === 0 ? (
              <p className="text-xs text-[var(--hub-ink-3)]">{t('vault.noAccounts')}</p>
            ) : (
              <div className="space-y-2">
                {accounts.map((row, index) => (
                  <div key={row.key} className="flex items-center gap-2">
                    <input
                      value={row.username}
                      onChange={(event) => updateAccount(row.key, { username: event.target.value })}
                      placeholder={t('vault.username')}
                      aria-label={`${t('vault.username')} ${index + 1}`}
                      autoComplete="off"
                      className={`${FORM_CONTROL_CLASS} flex-1`}
                    />
                    <PasswordInput
                      value={row.password}
                      onChange={(event) => updateAccount(row.key, { password: event.target.value })}
                      placeholder={
                        row.hasPassword ? t('vault.passwordStored') : t('vault.password')
                      }
                      aria-label={`${t('vault.password')} ${index + 1}`}
                      autoComplete="new-password"
                      className="flex-1"
                    />
                    <button
                      type="button"
                      className="hub-icon-btn sm flex-shrink-0"
                      onClick={() =>
                        setAccounts((rows) => rows.filter((item) => item.key !== row.key))
                      }
                      aria-label={t('vault.removeAccount')}
                      title={t('vault.removeAccount')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title={t('vault.sectionTokens')}
            description={t('vault.tokensHint')}
            action={
              <button
                type="button"
                className="hub-btn sm"
                onClick={() => setTokens((rows) => [...rows, emptyTokenRow()])}
              >
                <Plus size={12} /> {t('vault.addToken')}
              </button>
            }
          >
            {tokens.length === 0 ? (
              <p className="text-xs text-[var(--hub-ink-3)]">{t('vault.noTokens')}</p>
            ) : (
              <div className="space-y-2">
                {tokens.map((row, index) => (
                  <div key={row.key} className="flex items-center gap-2">
                    <input
                      value={row.name}
                      onChange={(event) => updateToken(row.key, { name: event.target.value })}
                      placeholder={t('vault.tokenName')}
                      aria-label={`${t('vault.tokenName')} ${index + 1}`}
                      maxLength={128}
                      autoComplete="off"
                      className={`${FORM_CONTROL_CLASS} flex-1`}
                    />
                    <PasswordInput
                      value={row.token}
                      onChange={(event) => updateToken(row.key, { token: event.target.value })}
                      placeholder={
                        row.stored ? t('vault.tokenStored') : t('vault.tokenPlaceholder')
                      }
                      aria-label={`${t('vault.bearerToken')} ${index + 1}`}
                      autoComplete="off"
                      className="flex-1"
                    />
                    <button
                      type="button"
                      className="hub-icon-btn sm flex-shrink-0"
                      onClick={() =>
                        setTokens((rows) => rows.filter((item) => item.key !== row.key))
                      }
                      aria-label={t('vault.removeToken')}
                      title={t('vault.removeToken')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </form>

        <div
          className="flex items-center justify-end gap-2 px-5 py-3 flex-shrink-0"
          style={{ borderTop: '1px solid var(--hub-line)', background: 'var(--hub-surface)' }}
        >
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="hub-btn">
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form={`${titleId}-form`}
            disabled={isSubmitting}
            className={`hub-btn primary ${isSubmitting ? 'is-loading' : ''}`}
          >
            {isSubmitting ? t('vault.saving') : t('vault.save')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VaultEntryForm;
