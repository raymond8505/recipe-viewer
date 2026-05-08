import nextConfig from "eslint-config-next/core-web-vitals";

const config = [
  { ignores: [".next/**", "public/**", "storybook-static/**", "node_modules/**"] },
  ...nextConfig,
  {
    rules: {
      // react-hooks v7 introduced these rules targeting React 19 patterns.
      // The codebase is on React 18 where these patterns (sync setState in effects,
      // "latest ref" idiom) are valid and recommended.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
    },
  },
];

export default config;
