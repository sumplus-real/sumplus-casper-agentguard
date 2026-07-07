"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html>
      <body>
        <div style={{ textAlign: "center", padding: "4rem", color: "#f1f5f9", background: "#050510", minHeight: "100vh" }}>
          <h2 style={{ marginBottom: "1rem" }}>Something went wrong</h2>
          <button onClick={reset} style={{ padding: "0.5rem 1.5rem", borderRadius: "0.5rem", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
