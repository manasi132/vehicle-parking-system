import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

let stripeScript;
function loadStripeScript() {
  if (window.Stripe) return Promise.resolve(window.Stripe);
  if (!stripeScript) {
    stripeScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.async = true;
      script.onload = () => window.Stripe ? resolve(window.Stripe) : reject(new Error('Stripe.js did not load.'));
      script.onerror = () => reject(new Error('Unable to load Stripe.js.'));
      document.head.appendChild(script);
    }).catch(error => { stripeScript = null; throw error; });
  }
  return stripeScript;
}

/** Card data stays in Stripe's iframe; the parent receives only a token. */
const SandboxCard = forwardRef(function SandboxCard({ publishableKey, onReady }, ref) {
  const container = useRef(null);
  const stripeRef = useRef(null);
  const cardRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    onReady(false);
    if (!/^pk_test_[a-zA-Z0-9]+$/.test(publishableKey)) {
      setError('Configure a Stripe test-mode publishable key.');
      return;
    }
    loadStripeScript().then(Stripe => {
      if (cancelled) return;
      const stripe = Stripe(publishableKey);
      const card = stripe.elements().create('card');
      stripeRef.current = stripe;
      cardRef.current = card;
      card.on('change', event => setError(event.error ? 'Check your test card details.' : ''));
      card.mount(container.current);
      onReady(true);
    }).catch(() => { if (!cancelled) setError('Unable to load Stripe test card input.'); });
    return () => {
      cancelled = true;
      cardRef.current?.destroy();
      cardRef.current = null;
      stripeRef.current = null;
    };
  }, [publishableKey, onReady]);

  useImperativeHandle(ref, () => ({
    async createToken() {
      if (!stripeRef.current || !cardRef.current) throw new Error('Stripe card input is not ready.');
      const result = await stripeRef.current.createToken(cardRef.current);
      if (result.error || !/^tok_[a-zA-Z0-9]+$/.test(result.token?.id || '')) {
        throw new Error('Unable to tokenize the test card. Check the card details and try again.');
      }
      return result.token.id;
    },
    clear() { cardRef.current?.clear(); }
  }), []);

  return <div><div ref={container} className="stripe-card-input" aria-label="Stripe test card details" />
    {error && <p role="alert">{error}</p>}</div>;
});

export default SandboxCard;
