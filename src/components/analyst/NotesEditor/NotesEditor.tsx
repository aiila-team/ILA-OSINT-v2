import React, { useState, useEffect } from 'react';
import { Button, TextArea } from '@carbon/react';
import { Edit, Save, TrashCan, Close } from '@carbon/icons-react';

interface Props {
  investigationId: string;
  initialNote?: string;
  onChange: (note: string | null) => void; // null = delete
}

const NotesEditor: React.FC<Props> = ({ investigationId, initialNote = '', onChange }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(initialNote || '');

  useEffect(() => {
    setText(initialNote || '');
    setEditing(false);
  }, [initialNote, investigationId]);

  const handleSave = () => {
    const trimmed = text.trim();
    onChange(trimmed === '' ? null : trimmed);
    setEditing(false);
  };

  const handleDelete = () => {
    if (!confirm('Delete this note?')) return;
    setText('');
    onChange(null);
    setEditing(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {!editing ? (
        <div>
          <div style={{ whiteSpace: 'pre-wrap', minHeight: 80, padding: 10, background: 'rgba(0,0,0,0.18)', borderRadius: 4 }}>
            {text || 'No analyst notes recorded.'}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <Button size="sm" kind="ghost" renderIcon={Edit} onClick={() => setEditing(true)}>
              {text ? 'Edit' : 'Add note'}
            </Button>
            {text && (
              <Button size="sm" kind="danger--ghost" renderIcon={TrashCan} onClick={handleDelete}>
                Delete
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div>
          <TextArea
            id={`notes-${investigationId}`}
            labelText=""
            placeholder="Enter analyst notes..."
            value={text}
            onChange={(e: any) => setText(e.target.value)}
            rows={6}
          />
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <Button size="sm" kind="primary" renderIcon={Save} onClick={handleSave}>Save</Button>
            <Button size="sm" kind="secondary" renderIcon={Close} onClick={() => { setText(initialNote || ''); setEditing(false); }}>Cancel</Button>
            {initialNote && (
              <Button size="sm" kind="danger--ghost" renderIcon={TrashCan} onClick={handleDelete}>Delete</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotesEditor;
