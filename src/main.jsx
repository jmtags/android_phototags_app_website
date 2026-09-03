import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertCircle,
  BadgeCheck,
  BarChart3,
  Camera,
  ChevronRight,
  Download,
  Grid2X2,
  Image as ImageIcon,
  Loader2,
  Printer,
  RefreshCw,
  Smartphone,
  UserSquare2,
  Wifi
} from 'lucide-react';
import './styles.css';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'phototags2026';
const ANALYTICS_KEY = 'phototags.analytics.v1';

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

function getAnalytics() {
  const fallback = {
    visits: 0,
    downloads: 0,
    firstVisitAt: null,
    lastVisitAt: null,
    lastDownloadAt: null
  };

  try {
    const stored = JSON.parse(localStorage.getItem(ANALYTICS_KEY));
    return { ...fallback, ...stored };
  } catch {
    return fallback;
  }
}

function saveAnalytics(nextAnalytics) {
  localStorage.setItem(ANALYTICS_KEY, JSON.stringify(nextAnalytics));
  window.dispatchEvent(new Event('phototags-analytics-updated'));
}

function trackVisit() {
  const now = new Date().toISOString();
  const analytics = getAnalytics();
  saveAnalytics({
    ...analytics,
    visits: analytics.visits + 1,
    firstVisitAt: analytics.firstVisitAt ?? now,
    lastVisitAt: now
  });
}

function trackDownload() {
  const now = new Date().toISOString();
  const analytics = getAnalytics();
  saveAnalytics({
    ...analytics,
    downloads: analytics.downloads + 1,
    lastDownloadAt: now
  });
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

function App() {
  const isAdminPage = window.location.pathname === '/admin' || window.location.hash === '#admin';
  const downloadMatch = window.location.pathname.match(/^\/download\/([A-Za-z0-9_-]{4,64})\/?$/);
  const isDownloadPage = Boolean(downloadMatch);

  useEffect(() => {
    if (!isAdminPage && !isDownloadPage) {
      trackVisit();
    }
  }, [isAdminPage, isDownloadPage]);

  if (isAdminPage) {
    return <AdminPage />;
  }

  if (isDownloadPage) {
    return <DownloadPhotoPage code={downloadMatch[1]} />;
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
        </nav>
        <a className="outline-button" href="/PhotoTags.apk" download onClick={trackDownload}>
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
            <a className="primary-button" href="/PhotoTags.apk" download onClick={trackDownload}>
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
          <a className="primary-button" href="/PhotoTags.apk" download onClick={trackDownload}>
            <Download size={21} />
            Download APK
          </a>
        </div>
      </section>
    </main>
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
  const [analytics, setAnalytics] = useState(getAnalytics);

  useEffect(() => {
    const refreshAnalytics = () => setAnalytics(getAnalytics());
    window.addEventListener('storage', refreshAnalytics);
    window.addEventListener('phototags-analytics-updated', refreshAnalytics);
    return () => {
      window.removeEventListener('storage', refreshAnalytics);
      window.removeEventListener('phototags-analytics-updated', refreshAnalytics);
    };
  }, []);

  const cards = useMemo(
    () => [
      { label: 'Site visits', value: analytics.visits },
      { label: 'APK downloads', value: analytics.downloads },
      {
        label: 'Download rate',
        value: analytics.visits ? `${Math.round((analytics.downloads / analytics.visits) * 100)}%` : '0%'
      }
    ],
    [analytics]
  );

  const handleSubmit = (event) => {
    event.preventDefault();

    if (credentials.username === ADMIN_USERNAME && credentials.password === ADMIN_PASSWORD) {
      sessionStorage.setItem('phototags.admin', 'true');
      setIsAuthed(true);
      setLoginError('');
      return;
    }

    setLoginError('Invalid username or password.');
  };

  const resetAnalytics = () => {
    saveAnalytics({
      visits: 0,
      downloads: 0,
      firstVisitAt: null,
      lastVisitAt: null,
      lastDownloadAt: null
    });
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
            Counts are saved in this browser because the website has no backend database yet.
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

      <div className="admin-actions">
        <a className="ghost-link" href="/">View website <ChevronRight size={20} /></a>
        <button className="outline-button" type="button" onClick={resetAnalytics}>Reset local stats</button>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
