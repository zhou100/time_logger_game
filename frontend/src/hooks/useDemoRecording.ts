import { useCallback, useEffect, useRef, useState } from 'react';
import {
    demoApi,
    DemoClassification,
    DemoFakeOutput,
    DemoStatusResponse,
    DemoTeaser,
    readPermit,
    writePermit,
    writeClaimToken,
} from '../services/demoApi';
import Logger from '../utils/logger';
import { capture as captureEvent } from '../services/analytics';

/**
 * useDemoRecording — orchestrates the anonymous demo pipeline end-to-end.
 *
 * State machine:
 *   idle              → user hasn't tapped yet (or last cycle finished)
 *   requesting-mic    → awaiting getUserMedia()
 *   mic-denied        → permission denied / no device / API unavailable
 *   recording         → MediaRecorder active
 *   processing        → presign → PUT → submit → polling /status
 *   done              → /status returned step:done
 *   error             → pipeline failure or polling timeout
 *   capped            → /submit returned demo:"capped" + fake_output
 *
 * Caller responsibility:
 *   - Provide a valid `permit_token` before calling `start()`. If the permit
 *     is missing/expired, you'll get an error on /presign — caller should
 *     re-challenge Turnstile and try again.
 *
 * MIME selection (iOS Safari fix per design spec):
 *   webm/opus → mp4 → m4a → mpeg, picking the first the browser supports.
 *   Whisper auto-detects format; backend just reflects content_type into the
 *   presigned URL.
 */

export type DemoState =
    | 'idle'
    | 'requesting-mic'
    | 'mic-denied'
    | 'recording'
    | 'processing'
    | 'done'
    | 'error'
    | 'capped';

export interface UseDemoRecordingResult {
    state: DemoState;
    /** Latest pipeline `step` value while polling. Useful for the live region. */
    step: DemoStatusResponse['step'] | null;
    transcript: string | null;
    summary: string | null;
    classifications: DemoClassification[];
    demoTeaser: DemoTeaser | null;
    fakeOutput: DemoFakeOutput | null;
    error: string | null;
    /** Begin the full record → upload → debrief flow. */
    start: () => Promise<void>;
    /** Stop the current recording and run the rest of the pipeline. */
    stop: () => void;
    /** Reset to idle (clears outputs). */
    reset: () => void;
}

interface Options {
    /** Provide a permit before calling start(). Missing → start() will fail. */
    getPermitToken: () => string | null;
    /**
     * Called when the backend rotates the permit on a /presign response.
     * Caller should refresh any cached permit (sessionStorage already updated).
     */
    onPermitRotated?: (newPermit: string) => void;
}

const PREFERRED_MIMES: string[] = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/m4a',
    'audio/mpeg',
];

function pickMimeType(): string | null {
    if (typeof window === 'undefined' || !window.MediaRecorder) return null;
    for (const m of PREFERRED_MIMES) {
        try {
            if (MediaRecorder.isTypeSupported(m)) return m;
        } catch {
            // some browsers throw on unsupported probes — keep going
        }
    }
    return null;
}

function normalizeContentType(mime: string): string {
    // Strip codec parameters when sending to backend; presign whitelist accepts
    // {audio/webm, audio/mp4, audio/m4a, audio/mpeg} per design spec.
    return mime.split(';')[0].trim();
}

const POLL_INTERVAL_MS = 2_500; // tighter than 1.5s trips per_ip_minute rate limit
const POLL_MAX_DURATION_MS = 90_000;

