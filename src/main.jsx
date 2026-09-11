import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertCircle,
  BadgeCheck,
  BarChart3,
  Camera,
  ChevronRight,
  Copy,
  Download,
  Grid2X2,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Star,
  ThumbsUp,
  UserSquare2,
  Wifi
} from 'lucide-react';
import './styles.css';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'phototags2026';
const ANALYTICS_FALLBACK = {
  visits: 0,
  downloads: 0,
  firstVisitAt: null,
  lastVisitAt: null,
  lastDownloadAt: null,
  topVisitLocations: [],
  topDownloadLocations: []
};
const REVIEW_FORM_INITIAL = {
  displayName: '',
  rating: 5,
  commentText: ''
};
const LICENSE_FORM_INITIAL = {
  licenseKey: '',
  customerEmail: '',
  paymentReference: '',
  plan: 'pro_lifetime',
  status: 'active',
  maxDevices: 1,
  expiresAt: ''
};
const LICENSE_STATUS_OPTIONS = ['active', 'revoked', 'refunded', 'expired'];
const LICENSE_PLAN_OPTIONS = ['pro_lifetime', 'pro_plus', 'business'];

const features = [
  {
    icon: Smartphone,
    title: 'Android-powered',
    body: 'Run the whole photobooth from one Android phone.'
  },
  {
    icon: Printer,
    title: 'Direct printing',
    body: 'Print straight to supported printers, no computer required.'
  },
  {
    icon: Grid2X2,
    title: 'Custom layouts',
    body: 'Create 2 x 2, 1 x 1, and mixed-size photo sheets.'
  },
  {
    icon: UserSquare2,
    title: 'ID Photo Mode',
    body: 'Capture cleaner ID photos with face guides and print preview.'
  }
];

const steps = [
  {
    title: 'Connect printer',
    body: 'Pair PhotoTags with Canon G1010 and save color, paper, and orientation presets.',
    image: '/assets/print-setup-transparent.png'
  },
  {
    title: 'Capture the set',
    body: 'Start a session and let the app guide guests through four timed photos.',
    image: '/assets/capture-screen-transparent.png'
  },
  {
    title: 'Print the keepsake',
    body: 'Preview the layout, choose copies, retake when needed, and print instantly.',
    image: '/assets/print-preview-transparent.png'
  }
];

async function trackAnalyticsEvent(eventType, pagePath = window.location.pathname) {
  try {
    await fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, pagePath }),
      keepalive: true
    });
  } catch {
    // Analytics should never interrupt the customer flow.
  }
}

function formatDate(value) {
  if (!value) {
    return 'Not recorded yet';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatReviewDate(value) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));
}

