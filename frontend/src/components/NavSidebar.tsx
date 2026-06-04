type NavTarget = 'patients' | 'past_visits';

interface NavSidebarProps {
  activePage: 'patients' | 'visit' | 'past_visits';
  onNavigate: (target: NavTarget) => void;
  /** Total count of items needing the nurse's attention, surfaced as
   *  a notification badge on the Home icon. Hidden when zero. */
  attentionCount?: number;
}

// Field Notes nav — dark column at ~88px wide with icon + label buttons
// and an orange logo at top, avatar puck at bottom. Active state uses a
// soft white-tint pill; a notification badge sits on the Home icon when
// the nurse has outstanding items from past shifts.
export default function NavSidebar({ activePage, onNavigate, attentionCount = 0 }: NavSidebarProps) {
  const isHome = activePage === 'patients' || activePage === 'visit';
  const isPast = activePage === 'past_visits';

  const navItem = (active: boolean) =>
    `relative flex w-16 flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-medium transition-colors ${
      active ? 'bg-white/10 text-white' : 'text-white/45 hover:bg-white/5 hover:text-white/80'
    }`;

  return (
    <div
      className="flex h-full w-[88px] shrink-0 flex-col items-center justify-between bg-[#1B1B1B] py-5 text-white"
    >
      {/* Logo + nav */}
      <div className="flex flex-col items-center gap-6">
        {/* fn logo */}
        <div
          className="cairo flex h-10 w-10 items-center justify-center rounded-xl bg-[#FD593E] text-sm font-bold text-white"
          aria-label="Family First"
        >
          fn
        </div>

        <nav className="flex flex-col items-center gap-1.5" aria-label="Primary">
          <button
            onClick={() => onNavigate('patients')}
            className={navItem(isHome)}
            title="Home"
            aria-label="Home"
          >
            <span className="relative">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
              </svg>
              {attentionCount > 0 && (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FD593E] px-1 text-[10px] font-semibold text-white ring-2 ring-[#1B1B1B]">
                  {attentionCount}
                </span>
              )}
            </span>
            <span>Home</span>
          </button>

          <button
            className={navItem(false)}
            title="Today"
            aria-label="Today"
            disabled
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008Z" />
            </svg>
            <span>Today</span>
          </button>

          <button
            className={navItem(false)}
            title="Week"
            aria-label="Week"
            disabled
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <span>Week</span>
          </button>

          <button
            onClick={() => onNavigate('past_visits')}
            className={navItem(isPast)}
            title="Patients"
            aria-label="Patients"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
            <span>Patients</span>
          </button>
        </nav>
      </div>

      {/* Avatar puck */}
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ECEFF8] text-xs font-semibold text-[#4A5E9A]"
        aria-label="Sarah Nguyen"
      >
        SN
      </div>
    </div>
  );
}
