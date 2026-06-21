import { NextRequest, NextResponse } from "next/server";

import { getPlaceGeometry, NO_BOUNDARY_COPY } from "@/lib/place/provider";
import type { PlaceGeometryResponse } from "@/lib/place/types";

const PLACE_UNAVAILABLE_COPY =
  "We couldn't load a reliable boundary for this city.";

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      placeId: string;
    }>;
  },
) {
  const { placeId: rawPlaceId } = await context.params;
  const placeId = decodeURIComponent(rawPlaceId ?? "").trim();

  if (!placeId) {
    return NextResponse.json(
      { error: PLACE_UNAVAILABLE_COPY },
      { status: 400 },
    );
  }

  try {
    const response = await getPlaceGeometry(
      placeId,
      request.headers.get("accept-language") ?? undefined,
    );

    return NextResponse.json(response satisfies PlaceGeometryResponse);
  } catch (error) {
    console.error("Place geometry route failed", error);

    const message =
      error instanceof Error && error.message
        ? error.message
        : PLACE_UNAVAILABLE_COPY;
    const status = message === NO_BOUNDARY_COPY ? 422 : 503;

    return NextResponse.json(
      {
        error:
          message === NO_BOUNDARY_COPY ? NO_BOUNDARY_COPY : PLACE_UNAVAILABLE_COPY,
      },
      { status },
    );
  }
}
