"use client";
import { useState, useRef, useCallback } from "react";

interface Props {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  label?: string;
}

export default function VoiceButton({ onTranscript, disabled, size = "md", label }: Props) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const sizeClasses = {
    sm: "w-8 h-8 text-sm",
    md: "w-10 h-10 text-base",
    lg: "w-14 h-14 text-xl",
  };

  const start = useCallback(() => {
    setError("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("Voice not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      onTranscript(transcript);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      setError(`Error: ${e.error}`);
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [onTranscript]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={listening ? stop : start}
        disabled={disabled}
        title={listening ? "Stop recording" : label || "Start voice input"}
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center transition-all font-bold ${
          listening
            ? "bg-red-500 hover:bg-red-600 animate-pulse text-white"
            : "bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        }`}
      >
        {listening ? "■" : "🎤"}
      </button>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}

export function speak(text: string) {
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 1;
  utt.pitch = 1;
  window.speechSynthesis.speak(utt);
}
