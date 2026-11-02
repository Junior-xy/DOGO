import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";
type DraftState = {
  selectedDog: string;
  setSelectedDog: Dispatch<SetStateAction<string>>;
  userId: string;
  setUserId: Dispatch<SetStateAction<string>>;
};
const Context = createContext<DraftState | null>(null);
export function DraftProvider({ children }: { children: ReactNode }) {
  const [selectedDog, setSelectedDog] = useState(""),
    [userId, setUserId] = useState("");
  return (
    <Context.Provider
      value={{
        selectedDog,
        setSelectedDog,
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
