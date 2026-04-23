import Anthropic from '@anthropic-ai/sdk';
import type { WebSocket } from 'ws';
import type { Patient, Visit, ConversationMessage } from '../types';
import {
  buildSystemPrompt,
  type ScheduledTaskForPrompt,
  type PrnOrderForPrompt,
} from './systemPrompt';
import { TOOL_DEFINITIONS, executeToolCall } from './tools';
import { saveMessage } from '../db/queries';

const anthropic = new Anthropic();

const NURSE_NAME = 'Sarah';

type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string;[key: string]: unknown }>;
};

/**
 * Convert our DB conversation rows into the Anthropic messages format.
 *
 * Key constraints:
 * - Messages must alternate user/assistant
 * - tool_result blocks must immediately follow the assistant message containing
 *   the matching tool_use block
 * - Multiple tool_results should be grouped into one user message
 */
function toAnthropicMessages(history: ConversationMessage[]): AnthropicMessage[] {
  const messages: AnthropicMessage[] = [];

  // Collect tool_use IDs from the current assistant message so we can
  // validate tool_results reference them
  let pendingToolUseIds = new Set<string>();

  for (const msg of history) {
    if (msg.role === 'user') {
      // If the last message is also a user, merge (Anthropic doesn't allow consecutive same-role)
      const last = messages[messages.length - 1];
      if (last && last.role === 'user' && typeof last.content === 'string') {
        last.content += '\n' + (msg.content ?? '');
      } else {
        messages.push({ role: 'user', content: msg.content ?? '' });
      }
      pendingToolUseIds.clear();
    } else if (msg.role === 'assistant') {
      if (msg.tool_name && msg.tool_input) {
        // This is a tool_use block — merge into the current assistant message
        const last = messages[messages.length - 1];
        const block = {
          type: 'tool_use',
          id: msg.id,
          name: msg.tool_name,
          input: msg.tool_input,
        };
        pendingToolUseIds.add(msg.id);

        if (last && last.role === 'assistant' && Array.isArray(last.content)) {
          last.content.push(block);
        } else if (last && last.role === 'assistant' && typeof last.content === 'string') {
          last.content = [{ type: 'text', text: last.content }, block];
        } else {
          messages.push({ role: 'assistant', content: [block] });
        }
      } else {
        // Plain text assistant message
        const last = messages[messages.length - 1];
        // If the previous assistant message had tool_use blocks and we also have text,
        // prepend the text as a text block
        if (last && last.role === 'assistant' && Array.isArray(last.content) && msg.content) {
          // This text came before or after tool_use in the same turn — add as text block
          last.content.unshift({ type: 'text', text: msg.content });
        } else {
          messages.push({ role: 'assistant', content: msg.content ?? '' });
        }
        pendingToolUseIds.clear();
      }
    } else if (msg.role === 'tool_result') {
      const toolUseId = msg.tool_name ?? msg.id;
      const resultBlock = {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: JSON.stringify(msg.tool_result ?? { success: true }),
      };

      // Group tool_results into one user message
      const last = messages[messages.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content) &&
          last.content.length > 0 && (last.content[0] as { type: string }).type === 'tool_result') {
        (last.content as Array<{ type: string; [key: string]: unknown }>).push(resultBlock);
      } else {
        messages.push({ role: 'user', content: [resultBlock] });
      }
    }
  }

  // Validation: strip any assistant message with tool_use blocks that don't have
  // matching tool_results immediately after, and any tool_results without preceding tool_use.
  // This handles corrupted history from crashed sessions.
  const validated: AnthropicMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];

    // Check if this assistant message contains tool_use blocks
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      const toolUseIds = (m.content as Array<{ type: string; id?: string }>)
        .filter((b) => b.type === 'tool_use' && b.id)
        .map((b) => b.id!);

      if (toolUseIds.length > 0) {
        // Look ahead: the next message must be a user message with matching tool_results
        const next = messages[i + 1];
        if (next && next.role === 'user' && Array.isArray(next.content)) {
          const resultIds = new Set(
            (next.content as Array<{ type: string; tool_use_id?: string }>)
              .filter((b) => b.type === 'tool_result')
              .map((b) => b.tool_use_id ?? ''),
          );
          const allMatched = toolUseIds.every((id) => resultIds.has(id));
          if (allMatched) {
            // Valid pair — keep both
            validated.push(m);
            validated.push(next);
            i++; // skip the next message since we already added it
            continue;
          }
        }
        // Missing or mismatched tool_results — strip the tool_use blocks,
        // keep only text content if any
        const textBlocks = (m.content as Array<{ type: string; text?: string }>)
          .filter((b) => b.type === 'text' && b.text);
        if (textBlocks.length > 0) {
          validated.push({
            role: 'assistant',
            content: textBlocks.length === 1 ? (textBlocks[0].text ?? '') : textBlocks,
          });
        }
        // Skip this message's tool_use and any orphaned tool_result that follows
        if (messages[i + 1]?.role === 'user' && Array.isArray(messages[i + 1]?.content)) {
          i++; // skip orphaned tool_result
        }
        continue;
      }
    }

    // Skip standalone tool_result messages that weren't consumed above
    if (m.role === 'user' && Array.isArray(m.content) &&
        (m.content as Array<{ type: string }>).some((b) => b.type === 'tool_result')) {
      const prev = validated[validated.length - 1];
      // Only valid if preceding message is assistant with tool_use (already handled above)
      if (!prev || prev.role !== 'assistant' || !Array.isArray(prev.content)) {
        continue; // orphaned — skip
      }
    }

    validated.push(m);
  }

  // Ensure alternating roles — merge consecutive same-role messages
  const final: AnthropicMessage[] = [];
  for (const m of validated) {
    const last = final[final.length - 1];
    if (last && last.role === m.role) {
      // Merge: both are strings
      if (typeof last.content === 'string' && typeof m.content === 'string') {
        last.content += '\n' + m.content;
      }
      // Otherwise skip the duplicate
    } else {
      final.push(m);
    }
  }

  // API requires the conversation to end with a user message
  if (final.length > 0 && final[final.length - 1].role === 'assistant') {
    final.push({ role: 'user', content: 'Please continue.' });
  }

  return final;
}

