'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { ClipboardPaste, Loader2, Link2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { firstFacebookUrlIn, parseFacebookUrl } from '@/lib/imports/facebook/url';
import { createImportAction } from '../actions';

/**
 * PASTE-FIRST. The post text is the fast path, not the fallback.
 *
 * The old version of this screen took a URL and nothing else, then spent
 * several seconds asking Facebook — which removed the groups API in April 2024
 * and gates page reads behind App Review, so for most adverts it returns
 * nothing. The operator landed on an empty review screen, pasted the text they
 * had all along, and paid for a SECOND round trip to re-read it. Two waits to
 * reach a state the first submit could have produced.
 *
 * So the text box is here, on the first screen, and filling it skips the
 * Facebook call entirely (see `resolveFromPastedText`). One submit, no network
 * wait, review screen already parsed.
 *
 * THE URL BOX STAYS REQUIRED. It is the provenance every imported listing
 * carries — the link a reviewer opens to check the advert against the draft —
 * and it is vetted by the same allowlist whether or not we dereference it.
 *
 * Everything else here is about the operator standing in the street with a
 * phone, which is where imports actually get done:
 *   - the URL is lifted out of a paste, because sharing from the Facebook app
 *     puts the post's first line and the link on the clipboard together;
 *   - the host is checked as they type, so a wrong paste costs no round trip;
 *   - the submit button is reachable without scrolling past a long advert;
 *   - the keyboard is never asked to capitalise or autocorrect a URL.
 */
