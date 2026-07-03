import React, { useState, useRef, useEffect } from 'react';
import { Button, TextInput } from '@carbon/react';
import { Add, Launch, TrashCan } from '@carbon/icons-react';

export type EvidenceItem = {
  id: string;
  type: 'file' | 'link';
  name: string;
  file?: File;
  previewUrl?: string; // for images
  url?: string; // for link items
  addedAt: string;
};

interface Props {
  investigationId: string;
  items: EvidenceItem[];
  onAddFiles: (files: File[]) => void;
  onAddLink: (url: string) => void;
  onRemove: (id: string) => void;
}

const EvidenceCollection: React.FC<Props> = ({ investigationId, items, onAddFiles, onAddLink, onRemove }) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [linkValue, setLinkValue] = useState('');

  useEffect(() => {
    return () => {
      // cleanup preview urls
      items.forEach((it) => {
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      });
    };
  }, [items]);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files;
    if (!f || f.length === 0) return;
    const arr = Array.from(f);
    onAddFiles(arr);
    // reset input so same file can be reselected
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleAddLink = () => {
    const url = linkValue.trim();
    if (!url) return;
    onAddLink(url);
    setLinkValue('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          ref={fileRef}
          type="file"
          multiple
          onChange={handleFiles}
          style={{ display: 'inline-block' }}
        />
        <TextInput
          id={`evid-link-${investigationId}`}
          labelText=""
          placeholder="Paste external link (https://...)"
          value={linkValue}
          onChange={(e: any) => setLinkValue(e.target.value)}
        />
        <Button size="sm" kind="primary" renderIcon={Add} onClick={handleAddLink}>Add Link</Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.length === 0 && (
          <div style={{ color: 'rgba(200,220,240,0.7)' }}>No evidence added.</div>
        )}

        {items.map((it) => (
          <div key={it.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 6, background: 'rgba(0,0,0,0.12)', borderRadius: 4 }}>
            {it.type === 'file' && it.previewUrl ? (
              <img src={it.previewUrl} alt={it.name} style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 3 }} />
            ) : (
              <div style={{ width: 64, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.06)', borderRadius: 3, color: 'var(--text-muted)' }}>{it.type === 'link' ? 'URL' : 'FILE'}</div>
            )}

            <div style={{ flex: 1, overflow: 'hidden' }}>
              {it.type === 'link' ? (
                <a href={it.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent, #00a3c7)', textDecoration: 'none' }}>{it.url}</a>
              ) : (
                <div style={{ color: 'var(--text-primary, #e0f0ff)' }}>{it.name}</div>
              )}
              <div style={{ fontSize: 12, color: 'rgba(200,220,240,0.6)' }}>{new Date(it.addedAt).toLocaleString()}</div>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              {it.type === 'link' && (
                <Button size="sm" kind="ghost" renderIcon={Launch} onClick={() => window.open(it.url, '_blank')} />
              )}
              <Button size="sm" kind="danger--ghost" renderIcon={TrashCan} onClick={() => onRemove(it.id)}>Remove</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EvidenceCollection;
