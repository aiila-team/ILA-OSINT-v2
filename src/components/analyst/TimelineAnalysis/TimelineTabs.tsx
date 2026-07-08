import React from 'react';
import styles from './TimelineTabs.module.scss';

const tabs = ['Events', 'Entities', 'Alerts', 'Transactions', 'Communications', 'Investigation'] as const;

type TimelineTab = (typeof tabs)[number];

interface TimelineTabsProps {
  selectedTab: TimelineTab;
  onTabChange: (tab: TimelineTab) => void;
}

const TimelineTabs: React.FC<TimelineTabsProps> = ({ selectedTab, onTabChange }) => (
  <div className={styles.tabRow}>
    {tabs.map((tab) => (
      <button
        key={tab}
        type="button"
        className={`${styles.tabButton} ${selectedTab === tab ? styles.tabButtonActive : ''}`}
        onClick={() => onTabChange(tab)}
      >
        {tab}
      </button>
    ))}
  </div>
);

export default TimelineTabs;
