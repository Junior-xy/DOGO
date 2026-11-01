import { DraftProvider } from "../src/DraftContext";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
export default function Layout() {
  return (
    <SafeAreaProvider>
      <DraftProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </DraftProvider>
    </SafeAreaProvider>
  );
}
