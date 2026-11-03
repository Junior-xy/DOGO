import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { tokens } from "@dogo/ui";
import {
  LANGUAGE_KEY,
  parseLanguage,
  translate,
  translateMessage,
  type Language,
} from "./translate";
type ContextValue = {
  language: Language;
  changeLanguage: (language: Language) => void;
  tr: (
    source: string | number | null | undefined,
    args?: readonly (string | number | null | undefined)[],
  ) => string;
  trMessage: (source: string) => string;
  storageError: boolean;
};
const Context = createContext<ContextValue | null>(null);
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("zh");
  const [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(LANGUAGE_KEY)
      .then(
        (value) => {
          if (active) setLanguage(parseLanguage(value));
        },
        () => {
          if (active) setStorageError(true);
        },
      )
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined")
      document.documentElement.lang = language === "en" ? "en" : "zh-CN";
  }, [language]);
  const changeLanguage = useCallback((next: Language) => {
    setLanguage(next);
    setStorageError(false);
    writes.current = writes.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(LANGUAGE_KEY, next))
      .then(() => setStorageError(false))
      .catch(() => {
        setStorageError(true);
      });
  }, []);
  const tr = useCallback(
    (
      text: string | number | null | undefined,
      args?: readonly (string | number | null | undefined)[],
    ) => translate(language, text, args),
    [language],
  );
  const trMessage = useCallback(
    (source: string) => translateMessage(language, source),
    [language],
  );
  if (!ready)
    return (
      <ActivityIndicator
        accessibilityLabel="Loading language / 正在加载语言"
        color={tokens.color.green}
      />
    );
  return (
    <Context.Provider
      value={{ language, changeLanguage, tr, trMessage, storageError }}
    >
      {children}
    </Context.Provider>
  );
}
export function useLanguage() {
  const ctx = useContext(Context);
  if (!ctx) throw Error("LanguageProvider missing");
  return ctx;
}
export function LanguageSwitch() {
  const { language, changeLanguage, storageError, tr } = useLanguage();
  return (
    <View style={{ gap: 4, maxWidth: 140 }}>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Language / 语言"
        style={{
          flexDirection: "row",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: tokens.color.line,
          overflow: "hidden",
        }}
      >
        {(
          [
            ["zh", "中文", "简体中文"],
            ["en", "EN", "English"],
          ] as const
        ).map(([id, label, name]) => (
          <Pressable
            key={id}
            accessibilityRole="radio"
            accessibilityLabel={name}
            accessibilityState={{ checked: language === id }}
            aria-checked={language === id}
            onPress={() => changeLanguage(id)}
            style={{
              paddingHorizontal: 8,
              minHeight: 36,
              justifyContent: "center",
              backgroundColor:
                language === id ? tokens.color.green : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: language === id ? "white" : tokens.color.green,
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {storageError && (
        <Text
          accessibilityRole="alert"
          style={{ fontSize: 11, color: tokens.color.danger }}
        >
          {tr("语言偏好未能保存，请重试切换。")}
        </Text>
      )}
    </View>
  );
}
