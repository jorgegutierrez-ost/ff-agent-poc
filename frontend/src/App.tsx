import { useState, useEffect, useCallback } from 'react';
import NavSidebar from './components/NavSidebar';
import PatientListPage from './components/PatientListPage';
import VisitPage from './components/VisitPage';
import { useChat } from './hooks/useChat';
import { MOCK_PATIENTS, MOCK_VISITS } from './mockData';
import { API_BASE } from './config';
import type { Patient, Visit } from './types';

type Page = 'patients' | 'visit';

export default function App() {
  const [patients, setPatients] = useState<Patient[]>(MOCK_PATIENTS);
  const [visits, setVisits] = useState<Visit[]>(MOCK_VISITS);
  const [page, setPage] = useState<Page>('patients');
  const [activePatientId, setActivePatientId] = useState<string | null>(null);

  const {
    messages,
    isStreaming,
    activeToolCall,
    connectAndStartVisit,
    sendMessage,
  } = useChat();

  // Try to fetch from backend, fall back to mock data
  useEffect(() => {
    fetch(`${API_BASE}/api/patients`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setPatients)
      .catch(() => setPatients(MOCK_PATIENTS));

    fetch(`${API_BASE}/api/visits`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setVisits)
      .catch(() => setVisits(MOCK_VISITS));
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

  const activePatient = patients.find((p) => p.id === activePatientId) ?? null;
  const activeVisit = visits.find((v) => v.patient_id === activePatientId) ?? null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white font-sans text-gray-900 antialiased">
      <NavSidebar activePage={page} />

      {page === 'patients' && (
        <PatientListPage
          patients={patients}
          visits={visits}
          onBeginVisit={handleBeginVisit}
        />
      )}

      {page === 'visit' && activePatient && activeVisit && (
        <VisitPage
          patient={activePatient}
          visit={activeVisit}
          messages={messages}
          isStreaming={isStreaming}
          activeToolCall={activeToolCall}
          onSendMessage={sendMessage}
          onGoBack={handleGoBack}
        />
      )}
    </div>
  );
}
