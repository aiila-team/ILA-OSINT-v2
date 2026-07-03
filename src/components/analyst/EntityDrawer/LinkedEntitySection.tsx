import React from 'react';
import LinkedEntityCard, { type LinkedEntityItem } from './LinkedEntityCard';
import styles from './EntityDrawer.module.scss';

export interface LinkedEntityGroup {
  category: 'phones' | 'emails' | 'domains' | 'social accounts';
  items: LinkedEntityItem[];
}

interface LinkedEntitySectionProps {
  groups: LinkedEntityGroup[];
  onSelect?: (item: LinkedEntityItem) => void;
}

const LinkedEntitySection: React.FC<LinkedEntitySectionProps> = ({ groups, onSelect }) => (
  <div className={styles.linkedSection}>
    <div className={styles.linkedSectionHeader}>
      <p className={styles.sectionLabel}>LINKED ENTITIES</p>
      <span className={styles.linkedSectionSummary}>
        {groups.reduce((sum, group) => sum + group.items.length, 0)} items across {groups.length} categories
      </span>
    </div>

    {groups.map((group) => (
      <div key={group.category} className={styles.linkedGroup}>
        <div className={styles.linkedGroupTitle}>{group.category.toUpperCase()}</div>
        <div className={styles.linkedGroupGrid}>
          {group.items.map((item) => (
            <LinkedEntityCard
              key={item.id}
              item={item}
              category={group.category}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    ))}
  </div>
);

export default LinkedEntitySection;
