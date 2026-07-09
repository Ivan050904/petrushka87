import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2563EB",
          borderRadius: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            width: 18,
            height: 22,
            background: "rgba(255,255,255,0.92)",
            borderRadius: 2,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: 0,
              width: 1.5,
              background: "#2563EB",
              transform: "translateX(-50%)",
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
