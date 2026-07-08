import { useState, useEffect } from "react";
import { ApolloProvider } from "@apollo/client/react";
import apolloClient from "./api/apolloClient";
import DashboardLayout from "./presentation/layouts/DashboardLayout";
import DashboardPage from "./presentation/pages/admin/DashboardPage";
import AdminOverview from "./pages/AdminOverview";
import { ActiveUsersPage } from "./presentation/pages/admin/ActiveUsersPage";
import CreateUserPage from "./presentation/pages/admin/CreateUserPage";
import AccessControlPage from "./presentation/pages/admin/AccessControlPage";
import PoliciesPage from "./presentation/pages/admin/PoliciesPage";
import InvestigationsPage from "./presentation/pages/analyst/InvestigationsPage";
import AlertInboxPage from "./presentation/pages/analyst/AlertInboxPage";
import GeoIntelPage from "./presentation/pages/analyst/GeoIntelPage";
import GraphAnalysisPage from "./presentation/pages/analyst/GraphAnalysisPage";
import RolesPage from './presentation/pages/admin/RolesPage';
import { useUIStore } from "./States/useUIStore";
import LoginPage from "./pages/Login/LoginPage";
import "./styles/variables.scss";
import "./styles/geoint-tokens.scss";

// ── Session helpers ───────────────────────────────────────────────
const SESSION_KEY = "ila_session";

interface Session {
  username: string;
  role: string;
  orgId: string;
}

function getSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// ─────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState<Session | null>(getSession);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const activeItem = useUIStore((state) => state.activeItem);
  const setActiveItem = useUIStore((state) => state.setActiveItem);

  useEffect(() => {
    const mapPathToItem: Record<string, string> = {
      '/analyst/geointel': 'geointel',
      '/analyst/investigations': 'investigations',
      '/analyst/alerts': 'alerts',
      '/analyst/entity-search': 'entity-search',
      '/analyst/graph-analysis': 'graph-analysis',
      '/analyst/timeline': 'timeline',
      '/analyst/cases': 'cases',
      '/analyst/reports': 'reports',
      '/admin/overview': 'overview',
      '/admin/create-user': 'create-user',
      '/admin/active-users': 'active-users',
      '/admin/roles': 'roles',
      '/admin/access-control': 'access-control',
      '/admin/policies': 'policies',
    };

    const routeItem = mapPathToItem[window.location.pathname];
    if (routeItem && routeItem !== activeItem) {
      setActiveItem(routeItem);
    }
  }, [activeItem, setActiveItem]);

  const handleLoginSuccess = (username: string, orgId: string) => {
    const s: Session = { username, role: "admin", orgId };
    saveSession(s);
    setSession(s);
    setIsLoginOpen(false);
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
  };

  const renderPage = () => {
    switch (activeItem) {
      case "overview":
        return <AdminOverview />;
      case "create-user":
        return <CreateUserPage />;
      case "active-users":
        return <ActiveUsersPage />;
      case "access-control":
        return <AccessControlPage />;
      case "policies":
        return <PoliciesPage />;
      case "investigations":
        return <InvestigationsPage />;
      case "alerts":
        return <AlertInboxPage />;
      case "geointel":
        return <GeoIntelPage />;
      case "graph-analysis":
        return <GraphAnalysisPage />;
      case "roles":
        return <RolesPage />;
      default:
        return <DashboardPage />;
    }
  };

  if (session) {
    return (
      <ApolloProvider client={apolloClient}>
        <DashboardLayout
          username={session.username}
          role={session.role}
          onLogout={handleLogout}
        >
          {renderPage()}
        </DashboardLayout>
      </ApolloProvider>
    );
  }

  return (
    <ApolloProvider client={apolloClient}>
      <LoginPage
        isLoginOpen={isLoginOpen}
        onOpenLogin={() => setIsLoginOpen(true)}
        onCloseLogin={() => setIsLoginOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />
    </ApolloProvider>
  );
}