export function useDemoRecording(opts: Options): UseDemoRecordingResult {
    const [state, setState] = useState<DemoState>('idle');
    const [step, setStep] = useState<DemoStatusResponse['step'] | null>(null);
    const [transcript, setTranscript] = useState<string | null>(null);
    const [summary, setSummary] = useState<string | null>(null);
    const [classifications, setClassifications] = useState<DemoClassification[]>([]);
    const [demoTeaser, setDemoTeaser] = useState<DemoTeaser | null>(null);
    const [fakeOutput, setFakeOutput] = useState<DemoFakeOutput | null>(null);
    const [error, setError] = useState<string | null>(null);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const mimeRef = useRef<string | null>(null);
    const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pollStartRef = useRef<number>(0);
    const cleanupRef = useRef<() => void>(() => undefined);
    // Observability: track when recording started so `recording_completed`
    // can include `duration_ms`. Reset on each start() call.
    const recordStartTsRef = useRef<number>(0);
    // First-time guards keep `debrief_shown` and `teaser_shown` to a single
    // emit per pipeline run.
    const debriefShownRef = useRef<boolean>(false);
    const teaserShownRef = useRef<boolean>(false);

    const teardownStream = useCallback(() => {
        recorderRef.current = null;
        chunksRef.current = [];
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
    }, []);

    const stopPolling = useCallback(() => {
        if (pollTimerRef.current) {
            clearTimeout(pollTimerRef.current);
            pollTimerRef.current = null;
        }
    }, []);

    const reset = useCallback(() => {
        stopPolling();
        teardownStream();
        setState('idle');
        setStep(null);
        setTranscript(null);
        setSummary(null);
        setClassifications([]);
        setDemoTeaser(null);
        setFakeOutput(null);
        setError(null);
        // Re-arm one-shot event guards so the next pipeline run can fire
        // `debrief_shown` / `teaser_shown` again.
        debriefShownRef.current = false;
        teaserShownRef.current = false;
    }, [stopPolling, teardownStream]);

    cleanupRef.current = reset;

    useEffect(() => {
        return () => {
            stopPolling();
            teardownStream();
        };
    }, [stopPolling, teardownStream]);

    // ── Observability: emit `debrief_shown` once when the pipeline first
    // settles into the `done` state, and `teaser_shown` once when a
    // demo_teaser materialises. Both are gated by refs so a re-render
    // (e.g. user switching tabs) doesn't double-emit.
    useEffect(() => {
        if (state === 'done' && !debriefShownRef.current) {
            debriefShownRef.current = true;
            captureEvent('debrief_shown', { has_teaser: !!demoTeaser });
        }
    }, [state, demoTeaser]);

    useEffect(() => {
        if (demoTeaser && !teaserShownRef.current) {
            teaserShownRef.current = true;
            // Stem only — don't ship the rendered teaser text (it can quote
            // user words). Keeps event size bounded too.
            captureEvent('teaser_shown', { stem: demoTeaser.stem });
        }
    }, [demoTeaser]);

    const pollStatus = useCallback(
        async (entryId: string): Promise<void> => {
            try {
                const res = await demoApi.status(entryId);
                setStep(res.step);
                if (res.transcript) setTranscript(res.transcript);
                if (res.summary) setSummary(res.summary);
                if (res.classifications) setClassifications(res.classifications);
                if (res.demo_teaser) setDemoTeaser(res.demo_teaser);

                if (res.step === 'done') {
                    stopPolling();
                    setState('done');
                    return;
                }
                if (res.step === 'failed') {
                    stopPolling();
                    setError('Something went wrong. Try again.');
                    setState('error');
                    return;
                }
                const elapsed = Date.now() - pollStartRef.current;
                if (elapsed > POLL_MAX_DURATION_MS) {
                    stopPolling();
                    setError('Something went wrong. Try again.');
                    setState('error');
                    return;
                }
                pollTimerRef.current = setTimeout(() => {
                    pollStatus(entryId);
                }, POLL_INTERVAL_MS);
            } catch (err) {
                Logger.warn('demo status poll error', err);
                // transient failure — keep polling until the timeout window closes
                const elapsed = Date.now() - pollStartRef.current;
                if (elapsed > POLL_MAX_DURATION_MS) {
                    stopPolling();
                    setError('Something went wrong. Try again.');
                    setState('error');
                    return;
                }
                pollTimerRef.current = setTimeout(() => {
                    pollStatus(entryId);
                }, POLL_INTERVAL_MS);
            }
        },
        [stopPolling],
    );

    const runPipeline = useCallback(
        async (blob: Blob, mime: string): Promise<void> => {
            setState('processing');
            const permit = opts.getPermitToken();
            if (!permit) {
                setError('Verification expired. Please verify again.');
                setState('error');
                return;
            }

            try {
                const contentType = normalizeContentType(mime);
                // 1. presign — rotates permit + returns claim_token
                const pres = await demoApi.presign(contentType, permit);
                // Backend rotates the permit but doesn't restate its expiry on
                // /presign. Preserve the original expires_at from /verify-turnstile
                // so the cache decision in the parent stays correct.
                const existing = readPermit();
                if (existing?.expires_at) {
                    writePermit(pres.permit_token, existing.expires_at);
                }
                writeClaimToken(pres.claim_token);
                opts.onPermitRotated?.(pres.permit_token);

                // 2. PUT to S3
                await demoApi.uploadAudio(pres.upload_url, blob, pres.content_type);

                // 3. submit
                const sub = await demoApi.submit(pres.entry_id, pres.permit_token);

                if (sub.demo === 'capped') {
                    setFakeOutput(sub.fake_output);
                    setState('capped');
                    return;
                }

                // 4. poll status
                pollStartRef.current = Date.now();
                setStep('queued');
                pollStatus(sub.entry_id);
            } catch (err) {
                Logger.error('demo pipeline error', err);
                setError(err instanceof Error ? err.message : 'Pipeline failed.');
                setState('error');
            }
        },
        [opts, pollStatus],
    );

    const stop = useCallback(() => {
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
            // onstop fires after the final chunk is delivered. Capture the
            // duration here (rather than in onstop) so the event order on
            // PostHog reads naturally: tap → completed → processing.
            const durationMs = recordStartTsRef.current
                ? Date.now() - recordStartTsRef.current
                : 0;
            captureEvent('recording_completed', { duration_ms: durationMs });
            recorder.stop();
        }
    }, []);

    const start = useCallback(async () => {
        setError(null);
        setStep(null);
        setTranscript(null);
        setSummary(null);
        setClassifications([]);
        setDemoTeaser(null);
        setFakeOutput(null);

        // 0. Mic permission
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setState('mic-denied');
            return;
        }
        const mime = pickMimeType();
        if (!mime) {
            setState('mic-denied');
            setError('Your browser does not support audio recording.');
            return;
        }
        mimeRef.current = mime;

        try {
            setState('requesting-mic');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // MediaRecorder constructor can throw if the chosen mimeType is rejected
            // by the underlying media stack (rare but happens on iOS) — fall back.
            let recorder: MediaRecorder;
            try {
                recorder = new MediaRecorder(stream, { mimeType: mime });
            } catch {
                recorder = new MediaRecorder(stream);
                mimeRef.current = recorder.mimeType || mime;
            }
            recorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
            };
            recorder.onerror = (e) => {
                Logger.error('MediaRecorder error', e);
                setError('Recording failed.');
                setState('error');
                teardownStream();
            };
            recorder.onstop = () => {
                const usedMime = mimeRef.current || mime;
                const blob = new Blob(chunksRef.current, { type: usedMime });
                teardownStream();
                runPipeline(blob, usedMime);
            };

            recorder.start();
            recordStartTsRef.current = Date.now();
            captureEvent('recording_started');
            setState('recording');
        } catch (err) {
            Logger.warn('getUserMedia denied', err);
            teardownStream();
            setState('mic-denied');
        }
    }, [runPipeline, teardownStream]);

    return {
        state,
        step,
        transcript,
        summary,
        classifications,
        demoTeaser,
        fakeOutput,
        error,
        start,
        stop,
        reset,
    };
}
