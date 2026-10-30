/** Mountable Node HTTP handler; authentication and reservation persistence are supplied by the host app. */
export function createApi({ authenticate, charge }) {
  return async (req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (req.method !== 'POST' || req.url !== '/api/payments/charge') return send(404, { status: 'error', code: 'NOT_FOUND', message: 'Not found.' });
    try {
      const user = await authenticate(req);
      if (!user?.id) return send(401, { status: 'error', code: 'UNAUTHENTICATED', message: 'Authentication required.' });
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 4096) return send(413, { status: 'error', code: 'TOO_LARGE', message: 'Request too large.' });
      }
      let data;
      try { data = JSON.parse(body); } catch { return send(400, { status: 'error', code: 'INVALID_REQUEST', message: 'Invalid JSON.' }); }
      if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(key => !['reservationId', 'paymentToken'].includes(key))) {
        return send(400, { status: 'error', code: 'INVALID_REQUEST', message: 'Only reservationId and paymentToken are accepted.' });
      }
      const result = await charge({ reservationId: data.reservationId, paymentToken: data.paymentToken, userId: user.id });
      return send(result.statusCode, result.body);
    } catch {
      return send(500, { status: 'error', code: 'SERVER_ERROR', message: 'Unable to process request.' });
    }
  };
}
