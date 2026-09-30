import { PagedResponse } from './api-response.model';

/** 1-based page request sent to every server-paginated endpoint. */
export interface PageRequest {
  pageIndex: number;
  pageSize: number;
}

export interface PageMeta extends PageRequest {
  /** Total rows across all pages for the current filters. */
  count: number;
  totalPages: number;
}

/** One server page, already mapped to domain models. */
export interface Page<T> {
  items: T[];
  page: PageMeta;
}

/** Slices an in-memory list into one page (for filters applied client-side). */
export function pageOf<T>(all: readonly T[], req: PageRequest): Page<T> {
  const totalPages = Math.max(1, Math.ceil(all.length / req.pageSize));
  const start = (req.pageIndex - 1) * req.pageSize;
  return {
    items: all.slice(start, start + req.pageSize),
    page: { ...req, count: all.length, totalPages },
  };
}

/** Fills gaps in a server page's metadata from the request that produced it. */
export function toPageMeta(paged: PagedResponse<unknown>, req: PageRequest): PageMeta {
  return {
    pageIndex: paged.pageIndex || req.pageIndex,
    pageSize: paged.pageSize || req.pageSize,
    count: paged.count,
    totalPages: Math.max(1, paged.totalPages),
  };
}