function App() {
  const isAdminPage = window.location.pathname === '/admin' || window.location.hash === '#admin';
  const downloadMatch = window.location.pathname.match(/^\/download\/([A-Za-z0-9_-]{4,64})\/?$/);
  const isDownloadPage = Boolean(downloadMatch);
  const isPrivacyPage = window.location.pathname === '/privacy-policy';
  const isUsePolicyPage = window.location.pathname === '/use-policy';

  useEffect(() => {
    if (!isAdminPage && !isDownloadPage && !isPrivacyPage && !isUsePolicyPage) {
      trackAnalyticsEvent('site_visit');
    }
  }, [isAdminPage, isDownloadPage, isPrivacyPage, isUsePolicyPage]);

  if (isAdminPage) {
    return <AdminPage />;
  }

  if (isDownloadPage) {
    return <DownloadPhotoPage code={downloadMatch[1]} />;
  }

  if (isPrivacyPage) {
    return <PolicyPage type="privacy" />;
  }

  if (isUsePolicyPage) {
    return <PolicyPage type="use" />;
  }

  return (
    <main className="page-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="PhotoTags home">
          <img src="/assets/logo-dark.png" alt="" />
          <span>PhotoTags</span>
        </a>
        <nav className="nav-links" aria-label="Primary navigation">
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#printer-support">Printer Support</a>
          <a href="#id-photo">ID Photo Mode</a>
          <a href="#reviews">Reviews</a>
        </nav>
        <a className="outline-button" href="/api/download-apk">
          <Download size={18} />
          Download APK
        </a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Portable <span /> Simple <span /> Print-ready</p>
          <h1>Your Android Phone. Your Complete Photobooth.</h1>
          <p className="hero-text">
            Capture, customize, and print memorable photos without a computer.
            Built for events, school IDs, and quick photo keepsakes.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="/api/download-apk">
              <Download size={21} />
              Download PhotoTags APK
            </a>
            <a className="ghost-link" href="#how-it-works">
              See how it works
              <ChevronRight size={20} />
            </a>
          </div>
          <p className="support-line">
            Works with <strong>Canon G1010</strong>
            <span>More printers coming soon</span>
          </p>
        </div>

        <div className="hero-art" aria-label="PhotoTags app preview">
          <div className="phone-stack">
            <img className="phone-shot phone-shot-left" src="/assets/home-screen-transparent.png" alt="PhotoTags start screen" />
            <img className="phone-shot phone-shot-main" src="/assets/capture-screen-transparent.png" alt="PhotoTags photo capture screen" />
            <img className="phone-shot phone-shot-right" src="/assets/print-preview-transparent.png" alt="PhotoTags print preview screen" />
          </div>
          <div className="status-pill">
            <BadgeCheck size={24} />
            <span>No computer required</span>
          </div>
        </div>
      </section>

      <section className="feature-band" id="features">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <article className="feature-card" key={feature.title}>
              <Icon aria-hidden="true" />
              <div>
                <h2>{feature.title}</h2>
                <p>{feature.body}</p>
              </div>
            </article>
          );
        })}
      </section>

      <section className="info-strip" id="printer-support">
        <div>
          <Grid2X2 />
          <span>2 x 2, 1 x 1, and mixed-size ID layouts</span>
        </div>
        <div>
          <Printer />
          <span>Canon G1010 supported</span>
        </div>
        <div>
          <Wifi />
          <span>Epson L121, L3210, and L8050 planned</span>
        </div>
      </section>

      <section className="showcase" id="how-it-works">
        <div className="section-heading">
          <p className="eyebrow">Fast event flow</p>
          <h2>From capture to print in minutes.</h2>
        </div>
        <div className="steps-grid">
          {steps.map((step, index) => (
            <article className="step-card" key={step.title}>
              <span className="step-number">0{index + 1}</span>
              <img src={step.image} alt={`${step.title} screen`} />
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="id-section" id="id-photo">
        <div className="id-media">
          <img src="/assets/home-screen-transparent.png" alt="PhotoTags app home screen" />
        </div>
        <div className="id-copy">
          <p className="eyebrow">Photo booth plus ID mode</p>
          <h2>Ready for parties, pop-ups, and quick ID photo jobs.</h2>
          <p>
            PhotoTags keeps the session simple for guests and practical for operators:
            guided capture, printer status, layout options, retakes, and print-ready output.
          </p>
          <div className="mini-list">
            <div><Camera /><span>Automatic session capture</span></div>
            <div><ImageIcon /><span>Portrait and ID layouts</span></div>
            <div><Printer /><span>Direct Android printing</span></div>
          </div>
          <a className="primary-button" href="/api/download-apk">
            <Download size={21} />
            Download APK
          </a>
        </div>
      </section>

      <ReviewSection />

      <footer className="site-footer">
        <span>PhotoTags</span>
        <div>
          <a href="/privacy-policy">Privacy Policy</a>
          <a href="/use-policy">Use Policy</a>
        </div>
      </footer>
    </main>
  );
}

const policyContent = {
  privacy: {
    eyebrow: 'Privacy Policy',
    title: 'PhotoTags Privacy Policy',
    updated: 'Last updated: September 7, 2026',
    intro: 'PhotoTags is built for quick photobooth sessions, APK downloads, customer reviews, and temporary QR photo downloads.',
    sections: [
      {
        title: 'Information We Collect',
        body: 'The website may collect basic analytics such as page visits, APK downloads, approximate location from Vercel request headers, browser user agent, referrer, customer review name, rating, and review text. QR photo downloads store temporary photo file paths, short codes, expiry times, and download counts.'
      },
      {
        title: 'Temporary Photo Downloads',
        body: 'Finished photobooth photos uploaded for QR download are stored in a private Supabase Storage bucket and are intended to expire after 30 minutes. Download pages use short-lived signed URLs and reject expired codes.'
      },
      {
        title: 'How We Use Information',
        body: 'We use this information to provide downloads, show approved customer reviews, understand general usage, troubleshoot the service, and improve PhotoTags.'
      },
      {
        title: 'What We Share',
        body: 'We do not sell customer information. Website hosting, database, storage, and analytics operations may be processed through service providers such as Vercel and Supabase.'
      },
      {
        title: 'Reviews',
        body: 'Submitted reviews are not shown publicly until approved in the admin page. Approved reviews may display the submitted name, rating, comment, and date.'
      },
      {
        title: 'Contact',
        body: 'For privacy questions or removal requests, contact the PhotoTags administrator or event operator that provided the app or website link.'
      }
    ]
  },
  use: {
    eyebrow: 'Use Policy',
    title: 'PhotoTags Use Policy',
    updated: 'Last updated: September 7, 2026',
    intro: 'This policy explains acceptable use of the PhotoTags website, APK download, QR photo download flow, and review/comment features.',
    sections: [
      {
        title: 'Acceptable Use',
        body: 'Use PhotoTags only for lawful photobooth, event, ID photo, and personal download purposes. Do not upload, share, or request content that is illegal, abusive, exploitative, hateful, or violates another person\'s rights.'
      },
      {
        title: 'Photo Uploads',
        body: 'Only upload photos you are authorized to handle. Event operators are responsible for getting any required consent from guests before capture, upload, printing, or sharing.'
      },
      {
        title: 'QR Links',
        body: 'QR photo links are temporary and should be shared only with the intended customer. Do not attempt to guess, scrape, automate, or abuse download codes.'
      },
      {
        title: 'Reviews and Comments',
        body: 'Reviews should be honest, relevant, and respectful. Spam, offensive content, private information, and misleading submissions may be rejected or removed.'
      },
      {
        title: 'Security',
        body: 'Do not attempt to bypass access controls, interfere with the website, attack Supabase or Vercel services, or reverse engineer private API behavior for abuse.'
      },
      {
        title: 'Changes',
        body: 'PhotoTags may update this policy as the app and website change. Continued use of the service means you accept the current policy.'
      }
    ]
  }
};

function PolicyPage({ type }) {
  const policy = policyContent[type];

  return (
    <main className="policy-shell">
      <header className="download-header">
        <a className="brand" href="/" aria-label="PhotoTags home">
          <img src="/assets/logo-dark.png" alt="" />
          <span>PhotoTags</span>
        </a>
      </header>

      <article className="policy-content">
        <p className="eyebrow">{policy.eyebrow}</p>
        <h1>{policy.title}</h1>
        <p className="policy-updated">{policy.updated}</p>
        <p className="policy-intro">{policy.intro}</p>
        {policy.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </section>
        ))}
      </article>
    </main>
  );
}

