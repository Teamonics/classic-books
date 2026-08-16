import { base } from "$app/paths";
import type { CatalogEntry } from "./types";

export interface Era {
  id: string;
  label: string;
}

export interface PathStep {
  work: string;
  ref: string;
  label: string;
  blurb: string;
  workTitle: string;
  author: string;
  authorName: string;
  chunkTitle: string;
  words: number;
}

export interface ReadingPath {
  slug: string;
  title: string;
  blurb: string;
  steps: PathStep[];
  works: number;
  words: number;
}

export interface Catalog {
  works: CatalogEntry[];
  eras: Era[];
  paths: ReadingPath[];
  passages: number; // count only; the passages themselves load separately
}

// A famous passage, its excerpt lifted from the built text at ref so the card
// and the page it opens can never disagree.
export interface Passage {
  work: string;
  workTitle: string;
  author: string;
  authorName: string;
  translator?: string;
  composedYear: number;
  ref: string;
  chunkTitle: string;
  title: string;
  note: string;
  speaker?: string;
  kind: "verse" | "prose";
  excerpt: string;
}

let catalogPromise: Promise<Catalog> | null = null;

export function getCatalog(): Promise<Catalog> {
  catalogPromise ??= fetch(`${base}/data/catalog.json`).then((r) => {
    if (!r.ok) throw new Error(`${r.status} loading catalog`);
    return r.json();
  });
  return catalogPromise;
}

let passagesPromise: Promise<Passage[]> | null = null;

export function getPassages(): Promise<Passage[]> {
  passagesPromise ??= fetch(`${base}/data/passages.json`).then((r) => {
    if (!r.ok) throw new Error(`${r.status} loading passages`);
    return r.json();
  });
  return passagesPromise;
}

// Works grouped by era in chronological order, and within an era, authors
// with several works collapse into one card so the shelf stays scannable
// (Plato's 24 dialogues and Shakespeare's 39 plays would otherwise bury
// everything else).
export interface ShelfAuthorGroup {
  author: string;
  authorName: string;
  works: CatalogEntry[];
}

export interface ShelfEra {
  era: Era;
  groups: ShelfAuthorGroup[];
}

export function shelfByEra(catalog: Catalog): ShelfEra[] {
  return catalog.eras
    .map((era) => {
      const inEra = catalog.works.filter((w) => w.era === era.id);
      const byAuthor = new Map<string, ShelfAuthorGroup>();
      for (const w of inEra) {
        let g = byAuthor.get(w.author);
        if (!g) byAuthor.set(w.author, (g = { author: w.author, authorName: w.authorName, works: [] }));
        g.works.push(w);
      }
      return { era, groups: [...byAuthor.values()] };
    })
    .filter((e) => e.groups.length);
}
