import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@dogo/domain", "@dogo/ti", "@dogo/ui"],
};
export default config;