function RatingStars({ rating, onChange, size = 18 }) {
  return (
    <div className="rating-stars" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => {
        const isFilled = value <= rating;

        if (!onChange) {
          return (
            <Star
              key={value}
              size={size}
              aria-hidden="true"
              className={isFilled ? 'star-filled' : ''}
              fill={isFilled ? 'currentColor' : 'none'}
            />
          );
        }

        return (
          <button
            key={value}
            type="button"
            aria-label={`${value} star${value === 1 ? '' : 's'}`}
            className={isFilled ? 'star-button star-filled' : 'star-button'}
            onClick={() => onChange(value)}
          >
            <Star size={size} aria-hidden="true" fill={isFilled ? 'currentColor' : 'none'} />
          </button>
        );
      })}
    </div>
  );
}

function ReviewCard({ comment }) {
  return (
    <article className="review-card">
      <div className="review-avatar" aria-hidden="true">
        {comment.displayName.charAt(0).toUpperCase()}
      </div>
      <div className="review-body">
        <div className="review-meta">
          <strong>{comment.displayName}</strong>
          <span>{formatReviewDate(comment.createdAt)}</span>
        </div>
        <RatingStars rating={comment.rating} />
        <p>{comment.commentText}</p>
      </div>
    </article>
  );
}

function ReviewSection() {
  const [comments, setComments] = useState([]);
  const [form, setForm] = useState(REVIEW_FORM_INITIAL);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  const loadApprovedComments = async () => {
    try {
      const response = await fetch('/api/comments?status=approved', {
        headers: { Accept: 'application/json' }
      });
      const payload = await response.json();

      if (response.ok && payload.ok) {
        setComments(payload.comments);
      }
    } catch {
      setComments([]);
    }
  };

  useEffect(() => {
    loadApprovedComments();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus('submitting');
    setMessage('');

    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error('Review submit failed');
      }

      setForm(REVIEW_FORM_INITIAL);
      setStatus('success');
      setMessage(payload.message);
    } catch {
      setStatus('error');
      setMessage('We could not submit your review right now.');
    }
  };

  return (
    <section className="reviews-section" id="reviews">
      <div className="section-heading">
        <p className="eyebrow">Customer reviews</p>
        <h2>What PhotoTags users are saying.</h2>
      </div>

      <div className="reviews-layout">
        <div className="reviews-list">
          {comments.length ? comments.map((comment) => (
            <ReviewCard comment={comment} key={comment.id} />
          )) : (
            <div className="empty-reviews">
              <ThumbsUp aria-hidden="true" />
              <p>Approved reviews will appear here soon.</p>
            </div>
          )}
        </div>

        <form className="review-form" onSubmit={handleSubmit}>
          <h3>Write a review</h3>
          <label>
            Name
            <input
              required
              maxLength={80}
              value={form.displayName}
              onChange={(event) => setForm({ ...form, displayName: event.target.value })}
            />
          </label>
          <label>
            Rating
            <RatingStars rating={form.rating} onChange={(rating) => setForm({ ...form, rating })} size={24} />
          </label>
          <label>
            Comment
            <textarea
              required
              minLength={3}
              maxLength={1000}
              rows={5}
              value={form.commentText}
              onChange={(event) => setForm({ ...form, commentText: event.target.value })}
            />
          </label>
          {message ? <p className={`review-message review-message-${status}`}>{message}</p> : null}
          <button className="primary-button" type="submit" disabled={status === 'submitting'}>
            <Send size={18} />
            {status === 'submitting' ? 'Submitting' : 'Submit Review'}
          </button>
        </form>
      </div>
    </section>
  );
}

