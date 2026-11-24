import React from 'react';
import { Mail, MessageSquareText } from 'lucide-react';
import './support-contact.css';

export const FACEBOOK_PAGE_URL = 'https://www.facebook.com/profile.php?id=61596891779973';

export default function SupportContact() {
  return (
    <section className="technical-support" id="support" aria-labelledby="technical-support-title">
      <div className="technical-support-copy">
        <p className="eyebrow">Technical support</p>
        <h2 id="technical-support-title">Need help with PhotoTags?</h2>
        <p>
          For inquiries and a quick response, message our official Facebook page.
          You can also email our support team for app issues, printer setup, licensing, or other technical concerns.
          Include your app version, device and printer model, and a description of the issue so we can help.
        </p>
      </div>
      <div className="technical-support-actions">
        <a className="primary-button" href={FACEBOOK_PAGE_URL} target="_blank" rel="noopener noreferrer">
          <MessageSquareText size={21} aria-hidden="true" />
          <span>Message us on Facebook</span>
        </a>
        <a className="outline-button technical-support-email" href="mailto:support@phototags.app?subject=PhotoTags%20technical%20support">
          <Mail size={21} aria-hidden="true" />
          <span>support@phototags.app</span>
        </a>
      </div>
    </section>
  );
}
