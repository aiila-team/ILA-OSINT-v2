// src/components/admin/EmptyState/EmptyState.tsx
import React from 'react';
import styles from './EmptyState.module.scss';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({ title, description, icon }) => (
  <div className={styles.wrap}>
    {icon && <div className={styles.icon}>{icon}</div>}
    <div className={styles.title}>{title}</div>
    {description && <div className={styles.desc}>{description}</div>}
  </div>
);

export default EmptyState;
