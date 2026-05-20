import type { WebSocket } from 'ws';
import {
  getVisitWithPatient,
  getConversationHistory,
  saveMessage,
  getScheduledTasks,
  getPrnOrders,
  getPatientRecentBrief,
  getPendingOrderChanges,
  getHeadToToe,
  getChangeOrdersForPatient,
} from '../db/queries';
import { runAgentLoop } from '../agent/agentLoop';
import { buildRecapHighlights, renderHighlightsForPrompt } from '../agent/recapHighlights';

// Track active connections per visitId
const activeConnections = new Map<string, WebSocket>();

function sendError(ws: WebSocket, message: string): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type: 'error', message }));
  }
}

export function handleWebSocket(ws: WebSocket): void {
  console.log('[ws] Client connected');

  ws.on('message', async (raw) => {
    let msg: { type: string; visitId?: string; patientId?: string; content?: string };

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      sendError(ws, 'Invalid JSON');
      return;
    }

    try {
      switch (msg.type) {
        case 'start_visit': {
          const { visitId } = msg;
          if (!visitId) {
            sendError(ws, 'Missing visitId');
            return;
          }

          // Close existing connection for this visit
          const existing = activeConnections.get(visitId);
          if (existing && existing !== ws && existing.readyState === existing.OPEN) {
            existing.close(1000, 'Replaced by new connection');
          }
          activeConnections.set(visitId, ws);

          // Load visit + patient
          const data = await getVisitWithPatient(visitId);
          if (!data) {
            sendError(ws, 'Visit not found');
            return;
          }

          // Load conversation history + care plan + recent-history brief
          const [history, scheduledTasks, prnOrders, recentBrief, pendingChanges, h2t, activeChangeOrders] = await Promise.all([
            getConversationHistory(visitId),
            getScheduledTasks(data.patient.id),
            getPrnOrders(data.patient.id),
            getPatientRecentBrief(data.patient.id, { excludeVisitId: visitId }),
            getPendingOrderChanges(data.patient.id),
            getHeadToToe(visitId),
            getChangeOrdersForPatient(data.patient.id, { status: 'pending_signature' }),
          ]);

          const highlights = buildRecapHighlights(
            recentBrief,
            data.patient,
            prnOrders.map((o) => o.medication),
          );
          const highlightsBlock = renderHighlightsForPrompt(highlights);

          // Run agent loop — will stream the opening greeting
          await runAgentLoop(
            ws,
            visitId,
            data.patient,
            data.visit,
            history,
            scheduledTasks,
            prnOrders,
            highlightsBlock,
            pendingChanges,
            h2t,
            activeChangeOrders,
          );
          break;
        }

        case 'message': {
          const { visitId, content } = msg;
          if (!visitId || !content) {
            sendError(ws, 'Missing visitId or content');
            return;
          }

          // Update active connection
          activeConnections.set(visitId, ws);

          // Save nurse message
          await saveMessage(visitId, 'user', content);

          // Load everything
          const data = await getVisitWithPatient(visitId);
          if (!data) {
            sendError(ws, 'Visit not found');
            return;
          }

          const [history, scheduledTasks, prnOrders, recentBrief, pendingChanges, h2t, activeChangeOrders] = await Promise.all([
            getConversationHistory(visitId),
            getScheduledTasks(data.patient.id),
            getPrnOrders(data.patient.id),
            getPatientRecentBrief(data.patient.id, { excludeVisitId: visitId }),
            getPendingOrderChanges(data.patient.id),
            getHeadToToe(visitId),
            getChangeOrdersForPatient(data.patient.id, { status: 'pending_signature' }),
          ]);

          const highlights = buildRecapHighlights(
            recentBrief,
            data.patient,
            prnOrders.map((o) => o.medication),
          );
          const highlightsBlock = renderHighlightsForPrompt(highlights);

          // Run agent loop
          await runAgentLoop(
            ws,
            visitId,
            data.patient,
            data.visit,
            history,
            scheduledTasks,
            prnOrders,
            highlightsBlock,
            pendingChanges,
            h2t,
            activeChangeOrders,
          );
          break;
        }

        default:
          sendError(ws, `Unknown message type: ${msg.type}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[ws] Handler error:', errorMsg);
      sendError(ws, 'Internal server error');
    }
  });

  ws.on('close', () => {
    console.log('[ws] Client disconnected');
    // Clean up active connections
    for (const [visitId, conn] of activeConnections) {
      if (conn === ws) {
        activeConnections.delete(visitId);
      }
    }
  });
}
