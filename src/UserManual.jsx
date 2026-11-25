import React, { useRef, useState } from 'react';
import { BookOpen, ChevronRight, Download, ExternalLink, X } from 'lucide-react';
import manual from './manual-info.json';
import './user-manual.css';

const pageImage = page => `${manual.previewBase}/page-${String(page).padStart(2, '0')}.webp`;

export default function UserManual() {
  const [isOpen, setIsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const reader = useRef(null);
  const pageCount = manual.pageTitles.length;

  function goToPage(nextPage) {
    if (nextPage === page || nextPage < 1 || nextPage > pageCount) return;
    setIsLoading(true);
    setHasError(false);
    setPage(nextPage);
    reader.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  return (
    <section className="user-manual-section" id="user-manual" aria-labelledby="user-manual-title">
      <div className="user-manual-summary">
        <img className="user-manual-cover" src={pageImage(1)} width="1200" height="1698" loading="lazy" alt="PhotoTags expanded user manual cover" />
        <div className="user-manual-copy">
          <p className="eyebrow">Your operator reference</p>
          <h2 id="user-manual-title">The PhotoTags user manual.</h2>
          <p>Keep setup instructions close at hand. This expanded guide covers all four booth modes, branding, Admin templates, recommended settings, payments, vouchers, and troubleshooting.</p>
          <p className="user-manual-meta">Version {manual.version} · {pageCount} pages · PDF · {(manual.byteLength / 1000000).toFixed(1)} MB</p>
          <div className="user-manual-actions">
            <button className="primary-button" type="button" aria-expanded={isOpen} aria-controls="user-manual-preview" onClick={() => setIsOpen(!isOpen)}>
              {isOpen ? <X size={19} aria-hidden="true" /> : <BookOpen size={19} aria-hidden="true" />}
              {isOpen ? 'Close preview' : 'Preview manual'}
            </button>
            <a className="outline-button" href={manual.pdfUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} aria-hidden="true" />Open PDF</a>
            <a className="ghost-link" href={manual.pdfUrl} download><Download size={18} aria-hidden="true" />Download PDF</a>
          </div>
        </div>
      </div>
      {isOpen && (
        <div ref={reader} className="manual-reader" id="user-manual-preview" role="region" aria-label="User manual preview">
          <div className="manual-reader-toolbar">
            <button className="manual-previous" type="button" aria-label="Previous manual page" disabled={page === 1} onClick={() => goToPage(page - 1)}><ChevronRight size={18} aria-hidden="true" /><span>Previous</span></button>
            <label className="manual-page-picker">
              <span>Jump to a topic</span>
              <select aria-label="Manual page" value={page} onChange={event => goToPage(Number(event.target.value))}>
                {manual.pageTitles.map((title, index) => <option key={index} value={index + 1}>{index + 1}. {title}</option>)}
              </select>
            </label>
            <button type="button" aria-label="Next manual page" disabled={page === pageCount} onClick={() => goToPage(page + 1)}><span>Next</span><ChevronRight size={18} aria-hidden="true" /></button>
          </div>
          <p className="manual-page-status" role="status">{hasError ? 'This page could not load. Use Open PDF or Download PDF above to read the manual.' : `${isLoading ? 'Loading ' : ''}Page ${page} of ${pageCount}: ${manual.pageTitles[page - 1]}`}</p>
          <div className="manual-page-frame" aria-busy={isLoading}>
            {!hasError && <img key={page} src={pageImage(page)} width="1200" height="1698" alt={`Manual page ${page} of ${pageCount}: ${manual.pageTitles[page - 1]}`} onLoad={() => setIsLoading(false)} onError={() => { setIsLoading(false); setHasError(true); }} />}
          </div>
          <p className="manual-reader-note">Use the PDF for bookmarks, clickable contents, and a closer view of diagrams. Download a copy to keep with your booth when offline.</p>
        </div>
      )}
    </section>
  );
}
