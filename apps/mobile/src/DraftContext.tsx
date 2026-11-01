import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";
import type { Row } from "@dogo/domain";
type DraftState = {
  selectedDog: string;
  setSelectedDog: Dispatch<SetStateAction<string>>;
  assessment: Row | null;
  setAssessment: Dispatch<SetStateAction<Row | null>>;
  answers: Record<string, any>;
  setAnswers: Dispatch<SetStateAction<Record<string, any>>>;
  relationship: string;
  setRelationship: Dispatch<SetStateAction<string>>;
  userId: string;
  setUserId: Dispatch<SetStateAction<string>>;
};
const Context = createContext<DraftState | null>(null);
export function DraftProvider({ children }: { children: ReactNode }) {
  const [selectedDog, setSelectedDog] = useState(""),
    [assessment, setAssessment] = useState<Row | null>(null),
    [answers, setAnswers] = useState<Record<string, any>>({}),
    [relationship, setRelationship] = useState(""),
    [userId, setUserId] = useState("");
  return (
    <Context.Provider
      value={{
        selectedDog,
        setSelectedDog,
        assessment,
        setAssessment,
        answers,
        setAnswers,
        relationship,
        setRelationship,
        userId,
        setUserId,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useDraft() {
  const value = useContext(Context);
  if (!value) throw new Error("DraftProvider missing");
  return value;
}
