import { ImageResponse } from "next/og";

import {
  buildHomeMetadata,
  buildShareCardModel,
} from "@/lib/share/compare-metadata";
import {
  buildInitialCompareState,
  type CompareSearchParams,
} from "@/lib/search/url-state";

function searchParamsToRecord(searchParams: URLSearchParams): CompareSearchParams {
  const record: CompareSearchParams = {};

  searchParams.forEach((value, key) => {
    const existingValue = record[key];

    if (typeof existingValue === "undefined") {
      record[key] = value;
      return;
    }

    if (Array.isArray(existingValue)) {
      existingValue.push(value);
      record[key] = existingValue;
      return;
    }

    record[key] = [existingValue, value];
  });

  return record;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const compareState = buildInitialCompareState(searchParamsToRecord(searchParams));
  const card = buildShareCardModel(compareState);
  const metadata = buildHomeMetadata(searchParamsToRecord(searchParams));
  const description =
    metadata.description ??
    "Compare cities at the same real-world scale with GeoSync.";

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "stretch",
          background:
            "linear-gradient(180deg, #fbf8f2 0%, #f5f1e8 44%, #ede4d6 100%)",
          color: "#111827",
          display: "flex",
          height: "100%",
          padding: "48px",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            background:
              "radial-gradient(circle at top left, rgba(255,255,255,0.78), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.86), rgba(245,241,232,0.72))",
            border: "1px solid rgba(83,96,112,0.14)",
            borderRadius: 36,
            boxShadow: "0 24px 60px rgba(83,96,112,0.12)",
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "space-between",
            overflow: "hidden",
            padding: "42px 44px",
            position: "relative",
          }}
        >
          <div
            style={{
              background:
                "linear-gradient(rgba(201,187,170,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(201,187,170,0.08) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
              inset: 0,
              opacity: 0.72,
              position: "absolute",
            }}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 18, zIndex: 1 }}>
            <div
              style={{
                alignItems: "center",
                color: "#536070",
                display: "flex",
                fontSize: 22,
                fontWeight: 700,
                gap: 16,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
              }}
            >
              <div
                style={{
                  borderBottom: "1px solid rgba(83,96,112,0.28)",
                  flex: 1,
                  height: 1,
                }}
              />
              GeoSync
              <div
                style={{
                  borderBottom: "1px solid rgba(83,96,112,0.28)",
                  flex: 1,
                  height: 1,
                }}
              />
            </div>

            <div
              style={{
                color: "#536070",
                display: "flex",
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              {card.comparisonLabel}
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                maxWidth: 900,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 86,
                  fontWeight: 700,
                  letterSpacing: "-0.06em",
                  lineHeight: 0.92,
                }}
              >
                {card.title}
              </div>
              <div
                style={{
                  color: "#536070",
                  display: "flex",
                  fontSize: 28,
                  fontWeight: 500,
                  lineHeight: 1.3,
                }}
              >
                {card.detail}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 24,
              justifyContent: "space-between",
              zIndex: 1,
            }}
          >
            <div
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.9), rgba(245,241,232,0.76))",
                border: "1px solid rgba(83,96,112,0.14)",
                borderRadius: 28,
                boxShadow: "0 18px 42px rgba(83,96,112,0.10)",
                display: "flex",
                flex: 1,
                flexDirection: "column",
                gap: 16,
                maxWidth: 760,
                padding: "28px 30px",
              }}
            >
              <div
                style={{
                  color: "#536070",
                  display: "flex",
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                Shared summary
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 34,
                  fontWeight: 500,
                  lineHeight: 1.28,
                }}
              >
                {card.summary}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                width: 250,
              }}
            >
              {[card.footerLeft, card.footerRight].map((label) => (
                <div
                  key={label}
                  style={{
                    alignItems: "center",
                    background: "rgba(17,24,39,0.92)",
                    borderRadius: 999,
                    color: "#f5f1e8",
                    display: "flex",
                    fontSize: 20,
                    fontWeight: 700,
                    justifyContent: "center",
                    minHeight: 68,
                    padding: "0 20px",
                    textAlign: "center",
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              bottom: 20,
              color: "rgba(83,96,112,0.85)",
              display: "flex",
              fontSize: 16,
              fontWeight: 600,
              left: 44,
              letterSpacing: "0.1em",
              position: "absolute",
              right: 44,
              textTransform: "uppercase",
            }}
          >
            {description}
          </div>
        </div>
      </div>
    ),
    {
      headers: {
        "cache-control": "public, max-age=3600, s-maxage=3600",
      },
      height: 630,
      width: 1200,
    },
  );
}
