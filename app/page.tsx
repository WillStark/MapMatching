import type { Metadata } from "next";

import { CompareShell } from "@/app/_components/compare-shell";
import { buildHomeMetadata } from "@/lib/share/compare-metadata";
import {
  buildInitialCompareState,
  type CompareSearchParams,
} from "@/lib/search/url-state";

type HomeProps = {
  searchParams?: Promise<CompareSearchParams>;
};

export async function generateMetadata({
  searchParams,
}: HomeProps): Promise<Metadata> {
  const resolvedSearchParams = (await searchParams) ?? {};

  return buildHomeMetadata(resolvedSearchParams);
}

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialState = buildInitialCompareState(resolvedSearchParams);

  return <CompareShell initialState={initialState} />;
}
