import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage, ScheduleItem } from '../types';
import {
  VitalsForm,
  MedicationForm,
  InterventionForm,
  NarrativeForm,
  SkipForm,
} from './ActionForms';
import { useAudioRecorder, formatDuration } from '../hooks/useAudioRecorder';
import { useAudioPlayer } from '../hooks/useAudioPlayer';

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  activeToolCall: string | null;
  activeForm: ActiveForm | null;
  lastLoadedMsgId: string | null;
  onSendMessage: (content: string) => void;
  onFormSubmit: (item: ScheduleItem, data: Record<string, string>) => void;
  onFormCancel: () => void;
}

export interface ActiveForm {
  item: ScheduleItem;
  actionValue: string;
}

function formatMessageTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function ChatPanel({
  messages,
  isStreaming,
  activeToolCall,
  activeForm,
  lastLoadedMsgId,
  onSendMessage,
  onFormSubmit,
  onFormCancel,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const recorder = useAudioRecorder(onSendMessage);
  const tts = useAudioPlayer();

  const [autoSpeak, setAutoSpeak] = useState(true);
  const lastSpokenIdRef = useRef<string | null>(lastLoadedMsgId);

  // Seed TTS ref with last loaded message so history doesn't get spoken
  useEffect(() => {
    if (lastLoadedMsgId) {
      lastSpokenIdRef.current = lastLoadedMsgId;
    }
  }, [lastLoadedMsgId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeToolCall, activeForm]);

  // Auto-play agent responses via TTS when streaming completes
  // Skip TTS for error messages to avoid wasting credits
  useEffect(() => {
    if (isStreaming || !autoSpeak || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (
      lastMsg.role === 'agent' &&
      lastMsg.content &&
      lastMsg.id !== lastSpokenIdRef.current &&
      !lastMsg.content.startsWith('Something went wrong')
    ) {
      lastSpokenIdRef.current = lastMsg.id;
      tts.playText(lastMsg.content);
    }
  }, [isStreaming, messages, autoSpeak, tts]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSubmit = () => {
    if (!input.trim() || isStreaming) return;
    onSendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Toggle listen mode: tap once to start, tap again to stop + send
  const handleMicToggle = () => {
    if (recorder.isRecording) {
      recorder.stopRecording();
    } else {
      recorder.startRecording();
    }
  };

  // Render the correct form
  function renderForm() {
    if (!activeForm) return null;
    const { item, actionValue } = activeForm;

    if (actionValue === 'record_vitals') {
      return <VitalsForm item={item} onSubmit={onFormSubmit} onCancel={onFormCancel} />;
    }
    if (actionValue === 'skip_vitals') {
      return <SkipForm item={item} label="Vital signs" onSubmit={onFormSubmit} onCancel={onFormCancel} />;
    }
    if (actionValue === 'med_given' || actionValue === 'med_skipped' || actionValue === 'med_modified') {
      return (
        <MedicationForm
          item={item}
          action={actionValue as 'med_given' | 'med_skipped' | 'med_modified'}
          onSubmit={onFormSubmit}
          onCancel={onFormCancel}
        />
      );
    }
    if (actionValue === 'intervention_done' || actionValue === 'intervention_skip') {
      return (
        <InterventionForm
          item={item}
          action={actionValue as 'intervention_done' | 'intervention_skip'}
          onSubmit={onFormSubmit}
          onCancel={onFormCancel}
        />
      );
    }
    if (actionValue === 'write_narrative') {
      return <NarrativeForm item={item} onSubmit={onFormSubmit} onCancel={onFormCancel} />;
    }
    return null;
  }

  return (
    <div className="flex h-full w-[70%] shrink-0 flex-col border-l border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <img
            src="/aria-avatar.png"
            alt="Aria"
            className="h-8 w-8 rounded-full object-cover ring-2 ring-white"
          />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Aria</h3>
            <p className="text-[10px] text-gray-400">AI Documentation Assistant</p>
          </div>
        </div>
        {/* Speaker toggle */}
        <button
          onClick={() => setAutoSpeak(!autoSpeak)}
          className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition-colors ${
            autoSpeak ? 'text-indigo-600' : 'text-gray-400'
          }`}
          title={autoSpeak ? 'Auto-speak is on' : 'Auto-speak is off'}
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {autoSpeak ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
            )}
          </svg>
          {autoSpeak ? 'On' : 'Off'}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="space-y-4">
          {/* Empty state — nudge the nurse to start talking */}
          {messages.length === 0 && !isStreaming && !activeToolCall && (
            <div className="flex flex-col items-center justify-center py-16">
              <img
                src="/aria-avatar.png"
                alt="Aria"
                className="mb-4 h-20 w-20 rounded-full object-cover shadow-md"
              />
              <p className="text-lg font-semibold text-gray-900">Talk to Aria</p>
              <p className="mt-1 text-sm text-gray-400">
                Tap the mic or type below to start documenting
              </p>
            </div>
          )}

          {messages.map((msg, i) => {
            const prevMsg = messages[i - 1];
            const showTime =
              !prevMsg ||
              msg.timestamp.getTime() - prevMsg.timestamp.getTime() > 120000;

            return (
              <div key={msg.id}>
                {showTime && (
                  <p className="mb-3 text-center text-[10px] text-gray-400">
                    {formatMessageTime(msg.timestamp)}
                  </p>
                )}

                {msg.role === 'agent' ? (
                  <div className="flex gap-2.5">
                    <img
                      src="/aria-avatar.png"
                      alt="Aria"
                      className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover"
                    />
                    <div className="prose prose-sm min-w-0 max-w-none flex-1 text-gray-800 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-strong:text-gray-900 prose-headings:text-gray-900 prose-headings:text-sm prose-headings:mt-2 prose-headings:mb-1">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <div className="prose prose-sm prose-invert min-w-0 max-w-[85%] rounded-2xl bg-gray-900 px-4 py-2.5 text-white prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Active form */}
          {renderForm()}

          {/* Tool call indicator */}
          {activeToolCall && (
            <div className="flex items-center gap-2.5 text-xs text-gray-400">
              <img src="/aria-avatar.png" alt="Aria" className="h-5 w-5 rounded-full object-cover opacity-60" />
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-gray-300 border-t-gray-600" />
                <span>Aria is {activeToolCall.toLowerCase()}...</span>
              </div>
            </div>
          )}

          {/* Streaming cursor */}
          {isStreaming &&
            !activeToolCall &&
            messages.length > 0 &&
            messages[messages.length - 1]?.role === 'agent' && (
              <div className="flex items-center gap-2 pl-9">
                <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-gray-400" />
                <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-gray-300" style={{ animationDelay: '0.2s' }} />
                <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-gray-200" style={{ animationDelay: '0.4s' }} />
              </div>
            )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Input area — voice-first, tablet-optimized ── */}
      <div className="border-t border-gray-200 bg-gray-50 px-6 py-6">
        {/* TTS playing bar */}
        {tts.isPlaying && (
          <div className="mb-4 flex items-center justify-center gap-2.5">
            <img src="/aria-avatar.png" alt="Aria" className="h-6 w-6 rounded-full object-cover" />
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
            <span className="text-sm text-indigo-500">Aria is speaking...</span>
            <button
              onClick={tts.stop}
              className="ml-1 rounded-lg border border-indigo-200 px-2.5 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
            >
              Stop
            </button>
          </div>
        )}

        {recorder.isTranscribing ? (
          /* ── Transcribing ── */
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="relative">
              <img src="/aria-avatar.png" alt="Aria" className="h-20 w-20 rounded-full object-cover shadow-md" />
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-white/60">
                <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-gray-200 border-t-gray-700" />
              </div>
            </div>
            <span className="text-sm font-medium text-gray-600">Aria is processing your voice...</span>
          </div>
        ) : recorder.isRecording ? (
          /* ── Listening mode ── */
          <div className="flex flex-col items-center gap-5 py-4">
            <button
              onClick={handleMicToggle}
              className="group relative flex h-28 w-28 items-center justify-center"
            >
              {/* Animated rings */}
              <span className="absolute inset-[-12px] animate-ping rounded-full bg-red-400/10" />
              <span className="absolute inset-0 animate-pulse rounded-full bg-red-400/15" />
              <span className="absolute inset-3 animate-pulse rounded-full bg-red-400/10" style={{ animationDelay: '0.5s' }} />
              {/* Core */}
              <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-red-500 shadow-2xl shadow-red-300 transition-transform group-hover:scale-105 group-active:scale-95">
                <svg className="h-10 w-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </span>
            </button>

            <div className="flex flex-col items-center gap-1">
              <span className="text-base font-semibold text-gray-900">Listening...</span>
              <span className="text-sm tabular-nums text-gray-400">
                {formatDuration(recorder.durationMs)}
              </span>
              <span className="mt-1 text-xs text-gray-400">Tap to stop and send</span>
            </div>
          </div>
        ) : (
          /* ── Default: voice-first with keyboard fallback ── */
          <div className="flex flex-col items-center gap-5">
            {/* Main speak button — hero element */}
            <button
              onClick={handleMicToggle}
              disabled={!recorder.isSupported}
              className="group relative flex h-28 w-28 items-center justify-center rounded-full bg-orange-600 shadow-xl shadow-orange-200 transition-all hover:scale-105 hover:bg-orange-500 hover:shadow-2xl active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:shadow-none disabled:shadow-none"
              title={recorder.isSupported ? 'Tap to speak' : 'Microphone not available'}
            >
              {/* Subtle idle glow */}
              <span className="absolute inset-[-4px] rounded-full bg-orange-500/10 group-hover:bg-orange-500/20 transition-colors" />
              <svg className="relative h-10 w-10 text-white group-disabled:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
              </svg>
            </button>

            <div className="flex flex-col items-center gap-0.5">
              <span className="text-base font-semibold text-gray-900">
                {recorder.isSupported ? 'Talk to Aria' : 'Microphone not available'}
              </span>
              <span className="text-xs text-gray-400">Tap the mic or type below</span>
            </div>

            {/* Keyboard input — secondary, compact */}
            <div className="flex w-full items-end gap-2">
              <div className="flex-1">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  rows={1}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-gray-400 focus:ring-1 focus:ring-gray-200"
                />
              </div>
              {input.trim() && (
                <button
                  onClick={handleSubmit}
                  disabled={isStreaming}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white transition-opacity disabled:opacity-30"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
