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
// Native View strokes keep the same lightweight icon on Web, iOS and Android.
export function LeashedDogIcon({
  size = 29,
  color = tokens.color.green,
}: {
  size?: number;
  color?: string;
}) {
  const unit = size / 32;
  const paths = [
    [
      [5, 17],
      [2, 17],
      [2, 14],
      [6, 12],
      [8, 9],
      [12, 10],
      [14, 14],
      [14, 18],
      [23, 18],
      [27, 15],
      [29, 16],
    ],
    [
      [6, 18],
      [7, 23],
      [9, 24],
      [9, 29],
      [12, 29],
      [13, 24],
      [22, 24],
      [23, 29],
      [26, 29],
      [26, 22],
      [25, 18],
    ],
    [
      [9, 12],
      [9, 17],
      [12, 18],
      [14, 15],
    ],
    [
      [13, 19],
      [17, 12],
      [20, 3],
      [25, 3],
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
          const [x1, y1] = points[i],
            length = Math.hypot(x2 - x1, y2 - y1) * unit;
          return (
            <View
              key={`${p}-${i}`}
              style={{
                position: "absolute",
                left: ((x1 + x2) / 2) * unit - length / 2,
                top: ((y1 + y2) / 2) * unit - unit,
                width: length,
                height: 2 * unit,
                borderRadius: unit,
                backgroundColor: p === 3 ? tokens.color.orange : color,
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
      <View
        style={{
          position: "absolute",
          left: 5.5 * unit,
          top: 13 * unit,
          width: 1.7 * unit,
          height: 1.7 * unit,
          borderRadius: unit,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
