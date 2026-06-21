import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Attribution | MapMatching",
  description:
    "Source and attribution details for MapMatching search, boundary geometry, and basemap rendering.",
};

const sections = [
  {
    items: [
      "Live city search uses Nominatim over OpenStreetMap data. Local demo search is bundled for presets and deterministic tests.",
      "Preset/demo boundary fixtures are simplified from OpenStreetMap relation geometry and bundled for deterministic restores.",
      "Default city lookup runs through Nominatim over OpenStreetMap data.",
    ],
    title: "Search providers",
  },
  {
    items: [
      "Live boundary geometry currently comes from Nominatim / OpenStreetMap administrative polygons when available.",
      "Preset/demo boundary geometry comes from bundled OpenStreetMap fixtures instead of synthetic area rings.",
      "Normalized area, bbox, and centroid are derived inside MapMatching from the returned geometry payload.",
    ],
    title: "Boundary geometry",
  },
  {
    items: [
      "The compare panes are rendered with MapLibre GL JS.",
      "The default live style is OpenFreeMap Bright unless MAPCOMPARE_MAP_STYLE_URL overrides it for the current server environment.",
      "Map tile attribution is also surfaced directly inside the live map control.",
    ],
    title: "Basemap and rendering",
  },
  {
    items: [
      "OpenStreetMap and Nominatim data are subject to their own usage and attribution requirements.",
      "MapMatching currently keeps population and density out of the product until a reliable source is chosen and attributed.",
    ],
    title: "Notes",
  },
];

export default function AttributionPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col px-4 pb-20 pt-6 sm:px-6 lg:px-8">
      <section className="shell-surface relative overflow-hidden rounded-[2rem] px-5 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
        <div className="absolute inset-x-8 top-0 h-px bg-white/80" />
        <div className="max-w-[46rem]">
          <p className="ui-overline tracking-[0.18em]">Attribution</p>
          <h1 className="type-display mt-3 text-[2.2rem] leading-[0.94] tracking-[-0.05em] text-ink sm:text-[2.8rem]">
            Source details for search, geometry, and maps.
          </h1>
          <p className="mt-4 text-[1rem] leading-relaxed text-slate">
            MapMatching combines app-bundled demo data, provider-backed search,
            normalized geometry metrics, and a live MapLibre basemap. This page is
            the single place to review where each layer comes from today.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate">
            <Link
              className="font-semibold text-ink underline decoration-grid underline-offset-4 transition hover:decoration-ink"
              href="/"
            >
              Back to compare
            </Link>
          </p>
        </div>
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        {sections.map((section) => (
          <article
            className="metric-card rounded-[1.25rem] px-5 py-5"
            key={section.title}
          >
            <p className="ui-overline text-[0.68rem] tracking-[0.14em]">
              {section.title}
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </main>
  );
}
