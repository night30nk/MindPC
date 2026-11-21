import { CATEGORIES, CATEGORY_ORDER, isSite } from "../api";

const ICONS = {
  today: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  week: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  apps: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  settings: '<path d="M5 8h14M5 16h14"/><circle cx="9" cy="8" r="2"/><circle cx="15" cy="16" r="2"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.3 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.3-3.8-8.5S9.4 5.9 12 3.5z"/>',
  left: '<path d="M14.5 6l-6 6 6 6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  down: '<path d="M6.5 9.5l5.5 5.5 5.5-5.5"/>',
};

export function Icon({ name, className = "w-[18px] h-[18px]" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} shrink-0`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}

export function Card({ title, action, children, className = "" }) {
  return (
    <section className={`bg-surface rounded-[20px] shadow-card p-5 sm:p-6 min-w-0 ${className}`}>
      {(title || action) && (
        <div className={`flex items-center ${title ? "justify-between" : "justify-end"} gap-3 flex-wrap mb-4`}>
          {title && <h2 className="text-[13px] font-semibold text-muted tracking-wide">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex bg-surface2 rounded-[10px] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-3.5 py-1.5 rounded-[8px] text-[13px] font-semibold transition-colors ${
            value === o.value ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({ children, variant = "default", className = "", ...props }) {
  const styles = {
    default: "bg-surface border border-line hover:bg-surface2 text-fg",
    primary: "bg-accent text-accent-fg hover:opacity-90 border border-transparent",
    danger: "bg-surface border border-line text-dis hover:bg-surface2",
  };
  return (
    <button
      type="button"
      className={`px-3.5 py-1.5 rounded-[10px] text-[13px] font-semibold transition-colors disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? "bg-accent" : "bg-line"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

function hue(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

// A coloured letter for an app, or a globe for a website.
export function Avatar({ entry, size = 30 }) {
  const dim = { width: size, height: size };
  if (isSite(entry)) {
    return (
      <div
        title="Website"
        style={dim}
        className="grid place-items-center rounded-[9px] bg-surface2 border border-line text-accent shrink-0"
      >
        <Icon name="globe" className="w-4 h-4" />
      </div>
    );
  }
  const h = hue(entry.name);
  return (
    <div
      style={{
        ...dim,
        background: `hsl(${h} 45% var(--av-bg-l))`,
        color: `hsl(${h} 45% var(--av-fg-l))`,
        fontSize: size * 0.43,
      }}
      className="grid place-items-center rounded-[9px] font-bold shrink-0"
      aria-hidden="true"
    >
      {entry.name.charAt(0).toUpperCase()}
    </div>
  );
}

// A native select, dressed as a category chip, so it works with keyboard and screen readers.
export function CategorySelect({ value, onChange, name }) {
  return (
    <label className="relative inline-flex items-center gap-1.5 rounded-full border border-line bg-surface pl-2.5 pr-1 py-0.5 text-xs font-medium">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CATEGORIES[value].color }} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Category for ${name}`}
        className="appearance-none bg-transparent pr-4 cursor-pointer focus:outline-none"
      >
        {CATEGORY_ORDER.map((key) => (
          <option key={key} value={key}>
            {CATEGORIES[key].label}
          </option>
        ))}
      </select>
      <Icon name="down" className="pointer-events-none absolute right-1.5 w-3 h-3 text-muted" />
    </label>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-10 px-4 border border-dashed border-line rounded-2xl">
      <p className="font-semibold">{title}</p>
      {children && <p className="text-muted text-sm max-w-md">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ message, onRetry }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-dis/40 bg-dis/10 px-4 py-3 text-sm">
      <span>{message}</span>
      {onRetry && (
        <Button onClick={onRetry} className="!py-1">
          Retry
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse bg-surface2 rounded-2xl ${className}`} />;
}