export function ImportUrlForm() {
  const [pending, start] = useTransition();
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [lifted, setLifted] = useState(false);
  const [clipboardNote, setClipboardNote] = useState<string | null>(null);
  const [canPaste, setCanPaste] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  /*
   * Both detected after mount, never during render: `navigator` does not exist
   * on the server, and a static `autoFocus` would differ between the two.
   *
   * Focus is given only to a POINTER device. On a phone, focusing on mount
   * throws up the keyboard and scrolls the heading away before the operator has
   * read what screen they are on — it costs time rather than saving it, which
   * is the opposite of the point.
   */
  useEffect(() => {
    setCanPaste(typeof navigator !== 'undefined' && !!navigator.clipboard?.readText);
    if (window.matchMedia?.('(pointer: fine)').matches) urlRef.current?.focus();
  }, []);

  /*
   * Grow to fit the advert. A Sri Lankan rental post runs 15-40 lines, and a
   * fixed 4-row box on a phone means scrolling a tiny viewport inside an
   * already-scrolling page to check a paste landed. Capped at 60vh so the
   * controls below never leave the screen.
   */
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.6)}px`;
  }, [text]);

  /** Put a blob of clipboard content in the right box, and lift any link out. */
  const absorb = useCallback(
    (value: string, into: 'url' | 'text') => {
      const found = firstFacebookUrlIn(value);
      const isBareLink = !!found && value.trim() === found;

      if (into === 'url' && !isBareLink && value.trim().length > 120) {
        // A whole advert dropped into the URL box. Route it where it belongs
        // rather than refusing it — the operator's intent is not in doubt.
        setText((prev) => (prev ? prev : value.trim()));
        if (found) {
          setUrl(found);
          setLifted(true);
        }
        return;
      }

      if (into === 'text') {
        setText(value);
        if (found && !url.trim()) {
          setUrl(found);
          setLifted(true);
        }
        return;
      }

      setUrl(value);
      setLifted(false);
    },
    [url]
  );

  const readClipboard = useCallback(async () => {
    setClipboardNote(null);
    try {
      const value = await navigator.clipboard.readText();
      if (!value.trim()) {
        setClipboardNote('The clipboard is empty.');
        return;
      }
      absorb(value, firstFacebookUrlIn(value) && value.trim().length <= 120 ? 'url' : 'text');
    } catch {
      // Denied, or a browser that only allows reads from a real paste gesture.
      // Say so instead of failing silently — the manual paste still works.
      setClipboardNote('Your browser would not let us read the clipboard. Paste into a box instead.');
    }
  }, [absorb]);

  /*
   * THE SAME ALLOWLIST THE SERVER USES, imported rather than restated. A copy
   * would drift, and a hint that disagrees with the gate is worse than none:
   * either it blocks a URL that would have worked, or it promises one that will
   * bounce. This is only a hint — `parseFacebookUrl` runs again on the server,
   * which is where the SSRF decision is actually made.
   */
  const effectiveUrl = url.trim() || firstFacebookUrlIn(text) || '';
  const urlOk = useMemo(() => parseFacebookUrl(effectiveUrl) !== null, [effectiveUrl]);
  const showUrlError = url.trim().length > 0 && !urlOk;

  const hasText = text.trim().length > 0;
  const ready = urlOk && !pending;

  /*
   * `requestSubmit` and not a hand-built FormData, so the <form action> below
   * stays the only submit path. That keeps the screen working before React has
   * hydrated — a server action degrades to a plain POST, and an operator on a
   * slow phone connection can paste and submit while the bundle is still
   * arriving. Building the payload here instead would have made the whole
   * import JS-only for a keyboard shortcut's sake.
   */
  const submit = () => {
    if (!ready) return;
    formRef.current?.requestSubmit();
  };

  return (
    <form
      ref={formRef}
      action={(formData) => start(() => createImportAction(formData))}
      className="space-y-4 rounded-md border border-slate-200 bg-white p-4"
    >
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="sourceUrl">Facebook post URL</Label>
          {canPaste && (
            <button
              type="button"
              onClick={readClipboard}
              disabled={pending}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
            >
              <ClipboardPaste className="h-3.5 w-3.5" /> Paste
            </button>
          )}
        </div>
        <Input
          id="sourceUrl"
          name="sourceUrl"
          ref={urlRef}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setLifted(false);
          }}
          onPaste={(e) => {
            const value = e.clipboardData.getData('text');
            if (value.trim().length > 120 || firstFacebookUrlIn(value)) {
              e.preventDefault();
              absorb(value, 'url');
            }
          }}
          type="url"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="next"
          /*
           * Required only when the text does not already carry the link.
           * A flat `required` would have the browser block a submit whose URL
           * is sitting in the paste below, which the server lifts out anyway.
           */
          required={!firstFacebookUrlIn(text)}
          placeholder="https://www.facebook.com/groups/…/posts/…"
          disabled={pending}
          aria-invalid={showUrlError}
          aria-describedby="sourceUrl-help"
          className="h-11 text-base sm:h-10 sm:text-sm"
        />
        <p
          id="sourceUrl-help"
          className={showUrlError ? 'text-xs text-rose-700' : 'text-xs text-slate-500'}
        >
          {showUrlError
            ? 'Not a Facebook post link. Open the post itself and copy the address — a profile or group home page will not do.'
            : lifted
              ? 'Taken from what you pasted. Change it if it picked the wrong link.'
              : 'The link to one post. Group, page and photo posts all work.'}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rawText">
          Post text{' '}
          <span className="font-normal text-slate-500">— paste it and skip the wait</span>
        </Label>
        <textarea
          id="rawText"
          name="rawText"
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const value = e.clipboardData.getData('text');
            if (firstFacebookUrlIn(value) && !url.trim()) {
              e.preventDefault();
              absorb(value, 'text');
            }
          }}
          onKeyDown={(e) => {
            // Submit without reaching for the button — the advert is long and
            // the hands are already on the keyboard.
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          rows={5}
          disabled={pending}
          placeholder={'Open the post, select all of it, paste here.\n\nRent, town, rooms and the phone number are read straight out of this.'}
          className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-base leading-relaxed shadow-xs outline-none placeholder:text-slate-400 focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-200 disabled:opacity-50 sm:text-sm"
        />
        <p className="text-xs text-slate-500">
          Optional — but this is the whole advert, and Facebook will almost never
          give it to us. Photos are added on the next screen either way.
        </p>
      </div>

      {clipboardNote && (
        <p role="status" className="text-xs text-amber-700">
          {clipboardNote}
        </p>
      )}

      {/*
        Sticky on a phone only. A pasted advert grows the box past the height of
        the screen, and a submit button that has scrolled off the bottom is the
        difference between a ten-second import and a fumbling one. On a desktop
        the whole form is visible at once and a floating bar is just noise.
      */}
      <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Button type="submit" disabled={!ready} className="h-11 sm:h-10">
          {pending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : hasText ? (
            <Zap className="mr-1.5 h-4 w-4" />
          ) : (
            <Link2 className="mr-1.5 h-4 w-4" />
          )}
          {pending ? (hasText ? 'Saving…' : 'Asking Facebook…') : hasText ? 'Create draft' : 'Fetch post'}
        </Button>

        {/*
          The button says which of the two things it is about to do, and the
          line beside it says what that costs. An operator who can see that
          pasting is what makes it instant will paste.
        */}
        <span className="text-xs text-slate-500">
          {pending
            ? hasText
              ? 'Reading the advert. Don’t reload.'
              : 'Asking Facebook, then saving any photos. Don’t reload.'
            : hasText
              ? 'Facebook is not asked — your text is used as it is.'
              : 'Facebook is asked first. Slow, and it usually refuses.'}
        </span>
      </div>
    </form>
  );
}
