// src/components/analyst/TimelineCanvas/TimelineCanvas.tsx
// ILA OSINT — vis-timeline React wrapper
// Renders entity swim-lanes with colour-coded, type-keyed event blocks.

import React, { useEffect, useRef, useCallback } from 'react';
import { Timeline }  from 'vis-timeline/standalone';
import type { TimelineOptions, IdType } from 'vis-timeline/standalone';
import { DataSet }   from 'vis-data/standalone';
import 'vis-timeline/styles/vis-timeline-graph2d.min.css';

import type { TimelineEvent, TimelineEntity } from '../../../hooks/useTimeline';
import { EVENT_TYPE_COLOR_HEX, MOCK_ENTITIES } from '../../../hooks/useTimeline';
import styles from './TimelineCanvas.module.scss';

// ─────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────

interface TimelineCanvasProps {
  events:          TimelineEvent[];
  entities?:       TimelineEntity[];
  selectedEventId: string | null;
  onSelect:        (id: string | null) => void;
  dateFrom:        Date;
  dateTo:          Date;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function buildGroupLabel(entity: TimelineEntity): string {
  return `
    <div class="tl-group-label">
      <span class="tl-group-name" style="color:${entity.color}">${entity.name}</span>
      <span class="tl-group-id">${entity.id}</span>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

const TimelineCanvas: React.FC<TimelineCanvasProps> = ({
  events,
  entities = MOCK_ENTITIES,
  selectedEventId,
  onSelect,
  dateFrom,
  dateTo,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tlRef        = useRef<Timeline | null>(null);
   
  const itemsRef     = useRef<InstanceType<typeof DataSet<any>>>(new DataSet([]));
   
  const groupsRef    = useRef<InstanceType<typeof DataSet<any>>>(new DataSet([]));

  // ── Build items dataset ──────────────────────────────────────
   
  const buildItems = useCallback((): any[] => {
    return events.map((e) => {
      const color      = EVENT_TYPE_COLOR_HEX[e.type];
      const isAlert    = e.type === 'ALERT';
      const isSelected = e.id === selectedEventId;
      return {
        id:        e.id,
        group:     e.entityId,
        start:     new Date(e.timestamp),
        content:   `<span class="tl-item-label">${e.title}</span>`,
        title:     `${e.title}\n${new Date(e.timestamp).toUTCString()}\n${e.source}`,
        className: [
          'tl-event',
          `tl-type-${e.type.toLowerCase()}`,
          isAlert    ? 'tl-alert-pulse' : '',
          isSelected ? 'tl-selected'    : '',
        ].filter(Boolean).join(' '),
        style: [
          `background:${color}22`,
          `border-left:3px solid ${color}`,
          `color:${color}`,
          isSelected ? `box-shadow:0 0 0 2px ${color},0 0 12px ${color}55` : '',
        ].filter(Boolean).join(';'),
      };
    });
  }, [events, selectedEventId]);

  // ── Build groups dataset ─────────────────────────────────────
   
  const buildGroups = useCallback((): any[] => {
    return entities.map((ent) => ({
      id:      ent.id,
      content: buildGroupLabel(ent),
      style:   `border-left:3px solid ${ent.color}22`,
    }));
  }, [entities]);

  // ── Initialise timeline (once only) ─────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

     
    const items  = new DataSet<any>(buildItems());
     
    const groups = new DataSet<any>(buildGroups());
    itemsRef.current  = items;
    groupsRef.current = groups;

    const options: TimelineOptions = {
      height:          '100%',
      start:           dateFrom,
      end:             dateTo,
      zoomMin:         1_000 * 60 * 60,            // 1 h
      zoomMax:         1_000 * 60 * 60 * 24 * 90,  // 90 d
      moveable:        true,
      zoomable:        true,
      selectable:      true,
      showCurrentTime: true,
      stack:           false,
      orientation:     { axis: 'top' },
      groupOrder:      'id',
      margin:          { item: { horizontal: 4, vertical: 4 } },
      tooltip:         { followMouse: true, overflowMethod: 'cap' },
    };

    const tl = new Timeline(
      containerRef.current,
      items  as unknown as never,
      groups as unknown as never,
      options,
    );
    tlRef.current = tl;

    tl.on('select', (props: { items: IdType[] }) => {
      onSelect(props.items[0] ? String(props.items[0]) : null);
    });

    return () => {
      tl.destroy();
      tlRef.current = null;
    };
    // initialise once — date range synced via separate effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync items when events / selection changes ───────────────
  useEffect(() => {
    if (!tlRef.current) return;
    itemsRef.current.clear();
    itemsRef.current.add(buildItems());
  }, [buildItems]);

  // ── Sync groups when entities changes ───────────────────────
  useEffect(() => {
    if (!tlRef.current) return;
    groupsRef.current.clear();
    groupsRef.current.add(buildGroups());
  }, [buildGroups]);

  // ── Sync visible window (date range / zoom) ──────────────────
  useEffect(() => {
    tlRef.current?.setWindow(dateFrom, dateTo, {
      animation: { duration: 400, easingFunction: 'easeInOutQuad' },
    });
  }, [dateFrom, dateTo]);

  // ── Keep vis selection state in sync with prop ───────────────
  useEffect(() => {
    if (!tlRef.current) return;
    tlRef.current.setSelection(selectedEventId ? [selectedEventId] : []);
  }, [selectedEventId]);

  return (
    <div className={styles.canvasWrap}>
      <div ref={containerRef} className={styles.visContainer} />
    </div>
  );
};

export default TimelineCanvas;