function sendWs(ws: WebSocket, data: Record<string, unknown>): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export async function runAgentLoop(
  ws: WebSocket,
  visitId: string,
  patient: Patient,
  visit: Visit,
  conversationHistory: ConversationMessage[],
  scheduledTasks: ScheduledTaskForPrompt[] = [],
  prnOrders: PrnOrderForPrompt[] = [],
): Promise<void> {
  const systemPrompt = buildSystemPrompt(
    patient,
    visit,
    NURSE_NAME,
    scheduledTasks,
    prnOrders,
  );
  let messages = toAnthropicMessages(conversationHistory);

  // If no messages yet, add a synthetic user message to trigger the greeting
  if (messages.length === 0) {
    messages.push({ role: 'user', content: 'The visit has started. Please greet me and begin.' });
    await saveMessage(visitId, 'user', 'The visit has started. Please greet me and begin.');
  }

  // Agent loop — continues if the model calls tools
  while (true) {
    let fullText = '';
    const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

    try {
      const stream = anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOL_DEFINITIONS,
        messages: messages as Anthropic.MessageParam[],
      });

      // Process stream events
      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta as { type: string; text?: string; partial_json?: string };
          if (delta.type === 'text_delta' && delta.text) {
            fullText += delta.text;
            sendWs(ws, { type: 'token', content: delta.text });
          }
        } else if (event.type === 'content_block_start') {
          const block = event.content_block as { type: string; id?: string; name?: string };
          if (block.type === 'tool_use' && block.id && block.name) {
            toolUseBlocks.push({ id: block.id, name: block.name, input: {} });
          }
        } else if (event.type === 'message_stop') {
          // Final message — extract tool inputs from the accumulated message
        }
      }

      // Get the final message to extract complete tool inputs
      const finalMessage = await stream.finalMessage();

      // Extract tool use blocks with complete inputs
      for (const block of finalMessage.content) {
        if (block.type === 'tool_use') {
          const existing = toolUseBlocks.find((t) => t.id === block.id);
          if (existing) {
            existing.input = block.input as Record<string, unknown>;
          } else {
            toolUseBlocks.push({
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
            });
          }
        }
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[agent] API error:', msg);
      sendWs(ws, { type: 'error', message: 'Agent error — please try again.' });
      return;
    }

    // If there are tool calls, execute them and loop
    if (toolUseBlocks.length > 0) {
      // Save the assistant message (text + tool_use blocks)
      if (fullText) {
        await saveMessage(visitId, 'assistant', fullText);
      }

      // Build the assistant content blocks for the next API call
      const assistantContent: Array<{ type: string;[key: string]: unknown }> = [];
      if (fullText) {
        assistantContent.push({ type: 'text', text: fullText });
      }

      const toolResultContent: Array<{ type: string;[key: string]: unknown }> = [];

      for (const toolBlock of toolUseBlocks) {
        // Save tool_use to DB
        await saveMessage(
          visitId,
          'assistant',
          null,
          toolBlock.name,
          toolBlock.input,
        );

        assistantContent.push({
          type: 'tool_use',
          id: toolBlock.id,
          name: toolBlock.name,
          input: toolBlock.input,
        });

        // Notify client
        sendWs(ws, { type: 'tool_call', tool: toolBlock.name, input: toolBlock.input });

        // Execute tool
        const result = await executeToolCall(toolBlock.name, toolBlock.input);

        // Notify client
        sendWs(ws, {
          type: 'tool_result',
          tool: toolBlock.name,
          success: result.success,
          data: result,
        });

        // Save tool result to DB (store tool_use_id in tool_name field for reconstruction)
        await saveMessage(
          visitId,
          'tool_result',
          null,
          toolBlock.id, // Store the tool_use_id so we can reconstruct messages
          undefined,
          result,
        );

        toolResultContent.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: JSON.stringify(result),
        });
      }

      // Append to messages for next iteration
      messages.push({ role: 'assistant', content: assistantContent });
      messages.push({ role: 'user', content: toolResultContent });

      // Loop — the model will generate a response acknowledging the tool results
      continue;
    }

    // No tool calls — this is the final text response
    if (fullText) {
      await saveMessage(visitId, 'assistant', fullText);
    }
    sendWs(ws, { type: 'done' });
    return;
  }
}
