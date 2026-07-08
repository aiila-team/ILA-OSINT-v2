// src/components/analyst/NoteThread/NoteThread.tsx
// ILA OSINT — Note Thread Component
// Thread-style analyst notes with avatar, edit icon, and post input.

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@carbon/react';
import { Edit, Send } from '@carbon/icons-react';
import type { CaseNote } from '../../../hooks/useCases';
import styles from './NoteThread.module.scss';

// ─────────────────────────────────────────────────────────────────
// Avatar colour map
// ─────────────────────────────────────────────────────────────────

const AVATAR_CLASS: Record<'a' | 'b' | 'c' | 'd', string> = {
  a: styles.avatarA,
  b: styles.avatarB,
  c: styles.avatarC,
  d: styles.avatarD,
};

// ─────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────

interface NoteThreadProps {
  notes: CaseNote[];
  onAddNote: (text: string) => void;
  compact?: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

const NoteThread: React.FC<NoteThreadProps> = ({ notes, onAddNote, compact = false }) => {
  const [draftText,   setDraftText]   = useState('');
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editText,    setEditText]    = useState('');

  const handlePost = () => {
    if (!draftText.trim()) return;
    onAddNote(draftText.trim());
    setDraftText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handlePost();
    }
  };

  return (
    <div className={`${styles.thread} ${compact ? styles.compact : ''}`}>

      {/* ── Note list ── */}
      <div className={styles.noteList}>
        <AnimatePresence initial={false}>
          {notes.length === 0 && (
            <div className={styles.empty}>No analyst notes yet.</div>
          )}
          {notes.map((note) => (
            <motion.div
              key={note.id}
              className={styles.noteItem}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {/* Note header */}
              <div className={styles.noteHead}>
                <div className={`${styles.avatar} ${AVATAR_CLASS[note.avatarKey]}`}>
                  {note.initials}
                </div>
                <span className={styles.authorName}>{note.author}</span>
                <span className={styles.timestamp}>{note.timestamp}</span>
                <button
                  className={styles.editBtn}
                  onClick={() => {
                    setEditingId(note.id);
                    setEditText(note.text);
                  }}
                  aria-label="Edit note"
                >
                  <Edit size={12} />
                </button>
              </div>

              {/* Note body or edit field */}
              {editingId === note.id ? (
                <div className={styles.editArea}>
                  <textarea
                    className={styles.editTextarea}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                  <div className={styles.editActions}>
                    <button className={styles.cancelBtn} onClick={() => setEditingId(null)}>CANCEL</button>
                    <button className={styles.saveBtn} onClick={() => setEditingId(null)}>SAVE</button>
                  </div>
                </div>
              ) : (
                <p className={styles.noteBody}>{note.text}</p>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Input area ── */}
      <div className={styles.inputArea}>
        <textarea
          className={styles.noteTextarea}
          placeholder="Add analyst note…  (Ctrl+Enter to post)"
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
        />
        <div className={styles.inputActions}>
          <span className={styles.hint}>Ctrl+Enter to post</span>
          <Button
            size="sm"
            kind="primary"
            renderIcon={Send}
            onClick={handlePost}
            disabled={!draftText.trim()}
            className={styles.postBtn}
          >
            POST NOTE
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NoteThread;