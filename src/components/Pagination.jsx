import { useMemo, useState } from 'react';

// Slices a list into pages for the admin tables.
//
// `resetKey` is anything that should snap the view back to page 1 — pass the
// active filters and a new search jumps to the first page of results.
//
// The current page is DERIVED during render rather than synced in an effect,
// so a shrinking list (filter applied, row deleted) clamps into range without
// ever painting an out-of-range page.
export function usePagination(items, { pageSize = 20, resetKey = '' } = {}) {
  const [cursor, setCursor] = useState({ page: 1, resetKey });

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page =
    cursor.resetKey === resetKey
      ? Math.min(Math.max(1, cursor.page), pageCount)
      : 1;

  const start = (page - 1) * pageSize;
  const pageItems = useMemo(
    () => items.slice(start, start + pageSize),
    [items, start, pageSize]
  );

  return {
    page,
    pageCount,
    pageItems,
    total,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
    setPage: (next) => setCursor({ page: next, resetKey })
  };
}

// First page, last page, and the current page's immediate neighbours —
// with '…' wherever the sequence skips ahead.
function pageWindow(page, pageCount) {
  const wanted = [1, pageCount, page, page - 1, page + 1];
  const shown = [...new Set(wanted)]
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);

  const out = [];
  shown.forEach((p, i) => {
    if (i > 0 && p - shown[i - 1] > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

export default function Pagination({ page, pageCount, from, to, total, label, onPage }) {
  if (pageCount <= 1) return null;

  return (
    <nav className="pagination" aria-label={label}>
      <p className="pagination__summary" role="status">
        Showing {from}–{to} of {total}
      </p>

      <div className="pagination__controls">
        <button
          type="button"
          className="pagination__step"
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
        >
          ‹
        </button>

        {pageWindow(page, pageCount).map((p, i) =>
          p === 'gap' ? (
            <span key={`gap-${i}`} className="pagination__gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={p === page ? 'pagination__page is-current' : 'pagination__page'}
              onClick={() => onPage(p)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          className="pagination__step"
          onClick={() => onPage(page + 1)}
          disabled={page === pageCount}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    </nav>
  );
}
