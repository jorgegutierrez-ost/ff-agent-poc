import { useState, useRef, useCallback } from 'react';
import type {
  ChatMessage,
  VisitSummaryData,
  VitalsData,
  InterventionData,
  MedicationData,
  NarrativeData,
  ServerMessage,
} from '../types';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);
  const [summary, setSummary] = useState<VisitSummaryData>({
    vitals: null,
    interventions: [],
    medications: [],
    narrative: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const streamBufferRef = useRef('');
  const activeVisitIdRef = useRef<string | null>(null);

  const resetChat = useCallback(() => {
    setMessages([]);
    setIsStreaming(false);
    setActiveToolCall(null);
    setSummary({ vitals: null, interventions: [], medications: [], narrative: null });
    streamBufferRef.current = '';
  }, []);

  // Load chat history and visit summary from the backend
  const loadHistory = useCallback(async (visitId: string): Promise<boolean> => {
    try {
      const [historyRes, summaryRes] = await Promise.all([
        fetch(`/api/visits/${visitId}/history`),
        fetch(`/api/visits/${visitId}/summary`),
      ]);

      let hasHistory = false;

      if (historyRes.ok) {
        const history: Array<{ id: string; role: 'nurse' | 'agent'; content: string; timestamp: string }> =
          await historyRes.json();

        // Filter out the synthetic "The visit has started" message
        const filtered = history.filter(
          (m) => !(m.role === 'nurse' && m.content === 'The visit has started. Please greet me and begin.'),
        );

        if (filtered.length > 0) {
          hasHistory = true;
          setMessages(
            filtered.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              timestamp: new Date(m.timestamp),
            })),
          );
        }
      }

      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary({
          vitals: data.vitals ?? null,
          interventions: data.interventions ?? [],
          medications: data.medications ?? [],
          narrative: data.narrative ?? null,
        });
      }

      return hasHistory;
    } catch {
      return false;
    }
  }, []);

  const connectAndStartVisit = useCallback(
    async (visitId: string, patientId: string) => {
      // Close existing connection
      if (wsRef.current) {
        wsRef.current.close();
      }

      resetChat();
      activeVisitIdRef.current = visitId;

      // Try loading existing history first
      const hasHistory = await loadHistory(visitId);

      // Connect WebSocket
      let ws: WebSocket;
      try {
        ws = new WebSocket(WS_URL);
      } catch {
        if (!hasHistory) {
          mockStartVisit(patientId);
        }
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        if (!hasHistory) {
          // First time — trigger the agent greeting
          ws.send(JSON.stringify({ type: 'start_visit', visitId, patientId }));
        }
        // If history exists, just keep the WS open for future messages
      };

      ws.onmessage = (event) => {
        const msg: ServerMessage = JSON.parse(event.data);
        handleServerMessage(msg);
      };

      ws.onerror = () => {
        if (!hasHistory) {
          mockStartVisit(patientId);
        }
      };

      ws.onclose = () => {
        setIsStreaming(false);
      };
    },
    [resetChat, loadHistory],
  );

  const handleServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'token':
        setIsStreaming(true);
        streamBufferRef.current += msg.content;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'agent' && last.id.startsWith('stream-')) {
            return [
              ...prev.slice(0, -1),
              { ...last, content: streamBufferRef.current },
            ];
          }
          return [
            ...prev,
            {
              id: `stream-${Date.now()}`,
              role: 'agent',
              content: streamBufferRef.current,
              timestamp: new Date(),
            },
          ];
        });
        break;

      case 'tool_call':
        setActiveToolCall(formatToolName(msg.tool));
        applyToolCall(msg.tool, msg.input);
        break;

      case 'tool_result':
        setActiveToolCall(null);
        break;

      case 'done':
        setIsStreaming(false);
        streamBufferRef.current = '';
        break;

      case 'error':
        setIsStreaming(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'agent',
            content: `Something went wrong: ${msg.message}`,
            timestamp: new Date(),
          },
        ]);
        break;
    }
  }, []);

  const applyToolCall = useCallback(
    (tool: string, input: Record<string, unknown>) => {
      setSummary((prev) => {
        switch (tool) {
          case 'log_vitals': {
            const { visit_id: _, ...vitals } = input;
            return { ...prev, vitals: vitals as unknown as VitalsData };
          }
          case 'log_intervention': {
            const { visit_id: _, ...intervention } = input;
            return {
              ...prev,
              interventions: [
                ...prev.interventions,
                intervention as unknown as InterventionData,
              ],
            };
          }
          case 'log_medication': {
            const { visit_id: _, ...medication } = input;
            return {
              ...prev,
              medications: [
                ...prev.medications,
                medication as unknown as MedicationData,
              ],
            };
          }
          case 'update_narrative': {
            const { visit_id: _, ...narrative } = input;
            return { ...prev, narrative: narrative as unknown as NarrativeData };
          }
          default:
            return prev;
        }
      });
    },
    [],
  );

  const sendMessage = useCallback((content: string) => {
    if (!content.trim()) return;

    // Add nurse message immediately
    setMessages((prev) => [
      ...prev,
      {
        id: `nurse-${Date.now()}`,
        role: 'nurse',
        content: content.trim(),
        timestamp: new Date(),
      },
    ]);

    streamBufferRef.current = '';

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'message',
          visitId: activeVisitIdRef.current,
          content: content.trim(),
        }),
      );
    } else {
      mockAgentReply(content.trim());
    }
  }, []);

  // --- Mock helpers for when backend is unavailable ---

  const mockStartVisit = useCallback((patientId: string) => {
    setIsStreaming(true);
    const patientNames: Record<string, string> = {
      '10000000-0000-0000-0000-000000000001': 'Carlos Mendoza',
      '10000000-0000-0000-0000-000000000002': 'Dorothy Hargrove',
      '10000000-0000-0000-0000-000000000003': "Liam O'Brien",
    };
    const name = patientNames[patientId] || 'this patient';
    const greeting = `Good morning! I see you're visiting ${name} today. Let's get the visit documented. Can you start by telling me the vital signs you've taken?`;
    streamMockMessage(greeting);
  }, []);

  const mockAgentReply = useCallback((nurseMsg: string) => {
    setIsStreaming(true);
    const lower = nurseMsg.toLowerCase();

    if (lower.includes('bp') || lower.includes('blood pressure') || lower.includes('vitals') || lower.includes('heart rate') || lower.includes('temp')) {
      setTimeout(() => {
        setActiveToolCall('Logging vitals');
        setSummary((prev) => ({
          ...prev,
          vitals: { bp_systolic: 118, bp_diastolic: 76, heart_rate: 92, temperature_f: 98.6, o2_saturation: 97, respiratory_rate: 18, pain_score: 2 },
        }));
        setTimeout(() => setActiveToolCall(null), 500);
      }, 300);
      streamMockMessage("Got it - I've logged those vitals. Everything looks within normal range. Now, were there any interventions or procedures you performed during this visit?");
    } else {
      streamMockMessage("I've noted that. What else can I help document for this visit?");
    }
  }, []);

  const streamMockMessage = useCallback((text: string) => {
    streamBufferRef.current = '';
    const id = `stream-${Date.now()}`;
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        const chunkSize = Math.floor(Math.random() * 3) + 1;
        streamBufferRef.current += text.slice(i, i + chunkSize);
        i += chunkSize;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.id === id) {
            return [...prev.slice(0, -1), { ...last, content: streamBufferRef.current }];
          }
          return [...prev, { id, role: 'agent' as const, content: streamBufferRef.current, timestamp: new Date() }];
        });
      } else {
        clearInterval(interval);
        setIsStreaming(false);
        streamBufferRef.current = '';
      }
    }, 20);
  }, []);

  const progress = calculateProgress(summary);

  return {
    messages,
    isStreaming,
    activeToolCall,
    summary,
    progress,
    connectAndStartVisit,
    sendMessage,
    resetChat,
  };
}

function formatToolName(tool: string): string {
  const names: Record<string, string> = {
    log_vitals: 'Logging vitals',
    log_intervention: 'Logging intervention',
    log_medication: 'Logging medication',
    update_narrative: 'Updating narrative',
  };
  return names[tool] || tool;
}

function calculateProgress(summary: VisitSummaryData): number {
  let filled = 0;
  if (summary.vitals) filled++;
  if (summary.interventions.length > 0) filled++;
  if (summary.medications.length > 0) filled++;
  if (summary.narrative) filled++;
  return Math.round((filled / 4) * 100);
}
