export type UserStatus = 'ONLINE' | 'IDLE' | 'OFFLINE';
export type UserRole = 'admin' | 'analyst' | 'viewer';

export interface User {
  id: string;
  name: string;
  initials: string;
  role: UserRole;
  status: UserStatus;
  org: string;
  lastActive: string;
  location: string;
  activeCases: number;
}

export const MOCK_USERS: User[] = [
  {
    id: 'USR-001',
    name: 'Amelia Cortez',
    initials: 'AC',
    role: 'admin',
    status: 'ONLINE',
    org: 'ORG-00001',
    lastActive: 'Just now',
    location: 'Washington, D.C.',
    activeCases: 5,
  },
  {
    id: 'USR-002',
    name: 'J. Reyes',
    initials: 'JR',
    role: 'analyst',
    status: 'ONLINE',
    org: 'ORG-00001',
    lastActive: '2 min ago',
    location: 'Austin, TX',
    activeCases: 3,
  },
  {
    id: 'USR-003',
    name: 'M. Chen',
    initials: 'MC',
    role: 'analyst',
    status: 'OFFLINE',
    org: 'ORG-00002',
    lastActive: '1 hr ago',
    location: 'San Jose, CA',
    activeCases: 0,
  },
  {
    id: 'USR-004',
    name: 'K. Patel',
    initials: 'KP',
    role: 'viewer',
    status: 'OFFLINE',
    org: 'ORG-00001',
    lastActive: '3 hrs ago',
    location: 'Berlin, DE',
    activeCases: 0,
  },
  {
    id: 'USR-005',
    name: 'T. Williams',
    initials: 'TW',
    role: 'analyst',
    status: 'ONLINE',
    org: 'ORG-00003',
    lastActive: '5 min ago',
    location: 'London, UK',
    activeCases: 1,
  },
];

export interface ActivityEvent {
  user: string;
  action: string;
  time: string;
}

export const ACTIVITY_EVENTS: ActivityEvent[] = [
  { user: 'J. Reyes', action: 'Closed a priority intelligence alert from Network 7.', time: 'Just now' },
  { user: 'Amelia Cortez', action: 'Promoted analyst access for ORG-00001.', time: '1 min ago' },
  { user: 'M. Chen', action: 'Reviewed satellite imagery and flagged a new geo-tag.', time: '3 min ago' },
  { user: 'K. Patel', action: 'Exported secure briefing notes to the shared response channel.', time: '7 min ago' },
  { user: 'T. Williams', action: 'Validated a cross-link between two priority actors.', time: '11 min ago' },
];
