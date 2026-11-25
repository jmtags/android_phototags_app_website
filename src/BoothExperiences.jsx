import React from 'react';
import { Camera, ChevronRight, Grid2X2, Image as ImageIcon, Printer, UserSquare2 } from 'lucide-react';
import './booth-experiences.css';

const customerModes = [
  { name: 'Photobooth', icon: Camera, description: 'Timed photos, creative layouts, signatures, and stickers.', href: '#features' },
  { name: 'Receiptbooth', icon: Grid2X2, description: 'Small prints with comic covers, posters, and receipt-style keepsakes.', href: '#receiptbooth-templates' },
  { name: 'ID Photo', icon: UserSquare2, description: '2 × 2, 1 × 1, and mixed ID layouts with background options.', href: '#id-photo' },
  { name: 'Newspaper Booth', icon: ImageIcon, description: 'Full A4 front pages starring your guests in 1–4 photos.', href: '#newspaper-booth' }
];

const newspaperTemplates = [
  { name: 'The Daily Moment', image: 'daily-moment', caption: 'Your memory, front-page news.' },
  { name: 'The PhotoTags Times', image: 'phototags-times', caption: 'Local stars steal the spotlight.' },
  { name: 'Wanted', image: 'wanted', caption: 'Wanted for looking this good.' },
  { name: 'The Everyday Icon', image: 'everyday-icon', caption: 'Your moments. Your cover.' }
];

export default function BoothExperiences() {
  return (
    <>
      <section className="customer-modes-section" id="customer-modes" aria-labelledby="customer-modes-title">
        <div className="section-heading">
          <p className="eyebrow">Four customer modes</p>
          <h2 id="customer-modes-title">One Start button. Their kind of photo experience.</h2>
          <p>Guests tap Start and choose from the modes you make available. Run a dedicated booth or offer several experiences from the same Android device.</p>
        </div>
        <div className="customer-mode-grid">
          {customerModes.map(({ name, icon: Icon, description, href }) => (
            <a className="customer-mode-card" href={href} key={name}>
              <Icon size={30} aria-hidden="true" />
              <h3>{name}</h3>
              <p>{description}</p>
              <span>Explore this mode <ChevronRight size={16} aria-hidden="true" /></span>
            </a>
          ))}
        </div>
        <div className="customer-mode-settings">
          <ExperienceDetail title="Your menu, your choice">Show or hide each mode in Admin &gt; Session &gt; Customer Mode Menu. With one mode enabled, Start opens it directly.</ExperienceDetail>
          <ExperienceDetail title="Each mode remembers its setup">Save printer and session settings per mode. Camera source and countdown stay shared, so guests use the same camera across experiences.</ExperienceDetail>
        </div>
      </section>

      <section className="newspaper-section" id="newspaper-booth" aria-labelledby="newspaper-booth-title">
        <div className="newspaper-intro">
          <div>
            <p className="eyebrow">New · Newspaper Booth</p>
            <h2 id="newspaper-booth-title">Make your guests the front-page story.</h2>
            <p>Turn a photo session into a full A4 newspaper keepsake. Choose one of four designs and 1–4 shots, then personalize the page with signatures and cute icons before printing.</p>
          </div>
          <a className="primary-button" href="/api/download-apk">Get Newspaper Booth <ChevronRight size={19} aria-hidden="true" /></a>
        </div>
        <ul className="newspaper-highlights" aria-label="Newspaper Booth features">
          <li><ImageIcon size={19} aria-hidden="true" /> Four designs, 1–4 photos each</li>
          <li><Printer size={19} aria-hidden="true" /> Full A4 portrait pages</li>
          <li><Camera size={19} aria-hidden="true" /> Reposition, zoom, and retake</li>
        </ul>
        <div className="newspaper-template-grid">
          {newspaperTemplates.map(template => (
            <figure className="newspaper-template-card" key={template.image}>
              <img src={`/assets/newspaper-${template.image}.webp`} alt={`${template.name} A4 newspaper layout preview with four photo placeholders`} width="760" height="1075" loading="lazy" />
              <figcaption><h3>{template.name}</h3><p>{template.caption}</p><span>4-shot layout preview · also supports 1, 2, or 3 shots</span></figcaption>
            </figure>
          ))}
        </div>
        <div className="newspaper-details">
          <ExperienceDetail title="Choose. Capture. Decorate. Print.">Pick a design and shot count, take your photos, adjust each photo, and add a signature or stickers. The finished page is saved locally; a download QR is offered after printing.</ExperienceDetail>
          <ExperienceDetail title="Set it up for your event">Newspaper Quick Setup saves the starting design, printer settings, and retake limit. Use a supported A4 inkjet printer, not a receipt printer. QR uploads need internet; local saving and printing can continue if an upload fails.</ExperienceDetail>
        </div>
        <p className="newspaper-upgrade-note">Upgrading an existing booth? Enable Newspaper Booth in Admin &gt; Session &gt; Customer Mode Menu to add it to your saved menu.</p>
      </section>
    </>
  );
}

function ExperienceDetail({ title, children }) {
  return <div><h3>{title}</h3><p>{children}</p></div>;
}
