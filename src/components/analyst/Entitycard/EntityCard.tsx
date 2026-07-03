// src/components/analyst/EntityCard/EntityCard.tsx
// ILA OSINT — Entity Card Component
// ClickableTile card with type icon, RiskGauge, metadata tags, and overflow menu.

import React from 'react';
import { ClickableTile, Tag, OverflowMenu, OverflowMenuItem } from '@carbon/react';
import {
  User,
  Building,
  Location,
  Laptop,
  Car,
  Finance,
  Unknown,
} from '@carbon/icons-react';
import { motion } from 'framer-motion';

import RiskGauge from '../RiskGauge/RiskGauge';
import type { Entity, EntityType } from '../../../hooks/useEntitySearch';
import styles from './EntityCard.module.scss';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<EntityType, React.FC<{ size: number; className?: string }>> = {
  PERSON:    User,
  ORG:       Building,
  LOCATION:  Location,
  DIGITAL:   Laptop,
  VEHICLE:   Car,
  FINANCIAL: Finance,
};

const TYPE_LABEL: Record<EntityType, string> = {
  PERSON:    'PERSON',
  ORG:       'ORG',
  LOCATION:  'LOCATION',
  DIGITAL:   'DIGITAL',
  VEHICLE:   'VEHICLE',
  FINANCIAL: 'FINANCIAL',
};

function riskClass(score: number): string {
  if (score >= 80) return styles.riskCritical;
  if (score >= 55) return styles.riskHigh;
  if (score >= 35) return styles.riskMedium;
  return styles.riskLow;
}

function riskLevelLabel(score: number): 'HIGH RISK' | 'MEDIUM RISK' | 'LOW RISK' {
  if (score >= 80) return 'HIGH RISK';
  if (score >= 55) return 'MEDIUM RISK';
  return 'LOW RISK';
}

function riskLevelClass(score: number): string {
  if (score >= 80) return styles.riskStripHigh;
  if (score >= 55) return styles.riskStripMedium;
  return styles.riskStripLow;
}

function statusBadgeClass(status: string | undefined): string {
  if (status === 'confirmed') return styles.fraudConfirmed;
  if (status === 'suspected') return styles.fraudSuspected;
  if (status === 'blacklisted') return styles.blacklistFlag;
  if (status === 'monitored') return styles.blacklistMonitored;
  return styles.statusNeutral;
}

function formatLastSeen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────

interface EntityCardProps {
  entity: Entity;
  onSelect: (entity: Entity) => void;
  onAddToGraph?: (entity: Entity) => void;
  onAddToCase?: (entity: Entity) => void;
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

const EntityCard: React.FC<EntityCardProps> = ({
  entity,
  onSelect,
  onAddToGraph,
  onAddToCase,
}) => {
  const Icon = TYPE_ICON[entity.type] ?? Unknown;

  const handleCopyId = () => {
    navigator.clipboard.writeText(entity.id).catch(() => {});
  };

  const riskLabel = riskLevelLabel(entity.riskScore);
  const fraudText = entity.fraudStatus === 'confirmed'
    ? 'CONFIRMED FRAUD'
    : entity.fraudStatus === 'suspected'
    ? 'SUSPECTED FRAUD'
    : undefined;
  const blacklistText = entity.blacklistStatus === 'blacklisted'
    ? 'BLACKLISTED'
    : entity.blacklistStatus === 'monitored'
    ? 'MONITORED'
    : undefined;

  return (
    <motion.div
      className={`${styles.cardWrap} ${entity.riskScore >= 80 ? styles.criticalBorder : ''}`}
      layout
      whileHover={{ y: -2, transition: { duration: 0.14, ease: 'easeOut' } }}
    >
      <div className={`${styles.riskStrip} ${riskLevelClass(entity.riskScore)}`}>
        {riskLabel}
      </div>

      {/* Overflow menu — positioned top-left of gauge, floated right */}
      <div className={styles.cardHeader}>
        {/* Type icon */}
        <div className={styles.typeIconWrap}>
          <Icon size={20} className={styles.typeIcon} />
        </div>

        <div className={styles.headerRight}>
          {/* Risk gauge */}
          <RiskGauge score={entity.riskScore} size={48} showLabel />

          {/* Overflow menu */}
          <OverflowMenu
            size="sm"
            iconDescription="Entity actions"
            className={styles.overflow}
            flipped
          >
            <OverflowMenuItem
              itemText="View Full Profile"
              onClick={() => onSelect(entity)}
            />
            <OverflowMenuItem
              itemText="Add to Graph"
              onClick={() => onAddToGraph?.(entity)}
            />
            <OverflowMenuItem
              itemText="Add to Case"
              onClick={() => onAddToCase?.(entity)}
            />
            <OverflowMenuItem
              itemText="Copy ID"
              onClick={handleCopyId}
            />
          </OverflowMenu>
        </div>
      </div>

      {/* Clickable body */}
      <ClickableTile
        className={styles.tile}
        onClick={() => onSelect(entity)}
        aria-label={`Open entity: ${entity.name}`}
      >
        {/* Name */}
        <p className={styles.entityName}>{entity.name}</p>

        {/* ID */}
        <p className={styles.entityId}>{entity.id}</p>

        {/* Tags row */}
        <div className={styles.tagsRow}>
          <Tag type="cool-gray" size="sm" className={styles.typeTag}>
            {TYPE_LABEL[entity.type]}
          </Tag>
          <Tag type="outline" size="sm" className={styles.sourceTag}>
            {entity.source}
          </Tag>
          <span className={styles.lastSeen}>{formatLastSeen(entity.lastSeen)}</span>
        </div>

        {/* Risk status badges */}
        <div className={styles.statusRow}>
          {fraudText && (
            <Tag type="red" size="sm" className={`${styles.statusBadge} ${statusBadgeClass(entity.fraudStatus)}`}>
              {fraudText}
            </Tag>
          )}
          {blacklistText && (
            <Tag type="magenta" size="sm" className={`${styles.statusBadge} ${statusBadgeClass(entity.blacklistStatus)}`}>
              {blacklistText}
            </Tag>
          )}
        </div>

        {/* Semantic tags */}
        {entity.tags.length > 0 && (
          <div className={styles.semanticTags}>
            {entity.tags.slice(0, 3).map((t) => (
              <Tag key={t} type="outline" size="sm" className={styles.semTag}>
                {t}
              </Tag>
            ))}
            {entity.tags.length > 3 && (
              <span className={styles.moreTag}>+{entity.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Connection count */}
        <div className={styles.footer}>
          <span className={`${styles.riskBadge} ${riskClass(entity.riskScore)}`}>
            RISK {entity.riskScore}
          </span>
          <span className={styles.connections}>
            {entity.connectionCount} connections
          </span>
        </div>
      </ClickableTile>
    </motion.div>
  );
};

export default EntityCard;