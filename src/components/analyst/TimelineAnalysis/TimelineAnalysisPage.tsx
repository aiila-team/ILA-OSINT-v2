import React, { useMemo, useState } from 'react';
import AnalystPageShell from '../AnalystPageshell/AnalystPageShell';
import TimelineHeader from './TimelineHeader';
import TimelineFilters from './TimelineFilters';
import TimelineAnalyticsBar from './TimelineAnalyticsBar';
import TimelineTabs from './TimelineTabs';
import TimelineEventFeed from './TimelineEventFeed';
import TimelineEntityPanel from './TimelineEntityPanel';
import { useTimeline } from '../../../hooks/useTimeline';
import styles from './TimelineAnalysisPage.module.scss';

const CASE_OPTIONS = [
  { id: 'CASE-2291', label: 'OP-IRONVEIL' },
  { id: 'CASE-2210', label: 'OP-SEAHAWK' },
  { id: 'CASE-2084', label: 'OP-LATITUDE' },
];

const SOURCE_OPTIONS = [
  'SIGINT · Intercept',
  'FinTrac · TXN',
  'GEOINT · SAR',
  'SIEM · Rule',
  'ChainAnalysis · TX',
];

type TimeRange = '1H' | '6H' | '24H' | '7D' | '30D' | 'CUSTOM';

type TimelineTab = 'Events' | 'Entities' | 'Alerts' | 'Transactions' | 'Communications' | 'Investigation';

const TimelineAnalysisPage: React.FC = () => {
  const tl = useTimeline();
  const [selectedTab, setSelectedTab] = useState<TimelineTab>('Events');
  const [selectedRange, setSelectedRange] = useState<TimeRange>('7D');

  const eventCount = tl.filteredEvents.length;
  const alertCount = tl.filteredEvents.filter((evt) => evt.type === 'ALERT').length;
  const entityCount = useMemo(() => new Set(tl.filteredEvents.map((evt) => evt.entityId)).size, [tl.filteredEvents]);

  const averageRisk = useMemo(() => {
    if (tl.filteredEvents.length === 0) return 'Low';
    const total = tl.filteredEvents.reduce((sum, evt) => sum + (evt.confidence ?? 45), 0);
    const score = total / tl.filteredEvents.length;
    if (score > 90) return 'Critical';
    if (score > 75) return 'High';
    if (score > 60) return 'Medium';
    return 'Low';
  }, [tl.filteredEvents]);

  const analyticsStats = useMemo(
    () => [
      { title: 'Total Events', value: String(eventCount) },
      { title: 'Critical Events', value: String(alertCount) },
      { title: 'Connected Entities', value: String(entityCount) },
      { title: 'Investigation Status', value: 'Active' },
      { title: 'Average Risk', value: averageRisk },
    ],
    [eventCount, alertCount, entityCount, averageRisk],
  );

  const handleTimeRange = (range: TimeRange) => {
    setSelectedRange(range);
    if (range === 'CUSTOM') return;
    const now = new Date();
    const rangeMs =
      range === '1H' ? 1 * 60 * 60 * 1000 :
      range === '6H' ? 6 * 60 * 60 * 1000 :
      range === '24H' ? 24 * 60 * 60 * 1000 :
      range === '7D' ? 7 * 24 * 60 * 60 * 1000 :
      30 * 24 * 60 * 60 * 1000;
    tl.updateFilters({ dateFrom: new Date(now.getTime() - rangeMs), dateTo: now });
  };

  return (
    <AnalystPageShell title="Timeline Analysis" actions={<TimelineHeader eventCount={eventCount} alertCount={alertCount} entityCount={entityCount} />}>
      <div className={styles.pageLayout}>
        <TimelineFilters
          cases={CASE_OPTIONS}
          sources={SOURCE_OPTIONS}
          filters={tl.filters}
          entities={tl.entities}
          onCaseChange={(caseIds: string[]) => tl.updateFilters({ caseIds })}
          onDateRangeChange={(start: Date | null, end: Date | null) => tl.updateFilters({ dateFrom: start ?? tl.filters.dateFrom, dateTo: end ?? tl.filters.dateTo })}
          onEntityChange={(entityIds: string[]) => tl.updateFilters({ entityIds })}
          onSourceChange={(sources: string[]) => tl.updateFilters({ sources })}
          onRiskLevelToggle={(riskLevels) => tl.updateFilters({ riskLevels })}
          selectedTimeRange={selectedRange}
          onTimeRangeChange={handleTimeRange}
        />

        <TimelineAnalyticsBar stats={analyticsStats} />

        <div className={styles.mainGrid}>
          <div className={styles.timelineArea}>
            <TimelineTabs selectedTab={selectedTab} onTabChange={setSelectedTab} />
            <TimelineEventFeed events={tl.filteredEvents} />
          </div>
          <TimelineEntityPanel />
        </div>
      </div>
    </AnalystPageShell>
  );
};

export default TimelineAnalysisPage;
