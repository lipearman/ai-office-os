import { useEffect, useState } from "react";
import { OFFICE_SCENARIO } from "@/lib/officeScenario";

const TURN_MS = 4200;   // how long each agent "holds the floor"
const TYPING_MS = 900;  // brief typing indicator before the message appears

/**
 * Drives a scripted, looping office conversation in realtime.
 * Returns the agent_type currently speaking, its line, and whether it's
 * still "typing". Pass `enabled=false` (e.g. while editing) to pause it.
 */
export function useOfficeSimulation(enabled: boolean) {
  const [idx, setIdx] = useState(0);
  const [typing, setTyping] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    setTyping(true);
    const typingTimer = setTimeout(() => setTyping(false), TYPING_MS);
    const nextTimer = setTimeout(
      () => setIdx((i) => (i + 1) % OFFICE_SCENARIO.length),
      TURN_MS,
    );
    return () => {
      clearTimeout(typingTimer);
      clearTimeout(nextTimer);
    };
  }, [idx, enabled]);

  const turn = OFFICE_SCENARIO[idx];
  return { speakerType: turn.agentType, text: turn.text, typing };
}
