import React from 'react';
import { Tag } from '@carbon/react';
import styles from './EntityDrawer.module.scss';

export interface LinkedEntityItem {
  id: string;
  label: string;
  value: string;
  subtitle: string;
  verified?: boolean;
}

interface LinkedEntityCardProps {
  item: LinkedEntityItem;
  category: string;
  onSelect?: (item: LinkedEntityItem) => void;
}

const LinkedEntityCard: React.FC<LinkedEntityCardProps> = ({ item, category, onSelect }) => (
  <button
    type="button"
    className={styles.linkedCard}
    onClick={() => onSelect?.(item)}
    aria-label={`Open linked entity ${item.label}`}
  >
    <div className={styles.linkedCardHeader}>
      <p className={styles.linkedCardTitle}>{item.label}</p>
      <Tag type="gray" size="sm" className={styles.linkedCardTag}>
        {category}
      </Tag>
    </div>

    <p className={styles.linkedCardDetail}>{item.value}</p>
    <div className={styles.linkedCardFooter}>
      <span className={styles.linkedCardMeta}>{item.subtitle}</span>
      {item.verified && (
        <Tag type="teal" size="sm" className={styles.linkedCardVerified}>
          verified
        </Tag>
      )}
    </div>
  </button>
);

export default LinkedEntityCard;
