"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const API = "http://localhost:8000";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  sourcesOpen?: boolean;
};

type JobState = {
  jobId: string;
  pdfName: string;
  status: "processing" | "complete" | "failed";
};

export default function Home() {
  const [pdfs, setPdfs] = useState<string[]>([]);
  const [activePdf, setActivePdf] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [uploadJob, setUploadJob] = useState<JobState | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchPdfs = useCallback(async () => {
    try {
      const res = await fetch(`${API}/pdfs`);
      if (!res.ok) throw new Error("Failed to fetch PDFs");
      const data = await res.json();
      setPdfs(data.pdfs ?? []);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    fetchPdfs();
  }, [fetchPdfs]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startPolling = useCallback(
    (jobId: string, pdfName: string) => {
      if (pollingRef.current) clearInterval(pollingRef.current);

      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${API}/job/${jobId}`);
          if (!res.ok) throw new Error("Poll failed");
          const data = await res.json();
          const status: "processing" | "complete" | "failed" =
            data.status === "complete"
              ? "complete"
              : data.status === "failed"
              ? "failed"
              : "processing";

          setUploadJob({ jobId, pdfName, status });

          if (status === "complete" || status === "failed") {
            clearInterval(pollingRef.current!);
            pollingRef.current = null;
            if (status === "complete") {
              fetchPdfs();
            }
          }
        } catch {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setUploadJob((prev) =>
            prev ? { ...prev, status: "failed" } : null
          );
        }
      }, 2000);
    },
    [fetchPdfs]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".pdf")) {
        setUploadError("Only PDF files are accepted.");
        return;
      }
      setUploadError(null);
      const form = new FormData();
      form.append("file", file);

      try {
        const res = await fetch(`${API}/upload`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail ?? "Upload failed");
        }
        const data = await res.json();
        setUploadJob({ jobId: data.job_id, pdfName: data.pdf_name, status: "processing" });
        startPolling(data.job_id, data.pdf_name);
      } catch (e: unknown) {
        setUploadError(e instanceof Error ? e.message : "Upload failed");
      }
    },
    [startPolling]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
      e.target.value = "";
    },
    [handleUpload]
  );

  const handleAsk = useCallback(async () => {
    if (!question.trim() || !activePdf || askLoading) return;
    const q = question.trim();
    setQuestion("");
    setAskError(null);
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setAskLoading(true);

    try {
      const res = await fetch(`${API}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, pdf_name: activePdf }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Request failed");
      }
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          sources: data.sources ?? [],
          sourcesOpen: false,
        },
      ]);
    } catch (e: unknown) {
      setAskError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setAskLoading(false);
    }
  }, [question, activePdf, askLoading]);

  const toggleSources = (index: number) => {
    setMessages((prev) =>
      prev.map((m, i) =>
        i === index ? { ...m, sourcesOpen: !m.sourcesOpen } : m
      )
    );
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      {/* Left panel */}
      <aside className="w-72 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-5 border-b border-gray-200">
          <h1 className="text-lg font-semibold tracking-tight">PDF RAG</h1>
          <p className="text-xs text-gray-500 mt-0.5">Upload PDFs, ask questions</p>
        </div>

        {/* Upload area */}
        <div className="p-4 border-b border-gray-200">
          <label htmlFor="file-input" className="block">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-blue-400 bg-blue-50"
                  : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
              }`}
            >
              <svg
                className="mx-auto h-8 w-8 text-gray-400 mb-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
              <p className="text-sm text-gray-600">
                Drop PDF here or <span className="text-blue-500">browse</span>
              </p>
            </div>
          </label>
          <input
            id="file-input"
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={onFileInput}
          />

          {/* Upload status */}
          {uploadJob && (
            <div className="mt-3 rounded-md px-3 py-2 text-xs bg-gray-50 border border-gray-200">
              <div className="flex items-center gap-2">
                {uploadJob.status === "processing" && (
                  <svg className="animate-spin h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
                {uploadJob.status === "complete" && (
                  <svg className="h-3.5 w-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {uploadJob.status === "failed" && (
                  <svg className="h-3.5 w-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                <span className="truncate text-gray-700 font-medium">{uploadJob.pdfName}</span>
              </div>
              <p className={`mt-0.5 ${
                uploadJob.status === "processing" ? "text-blue-600" :
                uploadJob.status === "complete" ? "text-green-600" : "text-red-600"
              }`}>
                {uploadJob.status === "processing" ? "Processing…" :
                 uploadJob.status === "complete" ? "Ready" : "Processing failed"}
              </p>
            </div>
          )}

          {uploadError && (
            <p className="mt-2 text-xs text-red-600">{uploadError}</p>
          )}
        </div>

        {/* PDF list */}
        <div className="flex-1 overflow-y-auto p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Your PDFs
          </h2>
          {pdfs.length === 0 ? (
            <p className="text-xs text-gray-400">No PDFs yet.</p>
          ) : (
            <ul className="space-y-1">
              {pdfs.map((pdf) => (
                <li key={pdf}>
                  <button
                    onClick={() => {
                      setActivePdf(pdf);
                      setMessages([]);
                      setAskError(null);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm truncate transition-colors ${
                      activePdf === pdf
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {pdf}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Right panel */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-white">
          <h2 className="text-sm font-medium text-gray-900">
            {activePdf ? (
              <>
                Chatting with{" "}
                <span className="text-blue-600 font-semibold">{activePdf}</span>
              </>
            ) : (
              <span className="text-gray-400">Select a PDF to start chatting</span>
            )}
          </h2>
        </div>

        {/* Chat thread */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!activePdf && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-gray-400">
                Select a PDF from the left panel to begin.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-xl rounded-2xl px-4 py-3 text-sm ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm"
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => toggleSources(i)}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <svg
                        className={`h-3 w-3 transition-transform ${msg.sourcesOpen ? "rotate-90" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {msg.sources.length} source{msg.sources.length !== 1 ? "s" : ""}
                    </button>

                    {msg.sourcesOpen && (
                      <div className="mt-2 space-y-2">
                        {msg.sources.map((chunk, j) => (
                          <div
                            key={j}
                            className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed font-mono"
                          >
                            {chunk}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {askLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                <div className="flex gap-1 items-center h-4">
                  <span className="block h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
                  <span className="block h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
                  <span className="block h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          {askError && (
            <div className="flex justify-center">
              <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {askError}
              </p>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input bar */}
        <div className="px-6 py-4 border-t border-gray-200 bg-white">
          <div className={`flex gap-2 ${!activePdf ? "opacity-40 pointer-events-none" : ""}`}>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
              placeholder="Ask a question about the selected PDF…"
              disabled={!activePdf || askLoading}
              className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
            />
            <button
              onClick={handleAsk}
              disabled={!question.trim() || !activePdf || askLoading}
              className="rounded-xl bg-blue-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
