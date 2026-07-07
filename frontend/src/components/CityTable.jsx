import { CREATIVES, creativeLabel } from "../creatives.js";

function formatTime(iso) {
  if (!iso) return "never";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function HealthPill({ status }) {
  const map = {
    OK: { label: "Healthy", cls: "pill pill--ok" },
    STALE: { label: "Stale", cls: "pill pill--warn" },
    ERROR: { label: "Error", cls: "pill pill--error" },
    UNKNOWN: { label: "Awaiting sync", cls: "pill pill--muted" },
  };
  const { label, cls } = map[status] ?? map.UNKNOWN;
  return <span className={cls}>{label}</span>;
}

export default function CityTable({ cities, onSelectCity }) {
  return (
    <table className="city-table">
      <thead>
        <tr>
          <th>City</th>
          <th>Temp</th>
          <th>Rain</th>
          <th>Active creative</th>
          <th>Reason</th>
          <th>Mode</th>
          <th>Health</th>
          <th>Last updated</th>
          <th aria-label="actions"></th>
        </tr>
      </thead>
      <tbody>
        {cities.map((c) => {
          const creative = CREATIVES[c.activeCreativeId];
          return (
            <tr key={c.city}>
              <td className="city-table__city">
                <button className="link-button" onClick={() => onSelectCity(c.city)}>
                  {c.city}
                </button>
              </td>
              <td>{c.temperature != null ? `${c.temperature.toFixed(1)}°C` : "—"}</td>
              <td>{c.rainfall != null ? `${c.rainfall.toFixed(1)}mm` : "—"}</td>
              <td>
                <span className="creative-chip" style={{ "--swatch": creative?.swatch }}>
                  <span className="creative-chip__icon">{creative?.icon}</span>
                  {creativeLabel(c.activeCreativeId)}
                </span>
              </td>
              <td className="city-table__reason" title={c.reason}>
                {c.reason || "—"}
              </td>
              <td>
                <span className={`mode-tag mode-tag--${c.mode?.toLowerCase()}`}>{c.mode}</span>
              </td>
              <td>
                <HealthPill status={c.healthStatus} />
              </td>
              <td>{formatTime(c.lastSyncedAt)}</td>
              <td>
                <button className="btn btn--ghost btn--small" onClick={() => onSelectCity(c.city)}>
                  Details
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
