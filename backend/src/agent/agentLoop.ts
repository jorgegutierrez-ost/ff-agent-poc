import Anthropic from '@anthropic-ai/sdk';
import type { WebSocket } from 'ws';
import type { Patient, Visit, ConversationMessage } from '../types';
import { buildSystemPrompt } from './systemPrompt';
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
 */
function toAnthropicMessages(history: ConversationMessage[]): AnthropicMessage[] {
  const messages: AnthropicMessage[] = [];

  for (const msg of history) {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content ?? '' });
    } else if (msg.role === 'assistant') {
      // Could be plain text or a tool_use block
      if (msg.tool_name && msg.tool_input) {
        // This was a tool_use turn — check if the last message is already an assistant
        const last = messages[messages.length - 1];
        const block = {
          type: 'tool_use',
          id: msg.id,
          name: msg.tool_name,
          input: msg.tool_input,
        };
        if (last && last.role === 'assistant' && Array.isArray(last.content)) {
          last.content.push(block);
        } else if (last && last.role === 'assistant' && typeof last.content === 'string') {
          // Convert string content to blocks array
          const textBlock = { type: 'text', text: last.content };
          last.content = [textBlock, block];
        } else {
          messages.push({ role: 'assistant', content: [block] });
        }
      } else {
        messages.push({ role: 'assistant', content: msg.content ?? '' });
      }
    } else if (msg.role === 'tool_result') {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.tool_name ?? msg.id, // tool_name stores the tool_use_id for results
            content: JSON.stringify(msg.tool_result ?? { success: true }),
          },
        ],
      });
    }
  }

  // API requires the conversation to end with a user message
  if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
    messages.push({ role: 'user', content: 'Please continue.' });
  }

  return messages;
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
): Promise<void> {
  const systemPrompt = buildSystemPrompt(patient, visit, NURSE_NAME);
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
