type NavTarget = 'patients' | 'past_visits';

interface NavSidebarProps {
  activePage: 'patients' | 'visit' | 'past_visits';
  onNavigate: (target: NavTarget) => void;
}

export default function NavSidebar({ activePage, onNavigate }: NavSidebarProps) {
  const itemClass = (active: boolean) =>
    `flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
      active
        ? 'bg-gray-100 text-gray-900'
        : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
    }`;

  return (
    <div className="flex h-full w-14 shrink-0 flex-col items-center border-r border-gray-200 bg-white py-4">
      <div className="mb-6 flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500 text-xs font-bold text-white">
        fn
      </div>

      <nav className="flex flex-1 flex-col items-center gap-1">
        <button
          onClick={() => onNavigate('patients')}
          className={itemClass(activePage === 'patients' || activePage === 'visit')}
          title="Today's Schedule"
          aria-label="Today's schedule"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
          </svg>
        </button>

        <button
          onClick={() => onNavigate('past_visits')}
          className={itemClass(activePage === 'past_visits')}
          title="Past Visits"
          aria-label="Past visits"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 2m6-2a9 9 0 1 1-3.87-7.4M21 4v5h-5" />
          </svg>
        </button>
      </nav>

      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700">
        SN
      </div>
    </div>
  );
}
