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
  LayoutDashboard,
  ListChecks,
  Loader2,
  Building2,
  Menu,
  MessageSquareText,
  Plus,
  Printer,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Star,
  ThumbsUp,
  UserSquare2,
  Wifi,
  X
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
const appVersions = [
  {
    versionName: '0.2.18',
    versionCode: 29,
    label: 'Latest early access build',
    date: 'September 2026',
    summary: 'Current PhotoTags early access build with photobooth, ID photo, gallery reprint, QR download, printer, camera, admin, update, and licensing preparation features.',
    sections: [
      {
        title: 'Modes',
        items: ['Photobooth mode', 'Photo ID mode', 'Saved photo gallery / reprint mode', 'Admin settings mode']
      },
      {
        title: 'Photobooth Mode',
        items: ['Start session flow', 'Capture 4 photos per session', 'Camera countdown timer', 'Template selection step', 'Final preview before printing', 'Optional signature/decorate step', 'Auto-print option after preview', 'QR download option for finished photo', 'Local save of finished photobooth output', 'Saved photos organized by date folders']
      },
      {
        title: 'Photobooth Templates',
        items: ['Double strip template', 'Classic / built-in 4R templates', 'Custom admin template', 'Additional 4R themed templates: Birthday party, Chrome bubbles, Disco party, Floral garden, Luxe black, Modern botanical, Pop blocks, Retro pop, Scrapbook, Sea glass, Starry night, Sweet love, Tropical summer, Zen mountains, Christmas rustic, Mystic moon, Retro Christmas film, Winter village, Cute Halloween, Gothic moon, Neon Halloween, Autumn pumpkin, Candy Christmas, Elegant holiday']
      },
      {
        title: 'Signature / Decoration',
        items: ['Signature drawing on photobooth output', 'Pen colors', 'Eraser', 'Undo', 'Redo', 'Clear signature', 'Cute Icons tab', 'Cute Stickers section', 'Funny Faces stickers', 'Hearts stickers', 'Flowers stickers', 'Party stickers', 'Kiosk Wow stickers', 'Wacky Words stickers', '50 optimized image stickers', 'Sticker drag/move', 'Sticker resize', 'Sticker rotation', 'Sticker remove', 'Clear icons']
      },
      {
        title: 'Photo ID Mode',
        items: ['Take photo or select existing photo', 'Face/photo review', '2 x 2 layout', '1 x 1 layout', 'Mixed ID layout', '4R paper support', 'Improved maximized ID layout', 'Mixed layout with larger 2 x 2 and smaller 1 x 1 photos', 'Background options: Original, White, Blue', 'QR/download upload support for finished ID photo']
      },
      {
        title: 'Printing',
        items: ['Direct USB/OTG printing', 'Canon print path', 'Epson print path', 'Print status display', 'Branded print initialization animation', 'Photobooth printing', 'Photo ID printing', 'Saved photo reprint', 'Reprint copy count controls', 'Print speed setting', 'Color brightness setting', 'Color vibrance setting', 'Color contrast setting', 'Media type setting', 'Paper size setting', 'Print orientation setting']
      },
      {
        title: 'Supported Printers',
        items: ['Canon PIXMA G1010', 'Epson L121', 'Epson L18050']
      },
      {
        title: 'Supported Cameras',
        items: ['Android built-in camera', 'Front camera with rear camera fallback', 'Logitech C270 webcam', 'USB webcam support through UVC/OTG', 'UVC-compatible Logitech-style webcams']
      },
      {
        title: 'Saved Gallery',
        items: ['Main screen gallery access button', 'View saved photo folders', 'Folder tiles with preview', 'Folder photo count', 'Browse saved photos', 'View saved photo', 'Reprint saved photo', 'Set number of reprint copies']
      },
      {
        title: 'Admin Settings',
        items: ['Kiosk mode selection', 'Camera source selection', 'Camera timer selection', 'Online download QR toggle', 'Photobooth auto-print toggle', 'Signature step toggle', 'ID photo gallery select toggle', 'Privacy policy viewer', 'Use policy viewer']
      },
      {
        title: 'Branding',
        items: ['Business name setting', 'Tagline setting', 'Landing page background image', 'Landing page logo', 'Remove background button', 'Remove logo button', 'Custom landing page branding display']
      },
      {
        title: 'Layout Admin',
        items: ['Choose default photobooth template', 'Choose visible customer templates', 'Lock customers to Admin template', 'Custom template background upload', 'Custom template frame controls', 'Custom template background placement', 'Option to put uploaded background in front of frames', 'Transparency-aware layering for PNG/GIF-style backgrounds']
      },
      {
        title: 'Online / QR',
        items: ['Upload finished photo for download', 'Generate QR code', 'Show QR code after session', 'QR expiry support from server response', 'Upload failure status handling']
      },
      {
        title: 'Licensing',
        items: ['Device registration with website API', 'License activation with license key', 'License check with website API', 'Stable device ID generation', 'Local license key storage', 'One license per device support', 'Admin license status section', 'Trial/licensed/blocked status support']
      },
      {
        title: 'Hidden Tools',
        items: ['Tools tab hidden by default', 'Unlock Tools tab by tapping the PhotoTags header 15 times', 'Printer tools', 'USB webcam/probe tools', 'App debug logs', 'Copy/clear debug logs']
      },
      {
        title: 'App Update',
        items: ['Checks website version.json', 'Shows update dialog when newer version is available', 'Opens APK download link']
      },
      {
        title: 'Privacy / Policy',
        items: ['Privacy policy dialog', 'Use policy dialog', 'Required policy acceptance before using the app']
      }
    ]
  }
];

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
    body: 'Pair PhotoTags with Canon PIXMA G1010, Epson L121, or Epson L18050 and save color, paper, and orientation presets.',
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
  const [isSiteMenuOpen, setIsSiteMenuOpen] = useState(false);
  const isAdminPage = window.location.pathname === '/admin' || window.location.hash === '#admin';
  const isBusinessPage = window.location.pathname.startsWith('/business');
  const downloadMatch = window.location.pathname.match(/^\/download\/([A-Za-z0-9_-]{4,64})\/?$/);
  const isDownloadPage = Boolean(downloadMatch);
  const isPrivacyPage = window.location.pathname === '/privacy-policy';
  const isUsePolicyPage = window.location.pathname === '/use-policy';

  useEffect(() => {
    if (!isAdminPage && !isBusinessPage && !isDownloadPage && !isPrivacyPage && !isUsePolicyPage) {
      trackAnalyticsEvent('site_visit');
    }
  }, [isAdminPage, isBusinessPage, isDownloadPage, isPrivacyPage, isUsePolicyPage]);

  if (isAdminPage) {
    return <AdminPage />;
  }

  if (isBusinessPage) {
    return <BusinessPage />;
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

  const siteLinks = [
    ['#features', 'Features'],
    ['#early-access', 'Early Access'],
    ['#app-versions', 'Versions'],
    ['#how-it-works', 'How It Works'],
    ['#printer-support', 'Printers'],
    ['#recommended-device', 'Device'],
    ['#id-photo', 'ID Photo'],
    ['#reviews', 'Reviews']
  ];

  return (
    <main className="page-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="PhotoTags home">
          <img src="/assets/logo-dark.png" alt="" />
          <span>PhotoTags</span>
        </a>
        <nav className="nav-links" aria-label="Primary navigation">
          {siteLinks.map(([href, label]) => (
            <a href={href} key={href}>{label}</a>
          ))}
        </nav>
        <div className="site-header-actions">
          <a className="ghost-link business-link" href="/business">Business</a>
          <a className="outline-button" href="/api/download-apk">
            <Download size={18} />
            Download APK
          </a>
          <button
            aria-expanded={isSiteMenuOpen}
            aria-label="Open menu"
            className="menu-button"
            type="button"
            onClick={() => setIsSiteMenuOpen(!isSiteMenuOpen)}
          >
            <Menu size={21} />
          </button>
        </div>
        {isSiteMenuOpen ? (
          <nav className="mobile-menu-panel" aria-label="Mobile navigation">
            {siteLinks.map(([href, label]) => (
              <a href={href} key={href} onClick={() => setIsSiteMenuOpen(false)}>{label}</a>
            ))}
            <a href="/business" onClick={() => setIsSiteMenuOpen(false)}>Business Dashboard</a>
            <a className="mobile-download-link" href="/api/download-apk" onClick={() => setIsSiteMenuOpen(false)}>
              <Download size={18} />
              Download APK
            </a>
          </nav>
        ) : null}
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
          <p className="early-access-note">
            PhotoTags is currently in early access. Pro licensing is being prepared, but no payment is required today.
          </p>
          <p className="support-line">
            Works with <strong>Canon PIXMA G1010</strong>
            <strong>Epson L121</strong>
            <strong>Epson L18050</strong>
            <span>Android camera and Logitech C270 supported</span>
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
          <span>Canon PIXMA G1010, Epson L121, and Epson L18050 supported</span>
        </div>
        <div>
          <Wifi />
          <span>Android camera and Logitech C270 USB webcam supported</span>
        </div>
      </section>

      <section className="recommended-device-section" id="recommended-device">
        <div className="section-heading">
          <p className="eyebrow">Recommended Device</p>
          <h2>Set up PhotoTags on hardware that can keep up.</h2>
        </div>
        <div className="device-requirements-grid">
          <article>
            <Smartphone aria-hidden="true" />
            <span>Android 10 or newer tablet/phone</span>
          </article>
          <article>
            <BadgeCheck aria-hidden="true" />
            <span>At least 3 GB RAM</span>
          </article>
          <article>
            <Camera aria-hidden="true" />
            <span>Good front camera or UVC USB webcam</span>
          </article>
          <article>
            <Wifi aria-hidden="true" />
            <span>USB OTG support</span>
          </article>
          <article>
            <RefreshCw aria-hidden="true" />
            <span>Stable internet for QR upload/download and license checks</span>
          </article>
          <article>
            <ImageIcon aria-hidden="true" />
            <span>Enough storage for saved photobooth images</span>
          </article>
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

      <section className="early-access-section" id="early-access">
        <div className="early-access-copy">
          <p className="eyebrow">PhotoTags Early Access</p>
          <h2>Available now while Pro licensing is being prepared.</h2>
          <p>
            PhotoTags is currently available as an early access download while we continue improving the app.
          </p>
          <p>
            A future update will introduce <strong>PhotoTags Pro</strong>, a one-time paid license for commercial and event use.
            Existing users will be notified clearly before any pricing changes take effect.
          </p>
          <p>
            Current early access users can continue using the app while we prepare licensing and activation.
            No payment is required today.
          </p>
        </div>

        <div className="early-access-list">
          <h3>Planned PhotoTags Pro includes:</h3>
          <div>
            <BadgeCheck /><span>License activation per device</span>
          </div>
          <div>
            <RefreshCw /><span>Continued app updates</span>
          </div>
          <div>
            <Camera /><span>Photobooth and ID photo tools</span>
          </div>
          <div>
            <ImageIcon /><span>Branding, templates, stickers, QR downloads, saved gallery, supported printers, cameras, and reprint features</span>
          </div>
          <a className="primary-button" href="/api/download-apk">
            <Download size={21} />
            Download Early Access APK
          </a>
        </div>
      </section>

      <AppVersionsSection />

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

function AppVersionsSection() {
  const [selectedVersion, setSelectedVersion] = useState(null);

  useEffect(() => {
    if (!selectedVersion) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedVersion(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedVersion]);

  return (
    <section className="app-versions-section" id="app-versions">
      <div className="section-heading">
        <p className="eyebrow">App versions</p>
        <h2>See what is included in each PhotoTags build.</h2>
      </div>

      <div className="app-version-layout">
        <div className="version-list" role="list" aria-label="PhotoTags versions">
          {appVersions.map((version) => (
            <button
              className="version-button"
              key={version.versionName}
              type="button"
              onClick={() => setSelectedVersion(version)}
            >
              <span>{version.label}</span>
              <strong>v{version.versionName}</strong>
              <small>Version code {version.versionCode} - {version.date}</small>
            </button>
          ))}
        </div>

        <article className="version-preview">
          <ListChecks aria-hidden="true" />
          <h3>Click a version to view updates.</h3>
          <p>Release notes open in a dialog so the version list stays easy to scan.</p>
        </article>
      </div>

      {selectedVersion ? (
        <div className="version-dialog-backdrop" role="presentation" onClick={() => setSelectedVersion(null)}>
          <section
            aria-labelledby="version-dialog-title"
            aria-modal="true"
            className="version-dialog"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="version-details-header">
              <div>
                <p className="eyebrow">v{selectedVersion.versionName}</p>
                <h3 id="version-dialog-title">{selectedVersion.label}</h3>
                <p>{selectedVersion.summary}</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setSelectedVersion(null)} aria-label="Close version updates">
                <X size={20} />
              </button>
            </div>

            <div className="version-feature-grid">
              {selectedVersion.sections.map((section) => (
                <section className="version-feature-group" key={section.title}>
                  <h4>{section.title}</h4>
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </section>
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
  const [showAllComments, setShowAllComments] = useState(false);

  const loadApprovedComments = async () => {
    try {
      const response = await fetch('/api/comments?status=approved&limit=100', {
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

  const visibleComments = showAllComments ? comments : comments.slice(0, 4);

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
          {comments.length ? visibleComments.map((comment) => (
            <ReviewCard comment={comment} key={comment.id} />
          )) : (
            <div className="empty-reviews">
              <ThumbsUp aria-hidden="true" />
              <p>Approved reviews will appear here soon.</p>
            </div>
          )}
          {comments.length > 4 ? (
            <button className="outline-button reviews-see-all" type="button" onClick={() => setShowAllComments(!showAllComments)}>
              {showAllComments ? 'Show fewer' : `See all ${comments.length} comments`}
            </button>
          ) : null}
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

const BUSINESS_AUTH_INITIAL = {
  businessName: '',
  ownerName: '',
  email: '',
  password: ''
};

const PAYMONGO_FORM_INITIAL = {
  paymongoPublicKey: '',
  paymongoSecretKey: '',
  qrphEnabled: true,
  webhookEnabled: false
};

function formatMoney(amount, currency = 'PHP') {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency
  }).format(Number(amount || 0) / 100);
}

function BusinessPage() {
  const [mode, setMode] = useState('login');
  const [authForm, setAuthForm] = useState(BUSINESS_AUTH_INITIAL);
  const [paymongoForm, setPaymongoForm] = useState(PAYMONGO_FORM_INITIAL);
  const [dashboard, setDashboard] = useState(null);
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  const loadDashboard = async () => {
    setStatus('loading');
    try {
      const response = await fetch('/api/business/dashboard', { headers: { Accept: 'application/json' } });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'dashboard_unavailable');
      }

      setDashboard(payload);
      setPaymongoForm({
        paymongoPublicKey: payload.paymentSettings.paymongoPublicKey || '',
        paymongoSecretKey: '',
        qrphEnabled: payload.paymentSettings.qrphEnabled,
        webhookEnabled: payload.paymentSettings.webhookEnabled
      });
      setStatus('ready');
    } catch {
      setDashboard(null);
      setStatus('auth');
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const submitAuth = async (event) => {
    event.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/business/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, ...authForm })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'auth_failed');
      }

      setAuthForm(BUSINESS_AUTH_INITIAL);
      await loadDashboard();
    } catch (error) {
      setStatus('auth');
      setMessage(`Could not ${mode}: ${error.message}.`);
    }
  };

  const savePayMongo = async (event) => {
    event.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/business/paymongo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymongoForm)
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'save_failed');
      }

      setMessage('PayMongo settings saved.');
      await loadDashboard();
    } catch (error) {
      setStatus('ready');
      setMessage(`Could not save PayMongo settings: ${error.message}.`);
    }
  };

  const removePayMongo = async () => {
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/business/paymongo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove' })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'remove_failed');
      }

      setMessage('PayMongo credentials removed.');
      await loadDashboard();
    } catch (error) {
      setStatus('ready');
      setMessage(`Could not remove PayMongo settings: ${error.message}.`);
    }
  };

  const generatePairingCode = async () => {
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/business/pairing-code', { method: 'POST' });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'pairing_failed');
      }

      setMessage(`Pairing code ${payload.pairingCode.code} created.`);
      await loadDashboard();
    } catch (error) {
      setStatus('ready');
      setMessage(`Could not create pairing code: ${error.message}.`);
    }
  };

  const logout = async () => {
    await fetch('/api/business/auth', { method: 'DELETE' });
    setDashboard(null);
    setStatus('auth');
  };

  if (status === 'loading' && !dashboard) {
    return (
      <main className="business-shell business-auth-shell">
        <Loader2 className="spin-icon" aria-hidden="true" />
      </main>
    );
  }

  if (!dashboard) {
    return (
      <main className="business-shell business-auth-shell">
        <section className="business-auth-panel">
          <a className="brand admin-brand" href="/" aria-label="PhotoTags home">
            <img src="/assets/logo-dark.png" alt="" />
            <span>PhotoTags</span>
          </a>
          <p className="eyebrow">Business dashboard</p>
          <h1>{mode === 'register' ? 'Create your business account.' : 'Sign in to your business account.'}</h1>
          <div className="business-auth-tabs">
            <button className={mode === 'login' ? 'business-tab-active' : ''} type="button" onClick={() => setMode('login')}>Login</button>
            <button className={mode === 'register' ? 'business-tab-active' : ''} type="button" onClick={() => setMode('register')}>Register</button>
          </div>
          <form className="login-form" onSubmit={submitAuth}>
            {mode === 'register' ? (
              <>
                <label>Business name<input required value={authForm.businessName} onChange={(event) => setAuthForm({ ...authForm, businessName: event.target.value })} /></label>
                <label>Owner name<input required value={authForm.ownerName} onChange={(event) => setAuthForm({ ...authForm, ownerName: event.target.value })} /></label>
              </>
            ) : null}
            <label>Email<input required type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} /></label>
            <label>Password<input required minLength={8} type="password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} /></label>
            {message ? <p className="login-error">{message}</p> : null}
            <button className="primary-button" type="submit">{mode === 'register' ? 'Create Account' : 'Log In'}</button>
          </form>
        </section>
      </main>
    );
  }

  const settings = dashboard.paymentSettings;
  const summary = dashboard.summary;

  return (
    <main className="business-shell">
      <header className="business-header">
        <a className="brand" href="/" aria-label="PhotoTags home">
          <img src="/assets/logo-dark.png" alt="" />
          <span>PhotoTags</span>
        </a>
        <button className="outline-button" type="button" onClick={logout}>Log out</button>
      </header>

      <section className="business-hero">
        <div>
          <p className="eyebrow">Business dashboard</p>
          <h1>{dashboard.business.businessName}</h1>
          <p>{dashboard.business.ownerName} - {dashboard.business.email}</p>
        </div>
        <ShieldCheck aria-hidden="true" />
      </section>

      <section className="business-status-grid">
        <article><span>PayMongo</span><strong>{settings.paymongoConnected ? 'Connected' : 'Not connected'}</strong></article>
        <article><span>QRPH</span><strong>{settings.qrphEnabled ? 'Enabled' : 'Not enabled'}</strong></article>
        <article><span>Linked devices</span><strong>{summary.linkedDevices}</strong></article>
      </section>

      {message ? <p className="business-message">{message}</p> : null}

      <section className="business-grid">
        <article className="business-card">
          <h2>PayMongo setup</h2>
          <form className="business-form" onSubmit={savePayMongo}>
            <label>Public key<input required value={paymongoForm.paymongoPublicKey} onChange={(event) => setPaymongoForm({ ...paymongoForm, paymongoPublicKey: event.target.value })} /></label>
            <label>Secret key<input required={!settings.secretKeySaved} type="password" placeholder={settings.secretKeySaved ? 'Saved - enter a new key to replace' : ''} value={paymongoForm.paymongoSecretKey} onChange={(event) => setPaymongoForm({ ...paymongoForm, paymongoSecretKey: event.target.value })} /></label>
            <label className="business-check"><input type="checkbox" checked={paymongoForm.qrphEnabled} onChange={(event) => setPaymongoForm({ ...paymongoForm, qrphEnabled: event.target.checked })} /> QRPH enabled</label>
            <label className="business-check"><input type="checkbox" checked={paymongoForm.webhookEnabled} onChange={(event) => setPaymongoForm({ ...paymongoForm, webhookEnabled: event.target.checked })} /> Webhook enabled</label>
            <div className="business-actions">
              <button className="primary-button" type="submit">Save PayMongo</button>
              <button className="outline-button" type="button" onClick={removePayMongo}>Remove</button>
            </div>
          </form>
        </article>

        <article className="business-card">
          <h2>Device pairing</h2>
          {dashboard.activePairingCode ? (
            <div className="pairing-code-box">
              <span>Active pairing code</span>
              <strong>{dashboard.activePairingCode.code}</strong>
              <small>Expires {formatDate(dashboard.activePairingCode.expires_at)}</small>
            </div>
          ) : (
            <p className="queue-empty">No active pairing code.</p>
          )}
          <button className="primary-button" type="button" onClick={generatePairingCode}>Generate Pairing Code</button>
        </article>
      </section>

      <section className="business-card">
        <h2>Registered devices</h2>
        <div className="business-table">
          {(dashboard.devices || []).length ? dashboard.devices.map((device) => (
            <div className="business-row" key={device.device_id}>
              <strong>{device.device_id}</strong>
              <span>{device.platform || 'android'}</span>
              <span>{device.app_version || 'unknown'}</span>
              <span>{formatDate(device.last_seen_at)}</span>
            </div>
          )) : <p className="queue-empty">No linked devices yet.</p>}
        </div>
      </section>

      <section className="business-card">
        <h2>Payment history</h2>
        <div className="business-table">
          {(dashboard.payments || []).length ? dashboard.payments.map((payment) => (
            <div className="business-row" key={payment.id}>
              <strong>{formatMoney(payment.amount, payment.currency)}</strong>
              <span>{payment.mode}</span>
              <span>{payment.status}</span>
              <span>{payment.device_id}</span>
              <span>{payment.paid_at ? formatDate(payment.paid_at) : formatDate(payment.created_at)}</span>
            </div>
          )) : <p className="queue-empty">No payment sessions yet.</p>}
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
    licenses: [],
    businesses: [],
    paymentSessions: []
  });
  const [licenseForm, setLicenseForm] = useState(LICENSE_FORM_INITIAL);
  const [activeAdminSection, setActiveAdminSection] = useState('overview');

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
        licenses: payload.licenses || [],
        businesses: payload.businesses || [],
        paymentSessions: payload.paymentSessions || []
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
    } catch (error) {
      setLicenseStatus('error');
      setLicenseMessage(`Could not create license${error.message ? `: ${error.message}` : ''}.`);
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
    } catch (error) {
      setLicenseStatus('error');
      setLicenseMessage(`Could not update license${error.message ? `: ${error.message}` : ''}.`);
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
    } catch (error) {
      setLicenseStatus('error');
      setLicenseMessage(`Could not unbind device${error.message ? `: ${error.message}` : ''}.`);
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
  const adminSections = useMemo(
    () => [
      {
        id: 'overview',
        label: 'Overview',
        icon: LayoutDashboard,
        status: analyticsStatus
      },
      {
        id: 'licenses',
        label: 'Licenses',
        icon: KeyRound,
        count: licenseData.summary.active,
        status: licenseStatus
      },
      {
        id: 'businesses',
        label: 'Businesses',
        icon: Building2,
        count: licenseData.businesses.length,
        status: licenseStatus
      },
      {
        id: 'comments',
        label: 'Reviews',
        icon: MessageSquareText,
        count: commentTabs.pending.length,
        status: commentStatus
      }
    ],
    [analyticsStatus, commentStatus, commentTabs, licenseData, licenseStatus]
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

  const renderAdminSection = () => {
    if (activeAdminSection === 'licenses') {
      return (
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
      );
    }

    if (activeAdminSection === 'comments') {
      return (
        <AdminCommentsSection
          comments={commentTabs}
          status={commentStatus}
          onRefresh={refreshAdminComments}
          onUpdateStatus={updateCommentStatus}
        />
      );
    }

    if (activeAdminSection === 'businesses') {
      return (
        <AdminBusinessesSection
          businesses={licenseData.businesses}
          paymentSessions={licenseData.paymentSessions}
          status={licenseStatus}
          onRefresh={refreshLicenses}
        />
      );
    }

    return (
      <AdminOverviewSection
        analytics={analytics}
        analyticsStatus={analyticsStatus}
        cards={cards}
      />
    );
  };

  return (
    <main className="admin-app-shell">
      <aside className="admin-sidebar">
        <a className="brand admin-sidebar-brand" href="/" aria-label="PhotoTags home">
          <img src="/assets/logo-dark.png" alt="" />
          <span>PhotoTags</span>
        </a>

        <nav className="admin-nav" aria-label="Admin sections">
          {adminSections.map((section) => {
            const Icon = section.icon;
            const isActive = activeAdminSection === section.id;

            return (
              <button
                className={isActive ? 'admin-nav-button admin-nav-button-active' : 'admin-nav-button'}
                key={section.id}
                type="button"
                onClick={() => setActiveAdminSection(section.id)}
              >
                <Icon size={19} aria-hidden="true" />
                <span>{section.label}</span>
                {typeof section.count === 'number' ? <strong>{section.count}</strong> : null}
              </button>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <a className="ghost-link" href="/">View website <ChevronRight size={20} /></a>
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
        </div>
      </aside>

      <section className="admin-content-shell">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">Admin dashboard</p>
            <h1>{adminSections.find((section) => section.id === activeAdminSection)?.label || 'Overview'}</h1>
          </div>
          <nav className="admin-mobile-nav" aria-label="Admin sections">
            {adminSections.map((section) => {
              const Icon = section.icon;
              const isActive = activeAdminSection === section.id;

              return (
                <button
                  className={isActive ? 'admin-mobile-button admin-mobile-button-active' : 'admin-mobile-button'}
                  key={section.id}
                  type="button"
                  onClick={() => setActiveAdminSection(section.id)}
                  aria-label={section.label}
                >
                  <Icon size={18} aria-hidden="true" />
                </button>
              );
            })}
          </nav>
        </header>

        <div className="admin-section-panel">
          {renderAdminSection()}
        </div>
      </section>
    </main>
  );
}

function AdminOverviewSection({ analytics, analyticsStatus, cards }) {
  return (
    <>
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>Visits, downloads, and licenses.</h1>
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
        <span className={`analytics-status analytics-status-${analyticsStatus}`}>
          {analyticsStatus === 'loading' ? 'Refreshing analytics' : null}
          {analyticsStatus === 'ready' ? 'Analytics up to date' : null}
          {analyticsStatus === 'error' ? 'Analytics unavailable' : null}
        </span>
      </div>
    </>
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

function AdminBusinessesSection({ businesses, paymentSessions, status, onRefresh }) {
  return (
    <section className="admin-licenses">
      <div className="admin-comments-heading">
        <div>
          <p className="eyebrow">Business accounts</p>
          <h2>Owners, devices, and payments.</h2>
        </div>
        <button className="outline-button" type="button" onClick={onRefresh}>
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="license-summary-grid">
        {[
          ['Businesses', businesses.length],
          ['Connected PayMongo', businesses.filter((business) => business.paymongoConnected).length],
          ['QRPH enabled', businesses.filter((business) => business.qrphEnabled).length],
          ['Linked devices', businesses.reduce((total, business) => total + business.linkedDevices.length, 0)],
          ['Payment sessions', paymentSessions.length],
          ['Paid sessions', paymentSessions.filter((payment) => payment.status === 'paid').length]
        ].map(([label, value]) => (
          <div className="license-summary-item" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <div className="license-list">
        {businesses.length ? businesses.map((business) => (
          <article className="license-card" key={business.id}>
            <div className="license-card-header">
              <div>
                <div className="license-key-row">
                  <Building2 aria-hidden="true" />
                  <strong>{business.businessName}</strong>
                </div>
                <p>{business.ownerName} - {business.email}</p>
              </div>
              <span className={business.paymongoConnected ? 'license-status license-status-active' : 'license-status'}>
                {business.paymongoConnected ? 'PayMongo connected' : 'PayMongo not connected'}
              </span>
            </div>

            <div className="license-meta-grid">
              <span>Status <strong>{business.status}</strong></span>
              <span>QRPH <strong>{business.qrphEnabled ? 'Enabled' : 'Not enabled'}</strong></span>
              <span>Webhook <strong>{business.webhookEnabled ? 'Enabled' : 'Not enabled'}</strong></span>
              <span>Devices <strong>{business.linkedDevices.length}</strong></span>
              <span>Payments <strong>{business.paymentSessions.length}</strong></span>
            </div>

            <div className="activation-list">
              <h4>Linked devices</h4>
              {business.linkedDevices.length ? business.linkedDevices.slice(0, 6).map((device) => (
                <div className="activation-row" key={device.device_id}>
                  <div>
                    <strong>{device.device_id}</strong>
                    <span>{device.platform || 'android'} - {device.app_version || 'unknown'} - last seen {formatDate(device.last_seen_at)}</span>
                  </div>
                </div>
              )) : <p className="queue-empty">No linked devices.</p>}
            </div>

            <div className="activation-list">
              <h4>Recent payments</h4>
              {business.paymentSessions.length ? business.paymentSessions.slice(0, 6).map((payment) => (
                <div className="activation-row" key={payment.id}>
                  <div>
                    <strong>{formatMoney(payment.amount, payment.currency)} - {payment.status}</strong>
                    <span>{payment.mode} - {payment.device_id} - {formatDate(payment.created_at)}</span>
                  </div>
                </div>
              )) : <p className="queue-empty">No payment sessions.</p>}
            </div>
          </article>
        )) : (
          <div className="license-empty">
            <Building2 aria-hidden="true" />
            <p>No business accounts yet.</p>
          </div>
        )}
      </div>

      <p className={`analytics-status analytics-status-${status}`}>
        {status === 'loading' ? 'Refreshing businesses' : null}
        {status === 'ready' ? 'Businesses up to date' : null}
        {status === 'error' ? 'Business tools unavailable' : null}
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
