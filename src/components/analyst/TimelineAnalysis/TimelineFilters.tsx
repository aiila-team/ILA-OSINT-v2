import React, { useMemo } from 'react';
import { Select, SelectItem, Button } from '@carbon/react';
import DateRangePicker from '../DateRangePicker/DateRangePicker';
import { type TimelineFilters as TimelineFilterState, type TimelineEntity, type RiskLevel } from '../../../hooks/useTimeline';
import styles from './TimelineFilters.module.scss';

type TimeRange = '1H' | '6H' | '24H' | '7D' | '30D' | 'CUSTOM';

const defaultCases = [
  { id: 'CASE-2291', label: 'OP-IRONVEIL' },
  { id: 'CASE-2210', label: 'OP-SEAHAWK' },
  { id: 'CASE-2084', label: 'OP-LATITUDE' },
];

const defaultSources = ['SIGINT · Intercept', 'FinTrac · TXN', 'GEOINT · SAR', 'SIEM · Rule', 'ChainAnalysis · TX'];

interface TimelineFilterPanelProps {
  cases?: Array<{ id: string; label: string }>;
  sources?: string[];
  filters: TimelineFilterState;
  entities: TimelineEntity[];
  onCaseChange: (caseIds: string[]) => void;
  onDateRangeChange: (start: Date | null, end: Date | null) => void;
  onEntityChange: (entityIds: string[]) => void;
  onSourceChange: (sources: string[]) => void;
  onRiskLevelToggle: (riskLevels: RiskLevel[]) => void;
  selectedTimeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

const TimelineFilters: React.FC<TimelineFilterPanelProps> = ({
  cases = defaultCases,
  sources = defaultSources,
  filters,
  entities,
  onCaseChange,
  onDateRangeChange,
  onEntityChange,
  onSourceChange,
  onRiskLevelToggle,
  selectedTimeRange,
  onTimeRangeChange,
}) => {
  const entityOptions = useMemo(
    () => entities.map((entity) => ({ id: entity.id, label: entity.name })),
    [entities],
  );

  const toggleRisk = (level: RiskLevel) => {
    const active = filters.riskLevels.includes(level);
    onRiskLevelToggle(active ? filters.riskLevels.filter((item) => item !== level) : [...filters.riskLevels, level]);
  };

  return (
    <div className={styles.filterBar}>
      <div className={styles.filterRow}>
        <Select
          id="case-selector"
          labelText="Case"
          className={styles.filterControl}
          value={filters.caseIds[0] ?? ''}
          onChange={(e) => onCaseChange(e.target.value ? [e.target.value] : [])}
        >
          <SelectItem value="" text="All cases" />
          {cases.map((row) => (
            <SelectItem key={row.id} value={row.id} text={row.label} />
          ))}
        </Select>

        <DateRangePicker onRangeChange={onDateRangeChange} />

        <Select
          id="entity-selector"
          labelText="Entity"
          className={styles.filterControl}
          value={filters.entityIds[0] ?? ''}
          onChange={(e) => onEntityChange(e.target.value ? [e.target.value] : [])}
        >
          <SelectItem value="" text="All entities" />
          {entityOptions.map((entity) => (
            <SelectItem key={entity.id} value={entity.id} text={entity.label} />
          ))}
        </Select>

        <Select
          id="source-selector"
          labelText="Source"
          className={styles.filterControl}
          value={filters.sources[0] ?? ''}
          onChange={(e) => onSourceChange(e.target.value ? [e.target.value] : [])}
        >
          <SelectItem value="" text="All sources" />
          {sources.map((source) => (
            <SelectItem key={source} value={source} text={source} />
          ))}
        </Select>
      </div>

      <div className={styles.filterRow}>
        <div className={styles.threatControl}>
          <span>Threat Level</span>
          <div className={styles.threatButtons}>
            {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((level) => (
              <Button
                key={level}
                kind={filters.riskLevels.includes(level) ? 'primary' : 'tertiary'}
                size="sm"
                onClick={() => toggleRisk(level)}
              >
                {level}
              </Button>
            ))}
          </div>
        </div>

        <div className={styles.timeButtons}>
          {(['1H', '6H', '24H', '7D', '30D', 'CUSTOM'] as const).map((label) => (
            <button
              key={label}
              type="button"
              className={`${styles.timeButton} ${selectedTimeRange === label ? styles.timeButtonActive : ''}`}
              onClick={() => onTimeRangeChange(label)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TimelineFilters;
