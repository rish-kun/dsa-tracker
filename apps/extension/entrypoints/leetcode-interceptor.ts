/**
 * MAIN-world interceptor for LeetCode. Injected into the page context (where the
 * app's own fetch/XHR run) because content scripts live in an isolated world and
 * cannot observe the page's network calls. MAIN-world code can't use chrome.*,
 * so detections are relayed to the content script via window.postMessage.
 *
 * Signals of an accepted submission (either suffices — we stay liberal):
 *  - REST poll: /submissions/detail/<id>/check/ with status_msg "Accepted" & state "SUCCESS"
 *  - GraphQL: submissionDetails payload with statusCode 10 or status_msg "Accepted"
 */
export default defineUnlistedScript(() => {
  const CHANNEL = 'dsa-tracker-interceptor';

  function post(submissionId: string | null) {
    try {
      window.postMessage({ source: CHANNEL, kind: 'accepted', submissionId }, '*');
    } catch {
      // ignore
    }
  }

  const CHECK_RE = /\/submissions\/detail\/(\d+)\/check\/?/;

  function inspect(url: string, text: string): void {
    if (!text) return;
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return;
    }

    // REST poll endpoint.
    const m = url.match(CHECK_RE);
    if (m) {
      if (json?.status_msg === 'Accepted' && json?.state === 'SUCCESS') {
        post(m[1]);
      }
      return;
    }

    // GraphQL submissionDetails.
    if (url.includes('/graphql')) {
      const details = json?.data?.submissionDetails;
      if (details) {
        const accepted =
          details.statusCode === 10 ||
          details.status_msg === 'Accepted' ||
          details.statusDisplay === 'Accepted';
        if (accepted) post(details.submissionId ? String(details.submissionId) : null);
      }
    }
  }

  // --- wrap fetch ---
  const origFetch = window.fetch;
  window.fetch = async function (...args: Parameters<typeof fetch>) {
    const res = await origFetch.apply(this, args);
    try {
      const url =
        typeof args[0] === 'string'
          ? args[0]
          : args[0] instanceof Request
            ? args[0].url
            : String(args[0]);
      res
        .clone()
        .text()
        .then((t) => inspect(url, t))
        .catch(() => {});
    } catch {
      // never break the page's fetch
    }
    return res;
  };

  // --- wrap XMLHttpRequest ---
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: any[]
  ) {
    try {
      (this as any).__dsaUrl = typeof url === 'string' ? url : url.toString();
    } catch {
      // ignore
    }
    // @ts-expect-error variadic passthrough to native open
    return origOpen.call(this, method, url, ...rest);
  };

  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...args: any[]) {
    try {
      this.addEventListener('load', () => {
        try {
          const url: string = (this as any).__dsaUrl ?? '';
          const type = this.responseType;
          if (type === '' || type === 'text') inspect(url, this.responseText);
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
    // @ts-expect-error variadic passthrough to native send
    return origSend.apply(this, args);
  };
});
