import { useState, useEffect, useCallback } from 'react';
import PatientListPage from './components/PatientListPage';
import VisitPage from './components/VisitPage';
import PastVisitsPage from './components/PastVisitsPage';
import NavSidebar from './components/NavSidebar';
import { useChat } from './hooks/useChat';
import { API_BASE } from './config';
import type { Patient, Visit } from './types';

type Page = 'patients' | 'visit' | 'past_visits';

export default function App() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [page, setPage] = useState<Page>('patients');
  const [activePatientId, setActivePatientId] = useState<string | null>(null);

  const {
    messages,
    isStreaming,
    activeToolCall,
    lastLoadedMsgId,
    connectAndStartVisit,
    sendMessage,
    onToolCall,
  } = useChat();

  useEffect(() => {
    fetch(`${API_BASE}/api/patients`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setPatients)
      .catch(() => {});

    fetch(`${API_BASE}/api/visits`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setVisits)
      .catch(() => {});
  }, []);

  const handleBeginVisit = useCallback(
    (patientId: string) => {
      setActivePatientId(patientId);
      setPage('visit');

      const visit = visits.find((v) => v.patient_id === patientId);
      if (visit) {
        connectAndStartVisit(visit.id, patientId);
      }
    },
    [visits, connectAndStartVisit],
  );

  const handleGoBack = useCallback(() => {
    setPage('patients');
    setActivePatientId(null);
  }, []);

  const handleNavigate = useCallback((target: 'patients' | 'past_visits') => {
    setPage(target);
    if (target === 'patients') setActivePatientId(null);
  }, []);

  const activePatient = patients.find((p) => p.id === activePatientId) ?? null;
  const activeVisit = visits.find((v) => v.patient_id === activePatientId) ?? null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white font-sans text-gray-900 antialiased">
      <NavSidebar activePage={page} onNavigate={handleNavigate} />

      {page === 'patients' && (
        <PatientListPage
          patients={patients}
          visits={visits}
          onBeginVisit={handleBeginVisit}
        />
      )}

      {page === 'past_visits' && (
        <PastVisitsPage patients={patients} />
      )}

      {page === 'visit' && activePatient && activeVisit && (
        <VisitPage
          patient={activePatient}
          visit={activeVisit}
          messages={messages}
          isStreaming={isStreaming}
          activeToolCall={activeToolCall}
          lastLoadedMsgId={lastLoadedMsgId}
          onSendMessage={sendMessage}
          onToolCall={onToolCall}
          onGoBack={handleGoBack}
        />
      )}
    </div>
  );
}
