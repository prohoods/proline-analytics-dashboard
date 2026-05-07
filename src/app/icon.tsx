import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#2563eb",
          borderRadius: 14,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 5,
          padding: 14,
        }}
      >
        <div style={{ width: 8, height: 18, background: "#fff", borderRadius: 2 }} />
        <div style={{ width: 8, height: 28, background: "#fff", borderRadius: 2 }} />
        <div style={{ width: 8, height: 22, background: "#fff", borderRadius: 2 }} />
        <div style={{ width: 8, height: 34, background: "#fff", borderRadius: 2 }} />
      </div>
    ),
    { ...size }
  );
}
