"use client";

import { useState, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import Link from "next/link";
import { RenderScreen } from "~/app/_components/render-screen";
import { useStreamingTTS } from "~/hooks/use-streaming-tts";
import type { SafetyAnalyzeResponse } from "~/lib/safety/types";
import { buildSafetySpeech } from "~/lib/safety/voice";
import { SafetyBanner } from "./safety-banner";

function clog(tag: string, ...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}][UI:${tag}]`, ...args);
}

interface ActiveScreen {
  type: "select-one" | "select-multi" | "text" | "auth";
  prompt: string;
  options?: string[];
  toolCallId: string;
}

function PulsingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#878A90]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#878A90] [animation-delay:0.2s]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#878A90] [animation-delay:0.4s]" />
    </span>
  );
}

function InlineFormatted({ text }: { text: string }) {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[0.9em]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function FormattedText({ text }: { text: string }) {
  const safeText = typeof text === "string" ? text : String(text ?? "");
  const lines = safeText.split("\n");
  const blocks: React.ReactNode[] = [];
  let currentList: { type: "ul" | "ol"; items: string[] } | null = null;

  const flushList = () => {
    if (!currentList) return;
    const Tag = currentList.type;
    blocks.push(
      <Tag
        key={`list-${blocks.length}`}
        className={`my-1 space-y-0.5 ${Tag === "ol" ? "list-decimal" : "list-disc"} pl-5`}
      >
        {currentList.items.map((item, j) => (
          <li key={j}>
            <InlineFormatted text={item} />
          </li>
        ))}
      </Tag>,
    );
    currentList = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1]!.length;
      const content = headingMatch[2]!;
      const sizeClass =
        level === 1
          ? "text-lg font-bold"
          : level === 2
            ? "text-base font-bold"
            : "text-[15px] font-semibold";
      blocks.push(
        <p key={`h-${i}`} className={`${sizeClass} mt-2 first:mt-0`}>
          <InlineFormatted text={content} />
        </p>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const item = line.replace(/^[-*]\s+/, "");
      if (currentList?.type === "ul") {
        currentList.items.push(item);
      } else {
        flushList();
        currentList = { type: "ul", items: [item] };
      }
      continue;
    }

    const olMatch = /^\d+\.\s+(.+)$/.exec(line);
    if (olMatch) {
      const item = olMatch[1]!;
      if (currentList?.type === "ol") {
        currentList.items.push(item);
      } else {
        flushList();
        currentList = { type: "ol", items: [item] };
      }
      continue;
    }

    if (line.trim() === "") {
      flushList();
      blocks.push(<div key={`br-${i}`} className="h-2" />);
      continue;
    }

    flushList();
    blocks.push(
      <span key={`p-${i}`} className="block">
        <InlineFormatted text={line} />
      </span>,
    );
  }

  flushList();
  return <div className="space-y-0.5">{blocks}</div>;
}

export function BrowseSession({
  conversationId,
  browserSessionId,
  browserLiveUrl,
  initialMessages = [],
  isNew = false,
}: {
  conversationId: string;
  browserSessionId: string;
  browserLiveUrl: string | null;
  initialMessages?: UIMessage[];
  isNew?: boolean;
}) {
  const [input, setInput] = useState("");
  const [activeScreen, setActiveScreen] = useState<ActiveScreen | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [safetyResult, setSafetyResult] = useState<SafetyAnalyzeResponse | null>(null);
  const [isCheckingSafety, setIsCheckingSafety] = useState(false);
  const lastBrowserSafetyKeyRef = useRef<string>("");
  const submittedToolCalls = useRef<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const sentViaMicRef = useRef(false);
  const streamingTTS = useStreamingTTS();

  useEffect(() => {
    return () => {
      streamingTTS.stop();
    };
  }, [streamingTTS]);

  useEffect(() => {
    clog(
      "MOUNT",
      `conversationId=${conversationId} browserSessionId=${browserSessionId} isNew=${isNew} initialMessages=${initialMessages.length}`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const city = tz.split("/").pop()?.replace(/_/g, " ") ?? "";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        document.cookie = `user_location=${pos.coords.latitude},${pos.coords.longitude},${city};path=/;max-age=86400;SameSite=Lax`;
      },
      () => {
        document.cookie = `user_location=,,${city};path=/;max-age=86400;SameSite=Lax`;
      },
    );
  }, []);

  const { messages, sendMessage, addToolOutput, status } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { conversationId },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onError: (err) => {
      clog("CHAT:ERROR", "useChat error:", err);
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const ttsStartedRef = useRef(false);
  useEffect(() => {
    const isStreaming = status === "streaming" || status === "submitted";
    if (isStreaming && sentViaMicRef.current && !ttsStartedRef.current) {
      ttsStartedRef.current = true;
      void streamingTTS.start();
    }
    if (status === "ready" && ttsStartedRef.current) {
      ttsStartedRef.current = false;
      sentViaMicRef.current = false;
      streamingTTS.finish();
    }
  }, [status, streamingTTS]);

  useEffect(() => {
    if (!streamingTTS.isActive()) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    const textParts = lastAssistant.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ");
    if (textParts.trim()) {
      streamingTTS.sendText(textParts);
    }
  }, [messages, streamingTTS]);

  useEffect(() => {
    let found = false;
    for (const message of messages) {
      for (const part of message.parts) {
        if (
          part.type === "tool-renderScreen" &&
          "toolCallId" in part &&
          "state" in part &&
          part.state === "input-available" &&
          !submittedToolCalls.current.has((part as { toolCallId: string }).toolCallId) &&
          "input" in part
        ) {
          const toolInput = part.input as {
            type: "select-one" | "select-multi" | "text" | "auth";
            prompt: string;
            options?: string[];
          };
          setActiveScreen({
            type: toolInput.type,
            prompt: toolInput.prompt,
            options: toolInput.options,
            toolCallId: (part as { toolCallId: string }).toolCallId,
          });
          found = true;
          return;
        }
      }
    }
    if (!found) setActiveScreen(null);
  }, [messages]);

  const findPendingRenderScreen = () => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (
          part.type === "tool-renderScreen" &&
          "toolCallId" in part &&
          "state" in part &&
          part.state === "input-available" &&
          !submittedToolCalls.current.has((part as { toolCallId: string }).toolCallId)
        ) {
          return (part as { toolCallId: string }).toolCallId;
        }
      }
    }
    return null;
  };

  const submitToolOutput = (toolCallId: string, value: string) => {
    streamingTTS.stop();
    submittedToolCalls.current.add(toolCallId);
    void addToolOutput({
      tool: "renderScreen",
      toolCallId,
      output: value,
    });
    setActiveScreen(null);
  };

  const handleRenderScreenSubmit = (value: string) => {
    const toolCallId = activeScreen?.toolCallId ?? findPendingRenderScreen();
    if (!toolCallId) return;
    submitToolOutput(toolCallId, value);
  };

  const startRecording = async () => {
    streamingTTS.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        audioChunksRef.current = [];
        const buffer = await audioBlob.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ""),
        );
        setIsTranscribing(true);
        try {
          const res = await fetch("/api/speech", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "transcribe", audio: base64 }),
          });
          if (!res.ok) return;
          const data = (await res.json()) as { text?: string };
          if (data.text?.trim()) {
            sentViaMicRef.current = true;
            void sendMessage({ text: data.text });
            void runSafetyCheck(data.text);
          }
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      clog("VOICE", "Mic access denied:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const playTTS = async (text: string) => {
    try {
      const res = await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "speak", text }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { audio?: string; mediaType?: string };
      if (data.audio && data.mediaType) {
        const audio = new Audio(`data:${data.mediaType};base64,${data.audio}`);
        await audio.play();
      }
    } catch (err) {
      clog("TTS", "Playback failed:", err);
    }
  };

  const runSafetyCheck = async (text: string) => {
    const cleaned = text.trim();
    if (cleaned.length < 10) return;
    setIsCheckingSafety(true);
    try {
      const res = await fetch("/api/safety/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimText: cleaned }),
      });
      const data = (await res.json()) as SafetyAnalyzeResponse & { error?: string };
      if (!res.ok) return;
      if (data.verdict === "suspicious" || data.verdict === "likely_scam") {
        setSafetyResult(data);
      } else {
        setSafetyResult(null);
      }
    } catch (err) {
      clog("SAFETY", "Safety check error:", err);
    } finally {
      setIsCheckingSafety(false);
    }
  };

  const speakSafetyGuidance = async () => {
    if (!safetyResult) return;
    await playTTS(
      buildSafetySpeech({
        verdict: safetyResult.verdict,
        score: safetyResult.score,
        reasons: safetyResult.reasons,
      }),
    );
  };

  useEffect(() => {
    const lastToolOutput = [...messages]
      .flatMap((message) => message.parts)
      .reverse()
      .find(
        (part) =>
          part.type === "tool-browse" &&
          "state" in part &&
          part.state === "output-available" &&
          "output" in part,
      );

    if (!lastToolOutput || !("output" in lastToolOutput)) return;

    const outputText = String(lastToolOutput.output ?? "");
    const key = outputText.slice(0, 400);
    if (!key || key === lastBrowserSafetyKeyRef.current) return;
    lastBrowserSafetyKeyRef.current = key;

    const urlMatch = outputText.match(/https?:\/\/[^\s)"']+/i);
    const pageText = outputText.slice(0, 1500);

    void (async () => {
      setIsCheckingSafety(true);
      try {
        const res = await fetch("/api/safety/browser", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: urlMatch?.[0] ?? null,
            pageText,
          }),
        });
        const data = (await res.json()) as { result?: SafetyAnalyzeResponse | null };
        const result = data.result;
        if (result && (result.verdict === "suspicious" || result.verdict === "likely_scam")) {
          setSafetyResult(result);
        }
      } catch (err) {
        clog("SAFETY", "Browser safety check error:", err);
      } finally {
        setIsCheckingSafety(false);
      }
    })();
  }, [messages]);

  const submitCurrentInput = () => {
    streamingTTS.stop();
    if (!input.trim()) return;

    if (activeScreen) {
      handleRenderScreenSubmit(input);
      setInput("");
      return;
    }

    const pendingToolCallId = findPendingRenderScreen();
    if (pendingToolCallId) {
      submittedToolCalls.current.add(pendingToolCallId);
      void addToolOutput({
        tool: "renderScreen",
        toolCallId: pendingToolCallId,
        output: input,
      });
      setActiveScreen(null);
      setInput("");
      return;
    }

    if (isLoading) return;
    void sendMessage({ text: input });
    void runSafetyCheck(input);
    setInput("");
  };

  return (
    <div className="flex h-screen bg-[#0C0F15] text-[#E4E2DC]" style={{ colorScheme: "dark" }}>
      <div className="relative min-w-0 flex-1 overflow-hidden bg-[#0C0F15]">
        {browserLiveUrl && (
          <iframe
            src={browserLiveUrl}
            className="h-full w-full border-0"
            title="Browser View"
            allow="clipboard-read; clipboard-write"
          />
        )}

        {!browserLiveUrl && (
          <div className="flex h-full items-center justify-center bg-[#0C0F15] px-10 text-center text-[#A3AAB3]">
            Start a guided session to browse with voice, simple explanations, and safety guidance.
          </div>
        )}

        {activeScreen && activeScreen.type !== "auth" && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0C0F15]/88 px-6 backdrop-blur-md">
            <div className="w-full max-w-2xl space-y-4">
              {/otp|pin|password|cvv|upi|collect request|urgent|immediately|legal action|account.*(freeze|blocked|suspend)|anydesk|teamviewer/i.test(activeScreen.prompt) && (
                <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-5 py-4 text-sm leading-relaxed text-amber-100 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
                  <div className="font-semibold text-amber-50">Safety reminder</div>
                  <div className="mt-1">
                    This step may involve sensitive information. Please verify the website and request carefully before sharing any codes, passwords, or payment approvals.
                  </div>
                </div>
              )}
              <RenderScreen
                type={activeScreen.type}
                prompt={activeScreen.prompt}
                options={activeScreen.options}
                onSubmit={handleRenderScreenSubmit}
              />
            </div>
          </div>
        )}

        {activeScreen?.type === "auth" && (
          <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center px-6 py-4">
            <div className="soft-panel flex items-center gap-4 rounded-2xl px-6 py-4">
              <span className="text-[15px] font-medium text-[#E4E2DC]">
                Log in using the browser above, then click below.
              </span>
              <button
                onClick={() => handleRenderScreenSubmit("User completed authentication")}
                className="cursor-pointer rounded-full bg-[#34D399] px-6 py-2.5 text-sm font-semibold text-[#0C0F15] transition-all duration-200 hover:bg-[#2BBD88]"
              >
                I&apos;m Done
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex h-full w-[430px] shrink-0 flex-col border-l border-white/[0.07] bg-[#0B1118]">
        {safetyResult && (
          <SafetyBanner
            result={safetyResult}
            onSpeak={() => void speakSafetyGuidance()}
            onDismiss={() => setSafetyResult(null)}
          />
        )}

        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div className="flex flex-col">
            <span className="font-[family-name:var(--font-syne)] text-sm font-bold tracking-tight text-[#E4E2DC] lowercase">
              cagesurf 🦜
            </span>
            <span className="text-[11px] uppercase tracking-[0.14em] text-[#5F666F]">
              {isCheckingSafety ? "checking safety…" : "guided safe browsing"}
            </span>
          </div>
          <Link
            href="/browse"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[#878A90] transition-colors hover:bg-white/[0.07] hover:text-[#E4E2DC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#34D399]"
            aria-label="Chat history"
            title="Chat history"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </Link>
        </div>

        <div className="border-b border-white/[0.07] px-5 py-4 text-sm text-[#9198A2]">
          Ask Cage Surf to open pages, explain confusing steps, or check whether something feels unsafe before you continue.
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="flex flex-col gap-5">
            {isNew && messages.length === 0 && !isLoading && (
              <div className="mt-auto flex flex-col gap-3 pt-4">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#5E656F]">
                  Try one of these
                </p>
                {[
                  "Help me log in to my electricity bill account safely.",
                  "Explain this government website in simple language.",
                  "Check if this payment request looks suspicious.",
                  "Help me book a doctor appointment online.",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      streamingTTS.stop();
                      void sendMessage({ text: suggestion });
                      void runSafetyCheck(suggestion);
                    }}
                    className="soft-panel cursor-pointer rounded-2xl px-4 py-4 text-left text-[14px] leading-relaxed text-[#D4D1C9] transition-all duration-200 hover:border-[#34D399]/25"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {messages.map((message, msgIdx) => (
              <div key={`${message.id}-${msgIdx}`} className="flex flex-col gap-1.5">
                {message.parts.map((part, i) => {
                  if (part.type === "text") {
                    const isUser = message.role === "user";
                    return (
                      <div key={`${message.id}-${i}`} className={`group flex ${isUser ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[88%] rounded-[1.35rem] px-4 py-3.5 text-[15px] leading-relaxed shadow-[0_10px_30px_rgba(0,0,0,0.12)] ${
                            isUser
                              ? "rounded-br-md bg-[#34D399] text-[#07110D]"
                              : "rounded-bl-md border border-white/[0.06] bg-[#151C25] text-[#F2EFE8]"
                          }`}
                        >
                          <FormattedText text={part.text} />
                        </div>
                        {!isUser && part.text.trim() && (
                          <button
                            type="button"
                            onClick={() => void playTTS(part.text)}
                            className="ml-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center self-end rounded-lg text-[#555860] opacity-0 transition-opacity hover:bg-white/[0.05] hover:text-[#AAB1B8] group-hover:opacity-100"
                            aria-label="Read aloud"
                            title="Read aloud"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M11 5L6 9H2v6h4l5 4V5Z" fill="currentColor" />
                              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  }

                  if (part.type.startsWith("tool-") && "state" in part && "toolCallId" in part) {
                    const isRenderScreen = part.type === "tool-renderScreen";
                    const isWebSearch = part.type === "tool-webSearch";

                    if (part.state === "input-available") {
                      if (isRenderScreen && "input" in part) {
                        const renderInput = part.input as {
                          prompt?: string;
                        };
                        const promptText = renderInput.prompt ?? "";
                        const looksRisky = /otp|pin|password|cvv|upi|collect request|urgent|immediately|legal action|account.*(freeze|blocked|suspend)|anydesk|teamviewer/i.test(
                          promptText,
                        );

                        return (
                          <div key={`${message.id}-${i}`} className="space-y-2 py-1">
                            <div className="flex items-center gap-2 text-[13px] text-[#8E959E]">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8E959E]" />
                              Cage Surf needs your input on the left side
                            </div>
                            {looksRisky && (
                              <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-3 text-[13px] leading-relaxed text-amber-100">
                                <div className="font-semibold">Pause and verify this step</div>
                                <div className="mt-1 text-amber-50/90">
                                  This screen may be asking for sensitive or risky information. Read it carefully before continuing.
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div key={`${message.id}-${i}`} className="flex items-center gap-2 py-1 text-[13px] text-[#8E959E]">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8E959E]" />
                          {isWebSearch ? "Searching safely across the web..." : "Working on this step..."}
                        </div>
                      );
                    }

                    if (part.state === "output-available") {
                      const toolName = part.type.replace("tool-", "");
                      if (toolName === "renderScreen" && "output" in part) {
                        const answer = part.output as string;
                        return (
                          <div key={`${message.id}-${i}`} className="flex items-center gap-2 py-1 text-[13px] text-[#666D76]">
                            <span className="text-[11px]">✓</span>
                            Answer saved: <span className="text-[#E4E2DC]">{answer}</span>
                          </div>
                        );
                      }

                      return (
                        <div key={`${message.id}-${i}`} className="flex items-center gap-2 py-1 text-[13px] text-[#666D76]">
                          <span className="text-[11px]">✓</span>
                          {toolName === "webSearch"
                            ? "Looked up trusted web results"
                            : toolName === "browse"
                              ? "Checked the page"
                              : toolName === "recordTask"
                                ? "Saved task details"
                                : toolName}
                        </div>
                      );
                    }
                  }

                  return null;
                })}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 py-1 text-[13px] text-[#878A90]">
                <PulsingDots />
                <span>Cage Surf is thinking...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitCurrentInput();
          }}
          className="border-t border-white/[0.07] p-4"
        >
          <div className="soft-panel flex items-end gap-2 rounded-[1.4rem] px-4 py-3 transition-colors focus-within:border-[#34D399]/40">
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitCurrentInput();
                  e.currentTarget.style.height = "auto";
                }
              }}
              placeholder="Tell Cage Surf what you need help with"
              rows={1}
              className="max-h-32 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed text-[#E4E2DC] placeholder:text-[#626A73] focus:outline-none"
              disabled={isLoading && !activeScreen && !findPendingRenderScreen()}
            />
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                if (isLoading || isTranscribing) return;
                void startRecording();
              }}
              onPointerUp={stopRecording}
              onPointerLeave={stopRecording}
              disabled={isLoading || isTranscribing}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#34D399] disabled:cursor-not-allowed disabled:opacity-30 ${
                isRecording
                  ? "bg-red-500 text-white"
                  : "bg-white/[0.06] text-[#878A90] hover:bg-white/[0.1]"
              }`}
              aria-label={isRecording ? "Recording..." : isTranscribing ? "Transcribing..." : "Hold to talk"}
              title={isRecording ? "Release to send" : "Hold to talk"}
            >
              {isTranscribing ? (
                <PulsingDots />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z"
                    fill={isRecording ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M19 10v2a7 7 0 0 1-14 0v-2"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </button>
            <button
              type="submit"
              disabled={(isLoading && !activeScreen && !findPendingRenderScreen()) || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#34D399] text-[#0C0F15] transition-all duration-200 hover:bg-[#2BBD88] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#34D399] disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Send message"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
