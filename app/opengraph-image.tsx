import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Vest — Private vesting on Solana";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          background: "#0A0A0A",
          color: "#E5E5E5",
          padding: "80px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: "monospace",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: 22,
            color: "#888",
            letterSpacing: "0.2em",
          }}
        >
          <span>vest</span>
          <span style={{ color: "#444" }}>·</span>
          <span style={{ color: "#666" }}>private vesting on solana</span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "32px",
          }}
        >
          <div
            style={{
              fontSize: 80,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              maxWidth: 900,
            }}
          >
            Cap tables were private for a reason.
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <Bar width={520} />
            <Bar width={340} />
            <Bar width={520} redacted />
            <Bar width={420} />
            <Bar width={280} redacted />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: "#666",
            fontSize: 18,
          }}
        >
          <span>Built on Umbra Privacy Protocol</span>
          <span>vest.app</span>
        </div>
      </div>
    ),
    { ...size },
  );
}

function Bar({ width, redacted }: { width: number; redacted?: boolean }) {
  return (
    <div
      style={{
        height: 18,
        width,
        borderRadius: 4,
        background: redacted ? "#E5E5E5" : "#1f1f1f",
        border: redacted ? "0" : "1px solid #2a2a2a",
      }}
    />
  );
}
