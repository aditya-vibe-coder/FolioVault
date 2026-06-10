import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store/appStore';
import { Layout } from './components/Layout';
import LandingPage from './pages/LandingPage';
import PrivacyPage from './pages/PrivacyPage';
import DashboardPage from './pages/DashboardPage';
import HoldingsPage from './pages/HoldingsPage';
import ImportPage from './pages/ImportPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';
import CoachPage from './pages/CoachPage';
import CapitalGainsPage from './pages/CapitalGainsPage';
import ActivityPage from './pages/ActivityPage';
import InsurancePage from './pages/InsurancePage';

function App() {
  const bootstrap = useAppStore((s) => s.bootstrap);
  const ready = useAppStore((s) => s.ready);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bootstrap().catch((e) => {
      console.error('App bootstrap error:', e);
      setError(e?.message || 'Failed to initialise local database.');
    });
  }, [bootstrap]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <div className="max-w-md text-center space-y-3">
          <p className="text-4xl">⚠️</p>
          <h1 className="text-lg font-black">Failed to start FolioVault</h1>
          <p className="text-sm text-slate-500">{error}</p>
          <p className="text-xs text-slate-400">
            Try clearing your browser's IndexedDB for this site and refreshing.
          </p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Loading vault…</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/app" element={<Layout />}>
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="holdings"  element={<HoldingsPage />} />
          <Route path="import"    element={<ImportPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="report"    element={<CapitalGainsPage />} />
          <Route path="coach"     element={<CoachPage />} />
          <Route path="activity"  element={<ActivityPage />} />
          <Route path="insurance" element={<InsurancePage />} />
          <Route path="loans"     element={<InsurancePage />} />
          <Route path="settings"  element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
