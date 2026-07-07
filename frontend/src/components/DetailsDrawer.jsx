import { useEffect, useState } from "react";
import { api } from "../api.js";
import { CREATIVES, creativeLabel } from "../creatives.js";

function formatDateTime(iso) {
  if (!iso) return "never";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DetailsDrawer({ cityData, onClose, onChanged }) {
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingHistory(true);
    api
      .getHistory(cityData.city)
      .then((data) => {
        if (!cancelled) setHistory(data.history);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoadingHistory(false));
    return () => {
      cancelled = true;
    };
  }, [cityData.city]);

  async function handleOverride(creativeId) {
    setBusy(true);
    setError(null);
    try {
      await api.override(cityData.city, creativeId);
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResume() {
    setBusy(true);
    setError(null);
    try {
      await api.resumeAutomation(cityData.city);
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer__header">
          <h2>{cityData.city}</h2>
          <button className="btn btn--ghost btn--small" onClick={onClose}>
            Close
          </button>
        </div>

        {error && <div className="banner banner--error">{error}</div>}

        <section className="drawer__section">
          <h3>Current weather</h3>
          <div className="stat-grid">
            <div>
              <span className="stat-grid__label">Temperature</span>
              <span className="stat-grid__value">
                {cityData.temperature != null ? `${cityData.temperature.toFixed(1)}°C` : "—"}
              </span>
            </div>
            <div>
              <span className="stat-grid__label">Rainfall</span>
              <span className="stat-grid__value">
                {cityData.rainfall != null ? `${cityData.rainfall.toFixed(1)}mm` : "—"}
              </span>
            </div>
            <div>
              <span className="stat-grid__label">Last synced</span>
              <span className="stat-grid__value">{formatDateTime(cityData.lastSyncedAt)}</span>
            </div>
          </div>
        </section>

        <section className="drawer__section">
          <h3>Current decision</h3>
          <p className="decision-line">
            Running <strong>{creativeLabel(cityData.activeCreativeId)}</strong>
          </p>
          <p className="decision-reason">{cityData.reason}</p>
        </section>

        <section className="drawer__section">
          <h3>Line items in {cityData.city}</h3>
          <ul className="line-item-list">
            {cityData.lineItems.map((li) => (
              <li key={li.lineItemId} className={`line-item line-item--${li.state.toLowerCase()}`}>
                <span className="line-item__id">{li.lineItemId}</span>
                <span>{li.creativeName}</span>
                <span className={`state-dot state-dot--${li.state.toLowerCase()}`}>{li.state}</span>
                <span className="line-item__meta">
                  ₹{li.bid} bid · ₹{li.dailyBudget}/day
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="drawer__section">
          <h3>Manual control</h3>
          {cityData.mode === "MANUAL" ? (
            <>
              <p className="drawer__hint">
                Automation is paused for {cityData.city}. Weather changes won't switch creatives
                until you resume automation.
              </p>
              <button className="btn btn--primary" disabled={busy} onClick={handleResume}>
                Resume automation
              </button>
            </>
          ) : (
            <p className="drawer__hint">
              Override switches this city to manual mode and pauses automation until resumed.
            </p>
          )}
          <div className="override-buttons">
            {Object.entries(CREATIVES).map(([id, meta]) => (
              <button
                key={id}
                className="btn btn--ghost btn--small"
                disabled={busy || cityData.activeCreativeId === id}
                onClick={() => handleOverride(id)}
              >
                {meta.icon} Force {meta.name}
              </button>
            ))}
          </div>
        </section>

        <section className="drawer__section">
          <h3>Decision history</h3>
          {loadingHistory && <p className="drawer__hint">Loading…</p>}
          {!loadingHistory && history.length === 0 && (
            <p className="drawer__hint">No transitions logged yet for this city.</p>
          )}
          <ul className="history-list">
            {history.map((h) => (
              <li key={h.id}>
                <div className="history-list__row">
                  <span className="history-list__time">{formatDateTime(h.timestamp)}</span>
                  <span className={`source-tag source-tag--${h.triggerSource.toLowerCase()}`}>
                    {h.triggerSource}
                  </span>
                  <span>
                    {h.previousCreativeId ? creativeLabel(h.previousCreativeId) : "—"} →{" "}
                    <strong>{creativeLabel(h.selectedCreativeId)}</strong>
                  </span>
                </div>
                <div className="history-list__reason">{h.reason}</div>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
