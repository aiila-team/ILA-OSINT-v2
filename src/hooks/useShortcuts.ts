import { useEffect } from 'react';

export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Placeholder for dashboard shortcut handling.
      // Add keyboard shortcuts here if needed.
      if (event.key === '?') {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