function DownloadPhotoPage({ code }) {
  const [downloadState, setDownloadState] = useState({
    status: 'loading',
    data: null,
    message: ''
  });

  const loadPhoto = async () => {
    setDownloadState({ status: 'loading', data: null, message: '' });

    try {
      const response = await fetch(`/api/download?code=${encodeURIComponent(code)}`, {
        headers: { Accept: 'application/json' }
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.ok) {
        const isExpired = response.status === 410 || payload.status === 'expired';
        setDownloadState({
          status: isExpired ? 'expired' : 'unavailable',
          data: payload,
          message: isExpired
            ? 'This photo link has expired.'
            : 'This photo is unavailable or the code is invalid.'
        });
        return;
      }

      setDownloadState({ status: 'ready', data: payload, message: '' });
    } catch {
      setDownloadState({
        status: 'unavailable',
        data: null,
        message: 'We could not load the photo right now. Please try again.'
      });
    }
  };

  useEffect(() => {
    loadPhoto();
  }, [code]);

  const expiresAt = downloadState.data?.expiresAt
    ? formatDate(downloadState.data.expiresAt)
    : null;

  return (
    <main className="download-shell">
      <header className="download-header">
        <a className="brand" href="/" aria-label="PhotoTags home">
          <img src="/assets/logo-dark.png" alt="" />
          <span>PhotoTags</span>
        </a>
      </header>

      <section className="download-panel" aria-live="polite">
        {downloadState.status === 'loading' ? (
          <div className="download-status">
            <Loader2 className="spin-icon" aria-hidden="true" />
            <p className="eyebrow">Preparing photo</p>
            <h1>Getting your PhotoTags keepsake.</h1>
          </div>
        ) : null}

        {downloadState.status === 'ready' ? (
          <>
            <div className="download-copy">
              <p className="eyebrow">Ready to save</p>
              <h1>Your photo is ready.</h1>
              {expiresAt ? <p>This private link expires at {expiresAt}.</p> : null}
            </div>
            <div className="photo-preview">
              <img src={downloadState.data.signedUrl} alt="Finished PhotoTags photobooth photo" />
            </div>
            <a className="primary-button download-photo-button" href={downloadState.data.downloadUrl || downloadState.data.signedUrl}>
              <Download size={21} />
              Download Photo
            </a>
          </>
        ) : null}

        {downloadState.status === 'expired' || downloadState.status === 'unavailable' ? (
          <div className="download-status">
            <AlertCircle aria-hidden="true" />
            <p className="eyebrow">Photo unavailable</p>
            <h1>{downloadState.message}</h1>
            <p>
              PhotoTags links are temporary for privacy and are available for 30 minutes after the session.
            </p>
            <button className="outline-button" type="button" onClick={loadPhoto}>
              <RefreshCw size={18} />
              Try Again
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function AdminPage() {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [isAuthed, setIsAuthed] = useState(() => sessionStorage.getItem('phototags.admin') === 'true');
  const [loginError, setLoginError] = useState('');
  const [analytics, setAnalytics] = useState(ANALYTICS_FALLBACK);
  const [analyticsStatus, setAnalyticsStatus] = useState('idle');
  const [adminPassword, setAdminPassword] = useState(() => sessionStorage.getItem('phototags.admin.password') || '');
  const [commentStatus, setCommentStatus] = useState('idle');
  const [commentTabs, setCommentTabs] = useState({
    pending: [],
    approved: [],
    rejected: []
  });
  const [licenseStatus, setLicenseStatus] = useState('idle');
  const [licenseMessage, setLicenseMessage] = useState('');
  const [licenseData, setLicenseData] = useState({
    summary: {
      licenses: 0,
      active: 0,
      revoked: 0,
      refunded: 0,
      expired: 0,
      activations: 0,
      devices: 0
    },
    licenses: []
  });
  const [licenseForm, setLicenseForm] = useState(LICENSE_FORM_INITIAL);

  useEffect(() => {
    if (!isAuthed) {
      return;
    }

    let isMounted = true;

    const refreshAnalytics = async () => {
      setAnalyticsStatus('loading');

      try {
        const response = await fetch('/api/analytics', {
          headers: { Accept: 'application/json' }
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error('Analytics request failed');
        }

        if (isMounted) {
          setAnalytics({
            visits: payload.visits,
            downloads: payload.downloads,
            firstVisitAt: payload.firstVisitAt,
            lastVisitAt: payload.lastVisitAt,
            lastDownloadAt: payload.lastDownloadAt,
            topVisitLocations: payload.topVisitLocations || [],
            topDownloadLocations: payload.topDownloadLocations || []
          });
          setAnalyticsStatus('ready');
        }
      } catch {
        if (isMounted) {
          setAnalyticsStatus('error');
        }
      }
    };

    refreshAnalytics();
    const intervalId = window.setInterval(refreshAnalytics, 30000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [isAuthed]);

  useEffect(() => {
    if (isAuthed && !adminPassword) {
      sessionStorage.removeItem('phototags.admin');
      setIsAuthed(false);
    }
  }, [isAuthed, adminPassword]);

  const refreshAdminComments = async () => {
    if (!isAuthed || !adminPassword) {
      return;
    }

    setCommentStatus('loading');

    try {
      const statuses = ['pending', 'approved', 'rejected'];
      const results = await Promise.all(statuses.map(async (status) => {
        const response = await fetch(`/api/comments?admin=1&status=${status}`, {
          headers: {
            Accept: 'application/json',
            'X-Admin-Password': adminPassword
          }
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error('Comment request failed');
        }

        return [status, payload.comments];
      }));

      setCommentTabs(Object.fromEntries(results));
      setCommentStatus('ready');
    } catch {
      setCommentStatus('error');
    }
  };

  useEffect(() => {
    refreshAdminComments();
  }, [isAuthed, adminPassword]);

  const refreshLicenses = async () => {
    if (!isAuthed || !adminPassword) {
      return;
    }

    setLicenseStatus('loading');
    setLicenseMessage('');

    try {
      const response = await fetch('/api/licenses', {
        headers: {
          Accept: 'application/json',
          'X-Admin-Password': adminPassword
        }
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error('License request failed');
      }

      setLicenseData({
        summary: payload.summary,
        licenses: payload.licenses || []
      });
      setLicenseStatus('ready');
    } catch {
      setLicenseStatus('error');
      setLicenseMessage('Licenses unavailable.');
    }
  };

  useEffect(() => {
    refreshLicenses();
  }, [isAuthed, adminPassword]);

  const updateCommentStatus = async (id, status) => {
    setCommentStatus('loading');

    try {
      const response = await fetch('/api/comments', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({ id, status })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error('Comment update failed');
      }

      await refreshAdminComments();
    } catch {
      setCommentStatus('error');
    }
  };

  const createLicense = async (event) => {
    event.preventDefault();
    setLicenseStatus('loading');
    setLicenseMessage('');

    try {
      const response = await fetch('/api/licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({
          ...licenseForm,
          licenseKey: licenseForm.licenseKey || undefined,
          expiresAt: licenseForm.expiresAt || null,
          maxDevices: Number(licenseForm.maxDevices || 1)
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'License create failed');
      }

      setLicenseForm(LICENSE_FORM_INITIAL);
      setLicenseMessage(`Created ${payload.license.licenseKey}`);
      await refreshLicenses();
    } catch {
      setLicenseStatus('error');
      setLicenseMessage('Could not create license.');
    }
  };

  const updateLicense = async (id, updates) => {
    setLicenseStatus('loading');
    setLicenseMessage('');

    try {
      const response = await fetch('/api/licenses', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({ id, ...updates })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'License update failed');
      }

      setLicenseMessage('License updated.');
      await refreshLicenses();
    } catch {
      setLicenseStatus('error');
      setLicenseMessage('Could not update license.');
    }
  };

  const unbindActivation = async (activationId) => {
    setLicenseStatus('loading');
    setLicenseMessage('');

    try {
      const response = await fetch('/api/licenses', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({ action: 'unbind_device', activationId })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'License unbind failed');
      }

      setLicenseMessage('Device unbound.');
      await refreshLicenses();
    } catch {
      setLicenseStatus('error');
      setLicenseMessage('Could not unbind device.');
    }
  };

  const cards = useMemo(
    () => [
      { label: 'Site visits', value: analytics.visits },
      { label: 'APK downloads', value: analytics.downloads },
      {
        label: 'Download rate',
        value: analytics.visits ? `${Math.round((analytics.downloads / analytics.visits) * 100)}%` : '0%'
      },
      { label: 'Active licenses', value: licenseData.summary.active },
      { label: 'Activations', value: licenseData.summary.activations },
      {
        label: 'Tracked devices',
        value: licenseData.summary.devices
      }
    ],
    [analytics, licenseData]
  );

  const handleSubmit = (event) => {
    event.preventDefault();

    if (credentials.username === ADMIN_USERNAME && credentials.password === ADMIN_PASSWORD) {
      sessionStorage.setItem('phototags.admin', 'true');
      sessionStorage.setItem('phototags.admin.password', credentials.password);
      setAdminPassword(credentials.password);
      setIsAuthed(true);
      setLoginError('');
      return;
    }

    setLoginError('Invalid username or password.');
  };

  if (!isAuthed) {
    return (
      <main className="admin-shell login-shell">
        <section className="login-panel" aria-labelledby="admin-login-title">
          <a className="brand admin-brand" href="/" aria-label="PhotoTags home">
            <img src="/assets/logo-dark.png" alt="" />
            <span>PhotoTags</span>
          </a>
          <p className="eyebrow">Admin access</p>
          <h1 id="admin-login-title">Download and visit tracker.</h1>
          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              Username
              <input
                autoComplete="username"
                value={credentials.username}
                onChange={(event) => setCredentials({ ...credentials, username: event.target.value })}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={credentials.password}
                onChange={(event) => setCredentials({ ...credentials, password: event.target.value })}
              />
            </label>
            {loginError ? <p className="login-error">{loginError}</p> : null}
            <button className="primary-button" type="submit">Log in</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <a className="brand" href="/" aria-label="PhotoTags home">
          <img src="/assets/logo-dark.png" alt="" />
          <span>PhotoTags</span>
        </a>
        <button
          className="outline-button"
          type="button"
          onClick={() => {
            sessionStorage.removeItem('phototags.admin');
            sessionStorage.removeItem('phototags.admin.password');
            setAdminPassword('');
            setIsAuthed(false);
          }}
        >
          Log out
        </button>
      </header>

      <section className="admin-hero">
        <div>
          <p className="eyebrow">Admin dashboard</p>
          <h1>Visits and APK downloads.</h1>
          <p>
            Counts refresh automatically while this page is open.
          </p>
        </div>
        <BarChart3 aria-hidden="true" />
      </section>

      <section className="stats-grid">
        {cards.map((card) => (
          <article className="stat-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </section>

      <section className="admin-details">
        <div>
          <span>First visit</span>
          <strong>{formatDate(analytics.firstVisitAt)}</strong>
        </div>
        <div>
          <span>Latest visit</span>
          <strong>{formatDate(analytics.lastVisitAt)}</strong>
        </div>
        <div>
          <span>Latest APK download</span>
          <strong>{formatDate(analytics.lastDownloadAt)}</strong>
        </div>
      </section>

      <section className="location-grid">
        <LocationList title="Visitor locations" locations={analytics.topVisitLocations} />
        <LocationList title="APK download locations" locations={analytics.topDownloadLocations} />
      </section>

      <div className="admin-actions">
        <a className="ghost-link" href="/">View website <ChevronRight size={20} /></a>
        <span className={`analytics-status analytics-status-${analyticsStatus}`}>
          {analyticsStatus === 'loading' ? 'Refreshing analytics' : null}
          {analyticsStatus === 'ready' ? 'Analytics up to date' : null}
          {analyticsStatus === 'error' ? 'Analytics unavailable' : null}
        </span>
      </div>

      <AdminCommentsSection
        comments={commentTabs}
        status={commentStatus}
        onRefresh={refreshAdminComments}
        onUpdateStatus={updateCommentStatus}
      />

      <AdminLicensesSection
        data={licenseData}
        form={licenseForm}
        message={licenseMessage}
        status={licenseStatus}
        onCreate={createLicense}
        onFormChange={setLicenseForm}
        onRefresh={refreshLicenses}
        onUnbindActivation={unbindActivation}
        onUpdateLicense={updateLicense}
      />
    </main>
  );
}

function LocationList({ title, locations }) {
  return (
    <article className="location-card">
      <h2>{title}</h2>
      {locations.length ? (
        <div className="location-list">
          {locations.map((location) => (
            <div className="location-row" key={`${title}-${location.label}-${location.timezone || ''}`}>
              <span>{location.label}</span>
              <strong>{location.count}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p>No location data yet.</p>
      )}
    </article>
  );
}

function AdminLicensesSection({
  data,
  form,
  message,
  status,
  onCreate,
  onFormChange,
  onRefresh,
  onUnbindActivation,
  onUpdateLicense
}) {
  const copyLicenseKey = async (licenseKey) => {
    if (!navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(licenseKey);
  };

  return (
    <section className="admin-licenses">
      <div className="admin-comments-heading">
        <div>
          <p className="eyebrow">License management</p>
          <h2>Track keys and activations.</h2>
        </div>
        <button className="outline-button" type="button" onClick={onRefresh}>
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="license-summary-grid">
        {[
          ['Total licenses', data.summary.licenses],
          ['Active', data.summary.active],
          ['Revoked', data.summary.revoked],
          ['Refunded', data.summary.refunded],
          ['Expired', data.summary.expired],
          ['Devices', data.summary.devices]
        ].map(([label, value]) => (
          <div className="license-summary-item" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <form className="license-create-form" onSubmit={onCreate}>
        <div className="license-form-title">
          <KeyRound aria-hidden="true" />
          <h3>Create license</h3>
        </div>
        <label>
          License key
          <input
            placeholder="Leave blank to generate"
            value={form.licenseKey}
            onChange={(event) => onFormChange({ ...form, licenseKey: event.target.value })}
          />
        </label>
        <label>
          Customer email
          <input
            type="email"
            value={form.customerEmail}
            onChange={(event) => onFormChange({ ...form, customerEmail: event.target.value })}
          />
        </label>
        <label>
          Payment reference
          <input
            value={form.paymentReference}
            onChange={(event) => onFormChange({ ...form, paymentReference: event.target.value })}
          />
        </label>
        <label>
          Plan
          <select
            value={form.plan}
            onChange={(event) => onFormChange({ ...form, plan: event.target.value })}
          >
            {LICENSE_PLAN_OPTIONS.map((plan) => (
              <option key={plan} value={plan}>{plan}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={form.status}
            onChange={(event) => onFormChange({ ...form, status: event.target.value })}
          >
            {LICENSE_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Max devices
          <input
            min="1"
            max="1000"
            type="number"
            value={form.maxDevices}
            onChange={(event) => onFormChange({ ...form, maxDevices: event.target.value })}
          />
        </label>
        <label>
          Expires at
          <input
            type="datetime-local"
            value={form.expiresAt}
            onChange={(event) => onFormChange({ ...form, expiresAt: event.target.value })}
          />
        </label>
        <button className="primary-button" type="submit" disabled={status === 'loading'}>
          <Plus size={18} />
          Create
        </button>
      </form>

      {message ? <p className={`analytics-status analytics-status-${status}`}>{message}</p> : null}

      <div className="license-list">
        {data.licenses.length ? data.licenses.map((license) => (
          <article className="license-card" key={license.id}>
            <div className="license-card-header">
              <div>
                <div className="license-key-row">
                  <ShieldCheck aria-hidden="true" />
                  <strong>{license.licenseKey}</strong>
                  <button className="icon-button" type="button" onClick={() => copyLicenseKey(license.licenseKey)} aria-label="Copy license key">
                    <Copy size={17} />
                  </button>
                </div>
                <p>
                  {license.customerEmail || 'No customer email'} - {license.paymentReference || 'No payment reference'}
                </p>
              </div>
              <span className={`license-status license-status-${license.status}`}>{license.status}</span>
            </div>

            <div className="license-meta-grid">
              <span>Plan <strong>{license.plan}</strong></span>
              <span>Seats <strong>{license.activationCount}/{license.maxDevices}</strong></span>
              <span>Created <strong>{formatReviewDate(license.createdAt)}</strong></span>
              <span>Activated <strong>{formatDate(license.activatedAt)}</strong></span>
              <span>Expires <strong>{formatDate(license.expiresAt)}</strong></span>
            </div>

            <div className="license-controls">
              <label>
                Status
                <select value={license.status} onChange={(event) => onUpdateLicense(license.id, { status: event.target.value })}>
                  {LICENSE_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label>
                Max devices
                <input
                  min="1"
                  max="1000"
                  type="number"
                  defaultValue={license.maxDevices}
                  onBlur={(event) => {
                    const nextValue = Number(event.target.value);
                    if (nextValue !== license.maxDevices) {
                      onUpdateLicense(license.id, { maxDevices: nextValue });
                    }
                  }}
                />
              </label>
            </div>

            <div className="activation-list">
              <h4>Activations</h4>
              {license.activations.length ? license.activations.map((activation) => (
                <div className="activation-row" key={activation.id}>
                  <div>
                    <strong>{activation.deviceId}</strong>
                    <span>
                      {activation.device?.platform || 'android'} - {activation.device?.appVersion || 'unknown app'} - last checked {formatDate(activation.lastCheckedAt)}
                    </span>
                  </div>
                  <button className="outline-button" type="button" onClick={() => onUnbindActivation(activation.id)}>
                    Unbind
                  </button>
                </div>
              )) : (
                <p className="queue-empty">No devices activated yet.</p>
              )}
            </div>
          </article>
        )) : (
          <div className="license-empty">
            <KeyRound aria-hidden="true" />
            <p>No licenses created yet.</p>
          </div>
        )}
      </div>

      <p className={`analytics-status analytics-status-${status}`}>
        {status === 'loading' ? 'Refreshing licenses' : null}
        {status === 'ready' ? 'Licenses up to date' : null}
        {status === 'error' ? 'License tools unavailable' : null}
      </p>
    </section>
  );
}

function AdminCommentsSection({ comments, status, onRefresh, onUpdateStatus }) {
  return (
    <section className="admin-comments">
      <div className="admin-comments-heading">
        <div>
          <p className="eyebrow">Review moderation</p>
          <h2>Approve customer comments.</h2>
        </div>
        <button className="outline-button" type="button" onClick={onRefresh}>
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="comment-queues">
        {['pending', 'approved', 'rejected'].map((queue) => (
          <div className="comment-queue" key={queue}>
            <h3>{queue.charAt(0).toUpperCase() + queue.slice(1)} ({comments[queue].length})</h3>
            {comments[queue].length ? comments[queue].map((comment) => (
              <article className="moderation-card" key={comment.id}>
                <div className="review-meta">
                  <strong>{comment.displayName}</strong>
                  <span>{formatReviewDate(comment.createdAt)}</span>
                </div>
                <RatingStars rating={comment.rating} />
                <p>{comment.commentText}</p>
                <div className="moderation-actions">
                  {queue !== 'approved' ? (
                    <button className="primary-button" type="button" onClick={() => onUpdateStatus(comment.id, 'approved')}>
                      Approve
                    </button>
                  ) : null}
                  {queue !== 'rejected' ? (
                    <button className="outline-button" type="button" onClick={() => onUpdateStatus(comment.id, 'rejected')}>
                      Reject
                    </button>
                  ) : null}
                </div>
              </article>
            )) : (
              <p className="queue-empty">No {queue} comments.</p>
            )}
          </div>
        ))}
      </div>

      <p className={`analytics-status analytics-status-${status}`}>
        {status === 'loading' ? 'Refreshing comments' : null}
        {status === 'ready' ? 'Comments up to date' : null}
        {status === 'error' ? 'Comments unavailable' : null}
      </p>
    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);
