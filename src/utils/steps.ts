import type { ThoughtStep } from "../types";
import { uid } from "./id";

export function toThoughtStep(step: string | ThoughtStep): ThoughtStep {
  if (typeof step === "string") {
    return { id: uid(), text: step, starred: false, cleverness: 1 };
  }
  return {
    id: step.id || uid(),
    text: step.text ?? "",
    starred: step.starred ?? false,
    cleverness: (step.cleverness as ThoughtStep["cleverness"]) ?? 1,
  };
}
