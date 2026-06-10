import { Link } from 'react-router-dom';
import { Shield, Lock, Eye, Server, Trash2 } from 'lucide-react';
import { PrivacyBadge } from '../components/ui/PrivacyBadge';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      <header className="border-b border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-950 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm font-bold">
            <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-white text-xs">FV</div>
            FolioVault <PrivacyBadge label="Private" className="text-[9px] !px-1.5 !py-0" />
          </Link>
          <Link to="/app/dashboard" className="text-xs font-bold text-blue-600 hover:underline">
            Open Dashboard →
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-5 sm:p-8 space-y-8">
        <section className="space-y-3">
          <h1 className="text-3xl font-black tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-slate-500">
            Last updated: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            FolioVault is built around a single principle: <strong>your financial data belongs to you, not to us.</strong>{' '}
            This page explains exactly what data we collect (spoiler: essentially none) and what data stays on your device.
          </p>
        </section>

        <Section icon={<Lock className="w-5 h-5 text-blue-500" />} title="What data lives ONLY on your device">
          <ul className="list-disc pl-5 space-y-1.5 text-sm">
            <li>All holdings (mutual funds, stocks, PPF, NPS, FDs, SGB, gold, US stocks)</li>
            <li>All transaction history (buy / sell / SIP / dividend / interest / bonus)</li>
            <li>Insurance policies and outstanding loans (Pro)</li>
            <li>Family member profiles (Pro)</li>
            <li>Financial goals and allocation preferences</li>
            <li>App preferences (theme, benchmark, default portfolio)</li>
          </ul>
          <p className="text-sm leading-relaxed">
            This data is stored in your browser's <strong>IndexedDB</strong> under the database name <code>foliovault_v1</code>.
            You can wipe it at any time from your browser's site settings, or by clicking "Clear All Data" in Settings.
          </p>
        </Section>

        <Section icon={<Eye className="w-5 h-5 text-emerald-500" />} title="What we (the FolioVault team) can see">
          <p className="text-sm leading-relaxed">
            <strong>Nothing about your holdings, transactions, or finances.</strong> Ever.
          </p>
          <p className="text-sm leading-relaxed">
            We do not run a server-side database of user portfolios. The only data our servers handle are:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm">
            <li>
              <strong>CAS PDF uploads (optional, Pro):</strong> when you explicitly upload a CAMS/KFintech statement,
              the PDF is sent to our server which forwards it to Google Gemini for parsing. The PDF is not stored.
            </li>
            <li>
              <strong>Stock/MF price queries:</strong> our server proxies public requests to Yahoo Finance and MFAPI.in
              and returns the latest price. The symbol you query is logged in aggregate (no user association) for rate limiting.
            </li>
            <li>
              <strong>Encrypted backups (optional, Pro):</strong> when you choose to upload a cloud backup, only
              the AES-256-GCM-encrypted ciphertext is stored — we never see your password or the plaintext data.
            </li>
            <li>
              <strong>Payment processing (optional):</strong> if you buy a Pro license, Razorpay handles the
              transaction. We receive only the payment ID and your email; we do not see your card details.
            </li>
          </ul>
        </Section>

        <Section icon={<Server className="w-5 h-5 text-amber-500" />} title="Third parties we use">
          <ul className="list-disc pl-5 space-y-1.5 text-sm">
            <li><strong>MFAPI.in</strong> — mutual fund NAV data (no PII sent)</li>
            <li><strong>Yahoo Finance</strong> — stock price data (no PII sent)</li>
            <li><strong>Google Gemini</strong> — AI CAS PDF parsing (Pro feature, explicit opt-in per upload)</li>
            <li><strong>Razorpay</strong> — payment processing (Pro subscription)</li>
            <li><strong>Cloudflare</strong> — CDN & DDoS protection (no cookies, no tracking)</li>
          </ul>
        </Section>

        <Section icon={<Trash2 className="w-5 h-5 text-red-500" />} title="Deleting your data">
          <p className="text-sm leading-relaxed">
            You have complete control. To delete everything:
          </p>
          <ol className="list-decimal pl-5 space-y-1.5 text-sm">
            <li>Open FolioVault → Settings → "AES-GCM Local Database Backup" → "Export" first if you want a copy.</li>
            <li>Then clear your browser's site data (Chrome: Settings → Privacy → Clear browsing data → Cookies and other site data → search "foliovault").</li>
            <li>Or simply use a private/incognito window to start fresh — your data never syncs anywhere.</li>
          </ol>
        </Section>

        <Section icon={<Shield className="w-5 h-5 text-purple-500" />} title="Contact">
          <p className="text-sm leading-relaxed">
            Questions? Email <a href="mailto:privacy@foliovault.com" className="text-blue-600 hover:underline">privacy@foliovault.com</a>.
            We typically respond within 48 hours.
          </p>
        </Section>

        <p className="text-xs text-slate-400 italic text-center pt-6">
          TL;DR — We can't see your data because we never receive it.
        </p>
      </main>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
      <h2 className="flex items-center gap-2 text-base font-black tracking-tight">
        {icon} {title}
      </h2>
      <div className="space-y-2 text-slate-700 dark:text-slate-300">{children}</div>
    </section>
  );
}
