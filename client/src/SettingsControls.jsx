/**
 * Small presentational building blocks shared across the Settings screen.
 *
 * They hold no preference logic of their own — each one takes a value and a
 * change handler — so a control can never drift out of step with the store
 * that actually persists it.
 */

import { CircleCheckBig, CircleX, CircleAlert, LoaderCircle } from "lucide-react";

export function SettingsCard({ id, icon: Icon, title, meta, children }) {
  return (
    <section className="ks-card" id={id}>
      <div className="ks-card__head">
        {Icon && <Icon size={15} strokeWidth={1.8} />}
        <h2>{title}</h2>
        {meta}
      </div>
      {children}
    </section>
  );
}

export function SettingRow({ title, hint, children, stacked = false }) {
  return (
    <div className={`ks-row${stacked ? " ks-row--stacked" : ""}`}>
      <div className="ks-row__text">
        <strong>{title}</strong>
        {hint && <span>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`ks-toggle${checked ? " is-on" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

/**
 * Radio group rendered as a segmented control. Options are
 * `{ value, label }`; equality is strict, so numeric values stay numeric.
 */
export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="ks-seg" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={String(option.value)}
          role="radio"
          aria-checked={value === option.value}
          className={`ks-seg__btn${value === option.value ? " is-on" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const PILL_ICONS = {
  ok: CircleCheckBig,
  bad: CircleX,
  warn: CircleAlert,
  busy: LoaderCircle,
};

const PILL_CLASS = {
  ok: "ks-chip--green",
  bad: "ks-chip--red",
  warn: "ks-chip--amber",
  busy: "ks-chip--ghost",
  idle: "ks-chip--ghost",
};

/** `state` is one of ok | bad | warn | busy | idle. */
export function StatusPill({ state = "idle", children, title }) {
  const Icon = PILL_ICONS[state];

  return (
    <span className={`ks-chip ${PILL_CLASS[state] || "ks-chip--ghost"}`} title={title}>
      {Icon && (
        <Icon size={12} strokeWidth={2} className={state === "busy" ? "ks-spin" : undefined} />
      )}
      {children}
    </span>
  );
}

/** Monospaced read-only value, for coordinates, intervals and versions. */
export function Readout({ children, muted = false }) {
  return <span className={`ks-mono${muted ? " ks-pending" : ""}`}>{children}</span>;
}
