import React from 'react';
import { Mail } from 'lucide-react';
import './support-contact.css';

export default function SupportContact() {
  return (
    <section className="technical-support" id="support" aria-labelledby="technical-support-title">
      <div>
        <p className="eyebrow">Technical support</p>
        <h2 id="technical-support-title">Need help with PhotoTags?</h2>
        <p>
          For app issues, printer setup, licensing, or other technical concerns, email our support team.
          Include your app version, device and printer model, and a description of the issue so we can help.
        </p>
      </div>
      <a className="outline-button technical-support-email" href="mailto:support@phototags.app?subject=PhotoTags%20technical%20support">
        <Mail size={21} aria-hidden="true" />
        <span>support@phototags.app</span>
      </a>
    </section>
  );
}
