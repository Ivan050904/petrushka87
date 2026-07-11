import { useCallback, useEffect, useRef, useState } from "react";

import { getErrorMessage, transcribeAssistantAudio } from "@/lib/api";

type VoiceInputState = "idle" | "recording" | "transcribing";

type UseVoiceInputOptions = {
  token: string | null;
  onTranscribed: (text: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  maxRecordingMs?: number | null;
};

export function useVoiceInput({
  token,
  onTranscribed,
  onError,
  disabled = false,
  maxRecordingMs = null,
}: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceInputState>("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);
  const tickTimerRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);

  const cleanupRecorder = useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (tickTimerRef.current !== null) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    recordingStartedAtRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setRecordingSeconds(0);
  }, []);

  useEffect(() => cleanupRecorder, [cleanupRecorder]);

  const transcribeBlob = useCallback(
    (blob: Blob, filename = "voice.webm") => {
      if (!token) {
        return;
      }
      setState("transcribing");
      void transcribeAssistantAudio(token, blob, filename)
        .then((result) => {
          onTranscribed(result.text);
        })
        .catch((error) => {
          onError?.(getErrorMessage(error, "Не удалось распознать речь"));
        })
        .finally(() => {
          setState("idle");
        });
    },
    [onError, onTranscribed, token],
  );

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (!token || disabled || state !== "idle") {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        cleanupRecorder();

        if (!token || blob.size === 0) {
          setState("idle");
          onError?.("Запись пустая");
          return;
        }

        transcribeBlob(blob, "voice.webm");
      };

      recorder.start();
      recordingStartedAtRef.current = Date.now();
      setRecordingSeconds(0);
      setState("recording");

      tickTimerRef.current = window.setInterval(() => {
        const startedAt = recordingStartedAtRef.current;
        if (!startedAt) {
          return;
        }
        setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000));
      }, 1000);

      if (maxRecordingMs !== null && maxRecordingMs > 0) {
        stopTimerRef.current = window.setTimeout(() => {
          void stopRecording();
        }, maxRecordingMs);
      }
    } catch (error) {
      cleanupRecorder();
      setState("idle");
      onError?.(getErrorMessage(error, "Нет доступа к микрофону"));
    }
  }, [
    cleanupRecorder,
    disabled,
    maxRecordingMs,
    onError,
    state,
    stopRecording,
    token,
    transcribeBlob,
  ]);

  const transcribeFile = useCallback(
    (file: File) => {
      if (!token || disabled || state !== "idle") {
        return;
      }
      if (file.size === 0) {
        onError?.("Файл пустой");
        return;
      }
      transcribeBlob(file, file.name);
    },
    [disabled, onError, state, token, transcribeBlob],
  );

  const toggleRecording = useCallback(async () => {
    if (state === "recording") {
      stopRecording();
      return;
    }
    if (state === "idle") {
      await startRecording();
    }
  }, [startRecording, state, stopRecording]);

  return {
    state,
    isRecording: state === "recording",
    isTranscribing: state === "transcribing",
    recordingSeconds,
    toggleRecording,
    startRecording,
    stopRecording,
    transcribeFile,
  };
}

export function formatRecordingDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
