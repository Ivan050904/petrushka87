import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/navigation";

/** Legacy path — nginx may proxy `/transcription/` to backend; frontend UI lives at `/transcribe`. */
export default function TranscriptionLegacyRedirectPage() {
  redirect(ROUTES.transcription);
}
