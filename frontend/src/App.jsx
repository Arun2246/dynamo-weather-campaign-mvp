import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import CityTable from "./components/CityTable.jsx";
import DetailsDrawer from "./components/DetailsDrawer.jsx";
import StatusBar from "./components/StatusBar.jsx";

export default function App() {
  const [cities, setCities] = useState([]);
  const [systemStatus, setSystemStatus] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getCampaigns();
      setCities(data.cities);
      setSystemStatus(data.systemStatus);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Poll the dashboard every 30s so changes made by the scheduler (or by
    // another operator) show up without a manual refresh.
    const handle = setInterval(load, 30_000);
    return () => clearInterval(handle);
  }, [load]);

  async function handleSync() {
    setSyncing(true);
    try {
      await api.triggerSync();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  const selectedCityData = cities.find((c) => c.city === selectedCity) ?? null;

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>DynaMo</h1>
          <p className="app__subtitle">CoolSip Summer 2026 — context-aware campaign control</p>
        </div>
      </header>

      <StatusBar status={systemStatus} onSync={handleSync} syncing={syncing} />

      {error && <div className="banner banner--error">Couldn't reach the backend: {error}</div>}

      {loading ? (
        <p className="app__loading">Loading campaign data…</p>
      ) : (
        <CityTable cities={cities} onSelectCity={setSelectedCity} />
      )}

      {selectedCityData && (
        <DetailsDrawer
          cityData={selectedCityData}
          onClose={() => setSelectedCity(null)}
          onChanged={load}
        />
      )}

      <footer className="app__footer">
        DynaMo MVP · decisions re-evaluate automatically every 15 minutes, or on demand above.
      </footer>
    </div>
  );
}
