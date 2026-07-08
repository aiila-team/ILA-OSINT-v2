import React, { useState, useRef, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import styles from './DateRangePicker.module.scss';

interface DateRangePickerProps {
  onRangeChange?: (start: Date | null, end: Date | null, preset?: string) => void;
}

const PRESETS = [
  { label: 'Date Range', value: 'ALL' },
  { label: 'Last 24h',   value: '24h' },
  { label: 'Last 7 days',value: '7d'  },
  { label: 'Last 30 days',value: '30d'},
];

const DateRangePicker: React.FC<DateRangePickerProps> = ({ onRangeChange }) => {
  const [open, setOpen]             = useState(false);
  const [startDate, setStartDate]   = useState<Date | null>(null);
  const [endDate, setEndDate]       = useState<Date | null>(null);
  const [preset, setPreset]         = useState('ALL');
  const [showCalendar, setShowCalendar] = useState(false);
  const wrapperRef                  = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCalendar(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handlePresetClick = (value: string) => {
    setPreset(value);
    setStartDate(null);
    setEndDate(null);
    setShowCalendar(false);
    onRangeChange?.(null, null, value);
    if (value !== 'ALL') setOpen(false);
  };

  const handleCalendarChange = (dates: [Date | null, Date | null]) => {
    const [start, end] = dates;
    setStartDate(start);
    setEndDate(end);
    setPreset('ALL');
    onRangeChange?.(start, end);
    if (start && end) {
      setOpen(false);
      setShowCalendar(false);
    }
  };

  const formatLabel = () => {
    if (startDate && endDate) {
      const fmt = (d: Date) =>
        d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
      return `${fmt(startDate)} – ${fmt(endDate)}`;
    }
    if (preset !== 'ALL') {
      return PRESETS.find(p => p.value === preset)?.label ?? 'Date Range';
    }
    return 'Date Range';
  };

  const hasValue = preset !== 'ALL' || startDate !== null;

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStartDate(null);
    setEndDate(null);
    setPreset('ALL');
    setShowCalendar(false);
    onRangeChange?.(null, null, 'ALL');
  };

  return (
    <div className={styles.wrap} ref={wrapperRef}>

      {/* ── Chip trigger ── */}
      <div
        className={`${styles.chip} ${hasValue ? styles.chipActive : ''}`}
        onClick={() => setOpen(o => !o)}
        role="button"
        aria-label="Open date range filter"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M11 1V0h-1v1H6V0H5v1H1.5A1.5 1.5 0 0 0 0 2.5v11A1.5 1.5 0 0 0 1.5 15h13a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 14.5 1H11zM1 5h14v8.5a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5V5zm0-2.5a.5.5 0 0 1 .5-.5H5v1h1V2h4v1h1V2h3.5a.5.5 0 0 1 .5.5V4H1V2.5z"/>
        </svg>
        <span className={styles.label}>{formatLabel()}</span>
        <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M3 5l5 5 5-5H3z"/>
        </svg>
      </div>

      {/* ── Clear button ── */}
      {hasValue && (
        <button className={styles.clearBtn} onClick={handleClear} aria-label="Clear">×</button>
      )}

      {/* ── Dropdown panel ── */}
      {open && (
        <div className={styles.popup}>

          {/* Preset options */}
          <div className={styles.presetList}>
            {PRESETS.map(p => (
              <div
                key={p.value}
                className={`${styles.presetItem} ${preset === p.value && !startDate ? styles.presetActive : ''}`}
                onClick={() => handlePresetClick(p.value)}
              >
                {p.label}
              </div>
            ))}

            {/* Custom range option — toggles calendar */}
            <div
              className={`${styles.presetItem} ${styles.presetCalendar} ${showCalendar ? styles.presetActive : ''}`}
              onClick={() => setShowCalendar(c => !c)}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11 1V0h-1v1H6V0H5v1H1.5A1.5 1.5 0 0 0 0 2.5v11A1.5 1.5 0 0 0 1.5 15h13a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 14.5 1H11zM1 5h14v8.5a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5V5zm0-2.5a.5.5 0 0 1 .5-.5H5v1h1V2h4v1h1V2h3.5a.5.5 0 0 1 .5.5V4H1V2.5z"/>
              </svg>
              Custom Range
              <svg
                width="8" height="8" viewBox="0 0 16 16" fill="currentColor"
                style={{ marginLeft: 'auto', transform: showCalendar ? 'rotate(180deg)' : 'none', transition: '0.2s' }}
              >
                <path d="M3 5l5 5 5-5H3z"/>
              </svg>
            </div>
          </div>

          {/* Calendar — shown when Custom Range is clicked */}
          {showCalendar && (
            <div className={styles.calendarSection}>
              {/* FROM → TO display */}
              <div className={styles.rangeDisplay}>
                <div className={styles.rangeBlock}>
                  <span className={styles.rangeLabel}>FROM</span>
                  <span className={styles.rangeValue}>
                    {startDate
                      ? startDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
                      : '— — —'}
                  </span>
                </div>
                <span className={styles.rangeSep}>→</span>
                <div className={styles.rangeBlock}>
                  <span className={styles.rangeLabel}>TO</span>
                  <span className={styles.rangeValue}>
                    {endDate
                      ? endDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
                      : '— — —'}
                  </span>
                </div>
              </div>

              {/* Calendar */}
              <DatePicker
                selected={startDate}
                onChange={handleCalendarChange}
                startDate={startDate}
                endDate={endDate}
                selectsRange
                inline
                maxDate={new Date()}
              />

              {/* Apply / Clear */}
              <div className={styles.calendarFooter}>
                <button
                  className={styles.footerClear}
                  onClick={() => { setStartDate(null); setEndDate(null); onRangeChange?.(null, null); }}
                >
                  CLEAR
                </button>
                <button
                  className={styles.footerApply}
                  onClick={() => { setOpen(false); setShowCalendar(false); }}
                  disabled={!startDate}
                >
                  APPLY
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

export default DateRangePicker;
