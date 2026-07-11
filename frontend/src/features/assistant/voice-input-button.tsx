"use client";

import { Loader2, Mic, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { cn } from "@/lib/utils";

type VoiceInputButtonProps = {
  token: string | null;
  onTranscribed: (text: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  className?: string;
};

export function VoiceInputButton({
  token,
  onTranscribed,
  onError,
  disabled = false,
  className,
}: VoiceInputButtonProps) {
  const { isRecording, isTranscribing, toggleRecording } = useVoiceInput({
    token,
    onTranscribed,
    onError,
    disabled,
    maxRecordingMs: 60_000,
  });

  const isBusy = isTranscribing;
  const label = isRecording ? "Остановить запись" : isTranscribing ? "Распознаю речь" : "Записать голосом";

  return (
    <Button
      type="button"
      size="icon"
      variant={isRecording ? "destructive" : "outline"}
      aria-label={label}
      title={label}
      disabled={!token || disabled || isBusy}
      onClick={() => void toggleRecording()}
      className={cn(isRecording && "animate-pulse", className)}
    >
      {isTranscribing ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      ) : isRecording ? (
        <Square aria-hidden="true" className="size-4" />
      ) : (
        <Mic aria-hidden="true" className="size-4" />
      )}
    </Button>
  );
}
