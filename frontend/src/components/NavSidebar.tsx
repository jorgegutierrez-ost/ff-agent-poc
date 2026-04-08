interface NavSidebarProps {
  activePage: 'patients' | 'visit';
}

export default function NavSidebar({ activePage }: NavSidebarProps) {
  return (
    <div className="flex h-full w-14 shrink-0 flex-col items-center border-r border-gray-200 bg-white py-4">
      {/* Logo / brand mark */}
      <div className="mb-6 flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500 text-xs font-bold text-white">
        fn
      </div>

      {/* Nav icons */}
      <nav className="flex flex-1 flex-col items-center gap-1">
        {/* Schedule / grid */}
        <button
          className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
            activePage === 'patients'
              ? 'bg-gray-100 text-gray-900'
              : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
          }`}
          title="Today's Schedule"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
          </svg>
        </button>

        {/* Patients */}
        <button
          className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
          title="Patients"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
        </button>

        {/* AI Assistant */}
        <button
          className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
            activePage === 'visit'
              ? 'bg-gray-100 text-gray-900'
              : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
          }`}
          title="AI Assistant"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
          </svg>
        </button>
      </nav>

      {/* Nurse avatar at bottom */}
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700">
        SN
      </div>
    </div>
  );
}
