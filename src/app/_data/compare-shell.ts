export type PresetComparison = {
  id: string;
  label: string;
  detail: string;
  leftId: string;
  rightId: string;
  leftLabel: string;
  rightLabel: string;
  summary: string;
  active?: boolean;
};

export type Metric = {
  label: string;
  value: string;
  detail: string;
};

export type PaneShape = {
  waterPath: string;
  roadPaths: string[];
  boundaryPath: string;
  labelX: number;
  labelY: number;
  outlineStyle: "solid" | "dashed";
};

export type ComparePaneTemplate = {
  id: string;
  slot: "City A" | "City B";
  slotShort: "A" | "B";
  accent: string;
  accentSoft: string;
  scaleCue: string;
  shape: PaneShape;
};

export type ComparePane = ComparePaneTemplate & {
  city: string;
  country: string;
  boundary: string;
  metrics: Metric[];
};

export type DockControl = {
  label: string;
  detail: string;
  active?: boolean;
};

export const compareShellContent = {
  title: "Compare cities at the same ground scale.",
  intro: "Start with two searches or jump in with a preset. The workspace handles the compare.",
  compareNote:
    "Zoom either pane and the other one stays locked to the same ground scale.",
  lockChip: "Equal ground scale locked",
  scaleLabel: "equal ground scale",
};

export const comparePresets: PresetComparison[] = [
  {
    id: "tokyo-paris",
    label: "Tokyo / Paris",
    detail: "metro vs commune",
    leftId: "demo:tokyo",
    rightId: "demo:paris",
    leftLabel: "Tokyo, Japan",
    rightLabel: "Paris, France",
    summary: "Tokyo covers about 20.9 times the area of Paris.",
    active: true,
  },
  {
    id: "seoul-barcelona",
    label: "Seoul / Barcelona",
    detail: "capital vs coastal city",
    leftId: "demo:seoul",
    rightId: "demo:barcelona",
    leftLabel: "Seoul, South Korea",
    rightLabel: "Barcelona, Spain",
    summary: "Seoul and Barcelona are staged for side-by-side comparison.",
  },
  {
    id: "berlin-vienna",
    label: "Berlin / Vienna",
    detail: "close-scale capitals",
    leftId: "demo:berlin",
    rightId: "demo:vienna",
    leftLabel: "Berlin, Germany",
    rightLabel: "Vienna, Austria",
    summary: "Berlin and Vienna are staged for side-by-side comparison.",
  },
  {
    id: "los-angeles-chicago",
    label: "Los Angeles / Chicago",
    detail: "broad west vs dense midwest",
    leftId: "demo:los-angeles",
    rightId: "demo:chicago",
    leftLabel: "Los Angeles, United States",
    rightLabel: "Chicago, United States",
    summary: "Los Angeles and Chicago are staged for side-by-side comparison.",
  },
  {
    id: "london-san-francisco",
    label: "London / San Francisco",
    detail: "capital vs peninsula",
    leftId: "demo:london",
    rightId: "demo:san-francisco",
    leftLabel: "London, United Kingdom",
    rightLabel: "San Francisco, United States",
    summary: "London covers about 13.0 times the area of San Francisco.",
  },
];

export const defaultPresetId = comparePresets[0].id;

export const paneTemplates = {
  left: {
    id: "city-a-pane",
    slot: "City A",
    slotShort: "A",
    accent: "#E4572E",
    accentSoft: "rgba(228, 87, 46, 0.14)",
    scaleCue: "MapLibre basemap",
    shape: {
      waterPath:
        "M531 53C589 58 633 103 651 153C673 214 664 286 612 330C555 378 490 343 445 307C392 265 393 214 417 162C442 109 473 48 531 53Z",
      roadPaths: [
        "M67 118C144 157 234 203 311 246C377 282 458 347 582 389",
        "M122 472C166 416 212 379 289 336C355 298 415 273 496 204C553 155 585 106 621 69",
        "M77 286C179 287 252 282 319 256C392 229 470 185 593 158",
      ],
      boundaryPath:
        "M171 114C208 93 261 93 309 98C348 102 396 120 442 150C480 175 529 205 544 253C558 296 546 352 507 391C466 431 412 448 353 450C298 452 239 435 205 403C166 366 145 323 143 273C141 220 133 142 171 114Z",
      labelX: 367,
      labelY: 244,
      outlineStyle: "solid",
    },
  } satisfies ComparePaneTemplate,
  right: {
    id: "city-b-pane",
    slot: "City B",
    slotShort: "B",
    accent: "#2A7F62",
    accentSoft: "rgba(42, 127, 98, 0.12)",
    scaleCue: "MapLibre basemap",
    shape: {
      waterPath:
        "M33 126C54 79 101 54 152 47C215 39 285 51 322 92C366 141 346 200 321 244C292 295 236 325 183 319C129 313 67 289 39 240C15 198 10 170 33 126Z",
      roadPaths: [
        "M89 103C156 151 224 196 297 225C380 258 465 283 611 321",
        "M130 491C166 431 202 394 269 344C340 292 399 248 463 177C501 134 537 88 587 53",
        "M71 345C172 315 257 287 344 252C428 219 511 190 626 165",
      ],
      boundaryPath:
        "M301 206C326 190 360 184 389 191C417 197 437 224 441 253C445 282 436 314 410 331C385 347 350 351 321 343C295 335 276 315 272 289C268 261 275 225 301 206Z",
      labelX: 357,
      labelY: 269,
      outlineStyle: "dashed",
    },
  } satisfies ComparePaneTemplate,
};

export const dockControls: DockControl[] = [
  { label: "Scale Sync", detail: "On" },
  { label: "Reset View", detail: "Live" },
  { label: "About This Boundary", detail: "Open" },
];

export const featuredComparison = {
  title: compareShellContent.title,
  intro: compareShellContent.intro,
  summary: comparePresets[0].summary,
  summaryDetail: "Both panes stay at the same ground resolution while panning stays independent.",
  compareNote: compareShellContent.compareNote,
  lockChip: compareShellContent.lockChip,
  scaleLabel: compareShellContent.scaleLabel,
  presets: comparePresets,
  panes: [
    {
      ...paneTemplates.left,
      city: "Tokyo",
      country: "Japan",
      boundary: "Metropolitan prefecture boundary",
      metrics: [
        { label: "Area", value: "2,194 km²", detail: "Local sample" },
        { label: "Boundary", value: "Metro prefecture", detail: "Type identified; geometry route pending" },
      ],
    },
    {
      ...paneTemplates.right,
      city: "Paris",
      country: "France",
      boundary: "Commune boundary",
      metrics: [
        { label: "Area", value: "105 km²", detail: "Local sample" },
        { label: "Boundary", value: "Commune", detail: "Type identified; geometry route pending" },
      ],
    },
  ] satisfies ComparePane[],
  dockControls,
};
