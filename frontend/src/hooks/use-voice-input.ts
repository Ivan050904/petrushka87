import { useCallback, useEffect, useRef, useState } from "react";

import { transcribeAssistantAudio } from "@/lib/api";
import { getErrorMessage } from "@/lib/api";

const MAX_RECORDING_MS = 60_000;

type VoiceInputState = "idle" | "recording" | "transcribing";

type UseVoiceInputOptions = {
  token: string | null;
  onTranscribed: (text: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
};

export function useVoiceInput({ token, onTranscribed, onError, disabled = false }: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceInputState>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);

  const cleanupRecorder = useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => cleanupRecorder, [cleanupRecorder]);

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

        setState("transcribing");
        void transcribeAssistantAudio(token, blob)
          .then((result) => {
            onTranscribed(result.text);
          })
          .catch((error) => {
            onError?.(getErrorMessage(error, "Не удалось распознать речь"));
          })
          .finally(() => {
            setState("idle");
          });
      };

      recorder.start();
      setState("recording");
      stopTimerRef.current = window.setTimeout(() => {
        void stopRecording();
      }, MAX_RECORDING_MS);
    } catch (error) {
      cleanupRecorder();
      setState("idle");
      onError?.(getErrorMessage(error, "Нет доступа к микрофону"));
    }
  }, [cleanupRecorder, disabled, onError, onTranscribed, state, stopRecording, token]);

  const toggleRecording = useCallback(async () => {
    if (state === "recording") {
      await stopRecording();
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
    toggleRecording,
  };
}
