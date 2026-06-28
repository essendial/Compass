/**
 * TopBar — the fixed app header.
 * Shows the brand, a breadcrumb (workspace / active flow name), a mobile menu
 * toggle, and a (currently non-functional) search input.
 */
type Theme = "dark" | "light";

interface Props {
  activeFlowName: string | null;
  onToggleMenu: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

export default function TopBar({ activeFlowName, onToggleMenu, theme, onToggleTheme }: Props) {
  return (
    <header className="topbar">
      <button
        className="iconbtn menu-toggle"
        onClick={onToggleMenu}
        aria-label="Toggle menu"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
        /q
      </button>
      {/* Brand mark + product name. */}
      <div className="brand">
        <span className="mark">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          >
            <path d="M5 12h6M13 6h6M13 18h6M11 12l2-6M11 12l2 6" />
          </svg>
        </span>
        FlowDoc
      </div>
      {/* Breadcrumb: static workspace segment + the active flow name (or prompt). */}
      <div className="crumbs">
        <span>CRM</span>
        <span className="sep">/</span>
        <b>{activeFlowName ?? "Select a workflow"}</b>
      </div>
      <div className="spacer"></div>
      {/* Theme toggle: switches between dark + light CSS themes. */}
      <button
        className="iconbtn theme-toggle"
        onClick={onToggleTheme}
        aria-label={
          theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
        }
        title={
          theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
        }
      >
        {theme === "dark" ? (
          /* Sun: shown in dark mode, click to go light. */
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
        ) : (
          /* Moon: shown in light mode, click to go dark. */
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>
      {/* Search input is presentational only; no wired-up handler yet. */}
      <div className="search">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input placeholder="Search steps…" aria-label="Search steps" />
      </div>
    </header>
  );
}
