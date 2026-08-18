import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  BadgeCheck,
  Camera,
  ChevronRight,
  Download,
  Grid2X2,
  Image as ImageIcon,
  Printer,
  Smartphone,
  UserSquare2,
  Wifi
} from 'lucide-react';
import './styles.css';

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

function App() {
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
        <a className="outline-button" href="/PhotoTags.apk" download>
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
            <a className="primary-button" href="/PhotoTags.apk" download>
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
          <a className="primary-button" href="/PhotoTags.apk" download>
            <Download size={21} />
            Download APK
          </a>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
