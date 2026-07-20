/**
 * MAIN-world interceptor for LeetCode, registered in the manifest with
 * `world: 'MAIN'` + `document_start` so it is guaranteed to run before any
 * page script (script-tag injection raced the page bundle and was subject to
 * page CSP). MAIN-world code has no chrome.*, so signals are relayed to the
 * isolated content script via window.postMessage.
 *
 * Signals:
 *  - `submitted`: response of POST /problems/<slug>/submit/ carrying
 *    submission_id and the submitted slug. The isolated script then polls the
 *    check endpoint itself, so detection works no matter how the page
 *    transports its own result.
 *  - `accepted`: passively observed accepted result (check poll or GraphQL
 *    submissionDetails), kept as a secondary signal.
 */
export default defineContentScript({
  matches: ['*://leetcode.com/problems/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    const CHANNEL = 'dsa-tracker-interceptor';

    function post(
      kind: 'submitted' | 'accepted',
      submissionId: string | null,
      slug?: string,
    ) {
      try {
        window.postMessage({ source: CHANNEL, kind, submissionId, slug }, '*');
      } catch {
        // ignore
      }
    }

    const CHECK_RE = /\/submissions\/detail\/(\d+)\/check\/?/;
    const SUBMIT_RE = /\/problems\/([^/?#]+)\/submit\/?/;
    const submissionSlugs = new Map<string, string>();

    function inspect(url: string, text: string): void {
      if (!text) return;
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        return;
      }

      // Submission created — the id we need to poll for the verdict.
      const submitMatch = url.match(SUBMIT_RE);
      if (submitMatch) {
        const id = json?.submission_id;
        if (id !== undefined && id !== null) {
          const submissionId = String(id);
          const slug = decodeURIComponent(submitMatch[1]);
          submissionSlugs.set(submissionId, slug);
          post('submitted', submissionId, slug);
        }
        return;
      }

      // REST verdict poll (passive).
      const m = url.match(CHECK_RE);
      if (m) {
        if (json?.status_msg === 'Accepted' && json?.state === 'SUCCESS') {
          post('accepted', m[1], submissionSlugs.get(m[1]));
        }
        return;
      }

      // GraphQL submissionDetails (passive).
      if (url.includes('/graphql')) {
        const details = json?.data?.submissionDetails;
        if (details) {
          const accepted =
            details.statusCode === 10 ||
            details.status_msg === 'Accepted' ||
            details.statusDisplay === 'Accepted';
          if (accepted) {
            const submissionId = details.submissionId
              ? String(details.submissionId)
              : null;
            post(
              'accepted',
              submissionId,
              submissionId ? submissionSlugs.get(submissionId) : undefined,
            );
          }
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
  },
});
