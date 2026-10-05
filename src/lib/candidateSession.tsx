import { createContext, useContext, type ReactNode } from 'react';

/**
 * The signed-in candidate as the UI needs it. Real routes fill this from Clerk;
 * the e2e build fills it with a fixture. Screens never import Clerk directly.
 */
export type CandidateSession = {
  userId: string;
  firstName: string | null;
  fullName: string | null;
  email: string | null;
  signOut: () => void | Promise<void>;
};

const SessionContext = createContext<CandidateSession | null>(null);

export function CandidateSessionProvider({ value, children }: { value: CandidateSession; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useCandidateSession(): CandidateSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error('CandidateSessionProvider is missing.');
  return session;
}
