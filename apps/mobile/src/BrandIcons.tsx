import { View } from "react-native";
import { tokens } from "@dogo/ui";
export function PawIcon({
  size = 36,
  color = tokens.color.green,
}: {
  size?: number;
  color?: string;
}) {
  const unit = size / 32;
  return (
    <View
      testID="paw-icon"
      accessible={false}
      style={{ width: size, height: size }}
    >
      {[
        [4, 9, 6, 9, -25],
        [11, 4, 6, 9, -8],
        [19, 5, 6, 9, 13],
        [25, 12, 5, 8, 30],
      ].map(([x, y, w, h, r], i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: x * unit,
            top: y * unit,
            width: w * unit,
            height: h * unit,
            borderRadius: 5 * unit,
            backgroundColor: color,
            transform: [{ rotate: `${r}deg` }],
          }}
        />
      ))}
      <View
        style={{
          position: "absolute",
          left: 9 * unit,
          top: 17 * unit,
          width: 17 * unit,
          height: 13 * unit,
          borderTopLeftRadius: 10 * unit,
          borderTopRightRadius: 10 * unit,
          borderBottomLeftRadius: 6 * unit,
          borderBottomRightRadius: 6 * unit,
          backgroundColor: color,
          transform: [{ rotate: "-10deg" }],
        }}
      />
    </View>
  );
}
export function PackPaws({
  color = tokens.color.green,
  size = 60,
}: {
  color?: string;
  size?: number;
}) {
  const scale = size / 60;
  return (
    <View
      testID="pack-paws"
      accessible={false}
      style={{ width: size, height: 44 * scale }}
    >
      {[
        [0, 17, -18],
        [21, 0, 5],
        [39, 21, 18],
      ].map(([x, y, r], i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: x * scale,
            top: y * scale,
            transform: [{ rotate: `${r}deg` }],
          }}
        >
          <PawIcon size={21 * scale} color={color} />
        </View>
      ))}
    </View>
  );
}
