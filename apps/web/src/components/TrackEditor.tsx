'use client';

import { useState, useTransition } from 'react';
import { saveTrackAction } from '../../app/problems/actions';

/**
 * Collapsed: a pill that opens the form. Open: name input + textarea (one
 * problem per line — URL, titleSlug, or title) + Save/Cancel. Unknown lines
 * come back from the action and are listed inline; nothing is saved unless
 * every line resolves.
 */
export function TrackEditor({
  initialName,
  initialText,
  defaultOpen = false,
}: {
  initialName: string;
  initialText: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [name, setName] = useState(initialName);
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const creating = initialText.trim().length === 0;

  function openEditor() {
    // Re-sync from props so a track saved in another tab isn't clobbered by
    // this component's stale local state.
    setName(initialName);
    setText(initialText);
    setError(null);
    setOpen(true);
  }

  function save() {
    startTransition(async () => {
      const result = await saveTrackAction(name, text);
      if (result.ok) {
        setError(null);
        setOpen(false);
      } else if (result.unknown.length === 0) {
        setError('Add at least one problem — one per line.');
      } else {
        const shown = result.unknown.slice(0, 5).join(', ');
        const rest = result.unknown.length > 5 ? `, +${result.unknown.length - 5} more` : '';
        setError(`Not found in the LeetCode catalog: ${shown}${rest}`);
      }
    });
  }

  if (!open) {
    return (
      <button type="button" className="track-btn" onClick={openEditor}>
        {creating ? 'Create a track…' : 'Edit list'}
      </button>
    );
  }

  return (
    <div className="track-editor">
      <input
        className="track-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Track name"
        aria-label="Track name"
        maxLength={80}
      />
      <textarea
        className="track-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          'One problem per line — URL, titleSlug, or title:\nhttps://leetcode.com/problems/two-sum/\nnext-greater-element-i\nClimbing Stairs'
        }
        aria-label="Track problems"
        rows={7}
      />
      <p className="track-editor-hint">
        One problem per line: a LeetCode URL, titleSlug, or title. The order here is the track
        order.
      </p>
      {error && <p className="track-editor-error">{error}</p>}
      <div className="track-editor-actions">
        <button type="button" className="track-btn primary" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save track'}
        </button>
        <button
          type="button"
          className="track-btn"
          onClick={() => {
            setError(null);
            setOpen(false);
          }}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
