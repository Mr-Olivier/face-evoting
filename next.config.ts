import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // face-api ships its own bundled TensorFlow.js; keep it client-side only.
  serverExternalPackages: ["@vladmandic/face-api"],
  async headers() {
    return [
      {
        // Edge Impulse WebAssembly files must be served with the correct MIME type.
        source: "/models/edge-impulse/:path*.wasm",
        headers: [{ key: "Content-Type", value: "application/wasm" }],
      },
      {
        // face-api weights: served as plain data (not a "download") so download managers
        // like IDM don't intercept them. fetch().arrayBuffer() still returns the raw bytes.
        source: "/models/face-api/:path*.shard",
        headers: [
          { key: "Content-Type", value: "text/plain; charset=x-user-defined" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
