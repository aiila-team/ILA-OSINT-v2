import React from 'react';
import styles from './HamburgerMenu.module.scss';

interface HamburgerMenuProps {
  isOpen: boolean;
  onToggle: () => void;
}

const HamburgerMenu: React.FC<HamburgerMenuProps> = ({ isOpen, onToggle }) => {
  return (
    <button
      className={`${styles.hamburger} ${isOpen ? styles.active : ''}`}
      onClick={onToggle}
      aria-label={isOpen ? 'Close authentication panel' : 'Open authentication panel'}
      aria-expanded={isOpen}
    >
      <span className={styles.label}>
        {isOpen ? 'CLOSE' : 'ACCESS'}
      </span>
      <div className={styles.lines}>
        <span className={styles.line} />
        <span className={styles.line} />
        <span className={styles.line} />
      </div>
    </button>
  );
};

export default HamburgerMenu;