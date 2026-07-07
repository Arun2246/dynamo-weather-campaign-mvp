function formatDateTime(iso) {
  if (!iso) return "never";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StatusBar({ status, onSync, syncing }) {
  const health = status?.healthStatus ?? "UNKNOWN";
  const isError = health === "ERROR";

  return (
    <div className={`status-bar ${isError ? "status-bar--error" : ""}`}>
      <div className="status-bar__info">
        <span className={`status-dot status-dot--${health.toLowerCase()}`} />
        <span>
          Weather provider: <strong>{status?.provider ?? "open-meteo"}</strong> · Last successful
          sync: <strong>{formatDateTime(status?.lastSuccessfulSync)}</strong>
        </span>
        {isError && status?.lastErrorMessage && (
          <span className="status-bar__error-detail">— {status.lastErrorMessage}</span>
        )}
      </div>
      <button className="btn btn--primary btn--small" onClick={onSync} disabled={syncing}>
        {syncing ? "Syncing…" : "Sync weather now"}
      </button>
    </div>
  );
}
