import { Image, View, type StyleProp, type ViewStyle } from "react-native";
// Keep the supplied image untouched. Crop its outer black canvas for in-app use.
export function BrandLogo({
  size,
  style,
  label = "DOGO Logo",
}: {
  size: number;
  style?: StyleProp<ViewStyle>;
  label?: string;
}) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size * 0.26,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <Image
        source={require("../../../assets/brand/dogo-logo.png")}
        accessibilityLabel={label}
        style={{
          position: "absolute",
          width: "126%",
          height: "126%",
          left: "-13%",
          top: "-13%",
        }}
      />
    </View>
  );
}
