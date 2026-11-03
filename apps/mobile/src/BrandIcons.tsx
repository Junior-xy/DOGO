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
export function PackPaws({ color = tokens.color.green }: { color?: string }) {
  return (
    <View
      testID="pack-paws"
      accessible={false}
      style={{ width: 60, height: 44 }}
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
            left: x,
            top: y,
            transform: [{ rotate: `${r}deg` }],
          }}
        >
          <PawIcon size={21} color={color} />
        </View>
      ))}
    </View>
  );
}
// A compact, monochrome outline with the same stroke weight as the other tabs.
export function LeashedDogIcon({
  size = 20,
  color = tokens.color.green,
}: {
  size?: number;
  color?: string;
}) {
  const unit = size / 24;
  const stroke = 1.1 * unit;
  const paths = [
    [
      [3, 12],
      [1.5, 11],
      [1.5, 9.5],
      [5, 8.5],
      [6, 5.5],
      [9, 6.5],
      [10, 11.5],
      [18, 11.5],
      [21, 8.5],
    ],
    [
      [5, 12],
      [7, 16],
      [8, 16],
      [8, 21],
      [10, 21],
    ],
    [
      [8, 16],
      [18, 16],
      [18, 21],
      [20, 21],
    ],
    [
      [18, 11.5],
      [18, 16],
    ],
    [
      [8, 7],
      [8.5, 10],
    ],
    [
      [7, 12],
      [12, 3],
      [16, 3],
    ],
  ];
  return (
    <View
      testID="leashed-dog-icon"
      accessible={false}
      style={{ width: size, height: size }}
    >
      {paths.flatMap((points, p) =>
        points.slice(1).map(([x2, y2], i) => {
          const [x1, y1] = points[i];
          const length = Math.hypot(x2 - x1, y2 - y1) * unit;
          return (
            <View
              key={`${p}-${i}`}
              style={{
                position: "absolute",
                left: ((x1 + x2) / 2) * unit - (length + stroke) / 2,
                top: ((y1 + y2) / 2) * unit - stroke / 2,
                width: length + stroke,
                height: stroke,
                borderRadius: stroke / 2,
                backgroundColor: color,
                transform: [
                  {
                    rotate: `${(Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI}deg`,
                  },
                ],
              }}
            />
          );
        }),
      )}
    </View>
  );
}
