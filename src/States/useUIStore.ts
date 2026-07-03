import { create } from 'zustand';

interface UIState {
  // ── Existing fields (DO NOT TOUCH) ──────────────
  sidebarOpen: boolean;
  expandedSections: string[];
  activeItem: string;
  unreadAlertCount: number;
  toggleSidebar: () => void;
  toggleSection: (section: string) => void;
  setActiveItem: (item: string) => void;
  setUnreadAlertCount: (count: number) => void;

  // ── Analyst Sprint additions ─────────────────────
  shortcutsOpen: boolean;
  filterPanelOpen: boolean;
  drawerOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  setFilterPanelOpen: (updater: boolean | ((prev: boolean) => boolean)) => void;
  closeDrawer: () => void;
  openDrawer: () => void;
  // ── GeoIntel Sprint additions ─────────────────────
  geoTimelineOpen: boolean;
  geoLayerPanelOpen: boolean;
  toggleGeoTimeline: () => void;
  toggleGeoLayerPanel: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  // ── Existing state (DO NOT TOUCH) ────────────────
  sidebarOpen: true,
  expandedSections: [],
  activeItem: 'overview',
  unreadAlertCount: 0,

  toggleSidebar: () =>
    set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  toggleSection: (section: string) =>
    set((s) => ({
      expandedSections: s.expandedSections.includes(section)
        ? s.expandedSections.filter((x) => x !== section)
        : [...s.expandedSections, section],
    })),

  setActiveItem: (item: string) => set({ activeItem: item }),
  setUnreadAlertCount: (count: number) => set({ unreadAlertCount: count }),

  // ── Analyst Sprint additions ──────────────────────
  shortcutsOpen: false,
  filterPanelOpen: false,
  drawerOpen: false,

  setShortcutsOpen: (open: boolean) => set({ shortcutsOpen: open }),

  setFilterPanelOpen: (updater) =>
    set((s) => ({
      filterPanelOpen:
        typeof updater === 'function' ? updater(s.filterPanelOpen) : updater,
    })),

  closeDrawer: () => set({ drawerOpen: false }),
  openDrawer:  () => set({ drawerOpen: true }),
  // ── GeoIntel Sprint additions ─────────────────────
  geoTimelineOpen:     true,
  geoLayerPanelOpen:   true,
  toggleGeoTimeline:   () => set((s) => ({ geoTimelineOpen:   !s.geoTimelineOpen })),
  toggleGeoLayerPanel: () => set((s) => ({ geoLayerPanelOpen: !s.geoLayerPanelOpen })),
}));