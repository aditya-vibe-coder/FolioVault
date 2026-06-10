/**
 * Razorpay checkout integration.
 *
 * Supports both monthly and yearly Pro subscriptions through the
 * Cloudflare Worker.  In sandbox environments (localhost / AI Studio /
 * missing Razorpay key) it transparently falls back to a simulator that
 * returns a synthetic license key.
 */
const WORKER_URL_RAW   = ((import.meta as any).env?.VITE_WORKER_URL as string) || '';
// 🔁 REPLACE the fallback URL with your deployed Worker URL
const WORKER_URL       = WORKER_URL_RAW || 'https://api.YOUR_DOMAIN.com';
const RAZORPAY_KEY_ID  = ((import.meta as any).env?.VITE_RAZORPAY_KEY_ID as string) || '';

export type BillingInterval = 'monthly' | 'yearly';

export const PRICING: Record<BillingInterval, { amountPaise: number; productId: string; label: string }> = {
  monthly: { amountPaise: 9900,   productId: 'foliovault_pro_monthly', label: 'FolioVault Pro — Monthly Subscription (₹99/month)' },
  yearly:  { amountPaise: 79900,  productId: 'foliovault_pro_annual',  label: 'FolioVault Pro — Annual License (₹799/year)' },
};

declare global {
  interface Window { Razorpay: any }
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Razorpay script failed to load'));
    document.head.appendChild(s);
  });
}

function generateSimulatedLicense(interval: BillingInterval): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const prefix = interval === 'monthly' ? 'FVM' : 'FVY';
  let key = prefix;
  for (let s = 0; s < 3; s++) {
    key += '-';
    for (let c = 0; c < 4; c++) {
      key += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return key; // e.g. FVM-A3K9-WXYZ-7RQN  or  FVY-A3K9-WXYZ-7RQN
}

function isSandbox(): boolean {
  const host = window.location.hostname;
  const noLiveKey = !RAZORPAY_KEY_ID || RAZORPAY_KEY_ID.includes('xxxxxxxx') || RAZORPAY_KEY_ID === 'rzp_live';
  if (noLiveKey) return true;
  return (
    host.includes('localhost') ||
    host.includes('127.0.0.1') ||
    host.includes('run.app') ||
    host.includes('ais-')
  );
}

export async function initiatePurchase(
  userEmail?: string,
  interval: BillingInterval = 'yearly',
): Promise<{ success: true; licenseKey: string; interval: BillingInterval } | { success: false; error: string }> {

  const pricing = PRICING[interval];

  // ─── Sandbox fallback ──────────────────────────────────────────────────
  if (isSandbox()) {
    console.log(`[Razorpay] Sandbox simulator for ${interval} subscription.`);
    return new Promise((resolve) => {
      const priceLabel = interval === 'monthly' ? '₹99/month' : '₹799/year';
      const confirmPlayground = window.confirm(
        `🔓 FolioVault Sandbox Simulator\n\n` +
        `You are running in a sandbox environment without a live Razorpay key.\n\n` +
        `Would you like to simulate a successful ${interval} subscription of ${priceLabel} ` +
        `and auto-issue a valid Pro license?`,
      );
      if (confirmPlayground) {
        setTimeout(() => {
          const mockLicense = generateSimulatedLicense(interval);
          resolve({ success: true, licenseKey: mockLicense, interval });
        }, 1000);
      } else {
        resolve({ success: false, error: 'Payment simulation cancelled by user' });
      }
    });
  }

  // ─── Live flow ─────────────────────────────────────────────────────────
  // Step 1: Create Razorpay order via Cloudflare Worker
  let orderId: string;
  try {
    const r = await fetch(`${WORKER_URL}/api/create-order`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        amount: pricing.amountPaise,
        interval,
        productId: pricing.productId,
        customerEmail: userEmail || '',
      }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    // Worker returns `{orderId}` (flat) — fall back to `{order.id}` for
    // back-compat in case the worker is older.
    orderId = data.orderId || data.order?.id;
    if (!orderId) throw new Error('No orderId in response');
  } catch (e) {
    return {
      success: false,
      error: 'Could not initialise payment. Please try again, or contact support if the issue persists.',
    };
  }

  // Step 2: Load Razorpay script
  try {
    await loadRazorpayScript();
  } catch {
    return { success: false, error: 'Razorpay checkout script failed to load. Please check your network connection.' };
  }

  // Step 3: Open checkout
  return new Promise((resolve) => {
    const options = {
      key:         RAZORPAY_KEY_ID,
      amount:      pricing.amountPaise,
      currency:    'INR',
      name:        'FolioVault',
      description: pricing.label,
      image:       '/favicon.svg',
      order_id:    orderId,
      prefill:     { email: userEmail ?? '' },
      notes:       { product: pricing.productId, interval },
      theme:       { color: '#F59E0B' },
      modal: {
        ondismiss: () => resolve({ success: false, error: 'Payment tool dismissed' }),
      },
      handler: async (response: any) => {
        try {
          const vr = await fetch(`${WORKER_URL}/api/verify-payment`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_signature:  response.razorpay_signature,
              interval,
            }),
          });
          if (!vr.ok) {
            const errBody = await vr.json().catch(() => ({}));
            throw new Error(errBody.error || `Verify HTTP ${vr.status}`);
          }
          const { licenseKey, expiresAt } = await vr.json();
          if (!licenseKey) throw new Error('No license key in response');
          // Persist the license to local settings immediately (verify-payment
          // already updated the server-side KV; this keeps the in-browser
          // app in sync without a manual re-activation).
          try {
            const { saveSettings } = await import('./db');
            const { verifyAndCacheLicense } = await import('./license');
            await verifyAndCacheLicense(licenseKey);
            // expiry is server-authoritative; write it directly too
            if (expiresAt) {
              await saveSettings({ licenseExpiry: expiresAt });
            }
          } catch { /* non-fatal — Settings page can re-verify */ }
          resolve({ success: true, licenseKey, interval });
        } catch (e: any) {
          resolve({
            success: false,
            error: `Payment received (ID: ${response.razorpay_payment_id}) but license generation failed: ${e?.message || 'unknown'}. Your payment is safe; please contact support@foliovault.com with this payment ID.`,
          });
        }
      },
    };

    try {
      const rzpInstance = new window.Razorpay(options);
      rzpInstance.on('payment.failed', (resp: any) => {
        resolve({
          success: false,
          error: `Payment failed: ${resp?.error?.description || resp?.error?.reason || 'Unknown error'}. No money was deducted.`,
        });
      });
      rzpInstance.open();
    } catch (err: any) {
      resolve({ success: false, error: `Failed to open Razorpay UI: ${err?.message || err}` });
    }
  });
}
