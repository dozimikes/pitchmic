'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, Square, Pause, Play, RotateCcw, Upload,
  CheckCircle2, AlertCircle, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

type RecorderState = 'idle' | 'requesting' | 'recording' | 'paused' | 'done' | 'error';

interface AudioPitchRecorderProps {
  /** Called when the user finalises a recording blob */
  onRecordingComplete?: (blob: Blob, durationSeconds: number) => void;
  /** Cue cards / teleprompter text */
  cueText?: string;
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function AudioPitchRecorder({ onRecordingComplete, cueText }: AudioPitchRecorderProps) {
  const [state, setState] = React.useState<RecorderState>('idle');
  const [elapsed, setElapsed] = React.useState(0);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [cueVisible, setCueVisible] = React.useState(false);

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const blobRef = React.useRef<Blob | null>(null);
  const durationRef = React.useRef(0);

  // Canvas waveform refs
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const animFrameRef = React.useRef<number | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const drawWaveform = React.useCallback(() => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // Gradient fill
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, 'rgba(249,115,22,0.7)');
      grad.addColorStop(0.5, 'rgba(249,115,22,1)');
      grad.addColorStop(1, 'rgba(15,23,42,0.7)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    };

    draw();
  }, []);

  const stopWaveform = React.useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    // Draw flat line
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(148,163,184,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      }
    }
  }, []);

  const startTimer = React.useCallback(() => {
    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        durationRef.current = next;
        return next;
      });
    }, 1000);
  }, []);

  const stopTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = async () => {
    setErrorMsg(null);
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Web Audio analyser for waveform
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      chunksRef.current = [];
      setElapsed(0);
      durationRef.current = 0;

      const mr = new MediaRecorder(stream, { mimeType: getSupportedMimeType() });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: getSupportedMimeType() });
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState('done');
        stopWaveform();
        onRecordingComplete?.(blob, durationRef.current);
      };

      mr.start(100); // collect in 100ms chunks
      setState('recording');
      startTimer();
      drawWaveform();
    } catch (err) {
      setErrorMsg('Microphone access denied. Please allow microphone access in your browser and try again.');
      setState('error');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      stopTimer();
      stopWaveform();
      setState('paused');
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      startTimer();
      drawWaveform();
      setState('recording');
    }
  };

  const stopRecording = () => {
    stopTimer();
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close();
  };

  const retake = () => {
    stopTimer();
    stopWaveform();
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    blobRef.current = null;
    setElapsed(0);
    setState('idle');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
            state === 'recording' ? 'bg-red-500' : 'bg-gradient-to-br from-brand-orange-500 to-brand-deep-pitch-600',
          )}>
            <Mic className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Voice Pitch Studio</p>
            <p className="text-xs text-slate-500">Record your live pitch in the browser</p>
          </div>
        </div>
        {state === 'recording' && (
          <Badge className="gap-1.5 bg-red-500 text-white animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            LIVE {formatTime(elapsed)}
          </Badge>
        )}
        {state === 'paused' && (
          <Badge variant="warning" className="gap-1.5">
            <Pause className="h-3 w-3" /> PAUSED {formatTime(elapsed)}
          </Badge>
        )}
        {state === 'done' && (
          <Badge variant="success" className="gap-1.5">
            <CheckCircle2 className="h-3 w-3" /> {formatTime(elapsed)} recorded
          </Badge>
        )}
      </div>

      {/* Waveform Canvas */}
      <div className={cn(
        'relative rounded-xl border bg-slate-950 overflow-hidden transition-all',
        state === 'recording' ? 'border-red-500/50 shadow-lg shadow-red-500/10' : 'border-slate-200',
      )}>
        <canvas
          ref={canvasRef}
          width={800}
          height={80}
          className="w-full h-[80px] block"
        />
        {(state === 'idle' || state === 'requesting' || state === 'error') && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-slate-500">Waveform will appear when recording starts</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {state === 'idle' && (
          <Button
            type="button"
            variant="default"
            className="flex-1 bg-brand-orange-500 hover:bg-brand-orange-600 shadow-lg shadow-brand-orange-500/20"
            leftIcon={<Mic className="h-4 w-4" />}
            onClick={startRecording}
          >
            Start Recording
          </Button>
        )}

        {state === 'requesting' && (
          <Button type="button" variant="outline" disabled className="flex-1">
            <span className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
            Requesting microphone...
          </Button>
        )}

        {state === 'recording' && (
          <>
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-50"
              leftIcon={<Pause className="h-4 w-4" />}
              onClick={pauseRecording}
            >
              Pause
            </Button>
            <Button
              type="button"
              variant="default"
              className="flex-1 bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20"
              leftIcon={<Square className="h-4 w-4" />}
              onClick={stopRecording}
            >
              Stop & Review
            </Button>
          </>
        )}

        {state === 'paused' && (
          <>
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              leftIcon={<Play className="h-4 w-4" />}
              onClick={resumeRecording}
            >
              Resume
            </Button>
            <Button
              type="button"
              variant="default"
              className="flex-1 bg-red-500 hover:bg-red-600"
              leftIcon={<Square className="h-4 w-4" />}
              onClick={stopRecording}
            >
              Stop
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="shrink-0 text-slate-500"
              leftIcon={<RotateCcw className="h-4 w-4" />}
              onClick={retake}
            >
              Retake
            </Button>
          </>
        )}

        {state === 'done' && (
          <Button
            type="button"
            variant="ghost"
            className="shrink-0 text-slate-500"
            leftIcon={<RotateCcw className="h-4 w-4" />}
            onClick={retake}
          >
            Retake
          </Button>
        )}
      </div>

      {/* Audio Playback Preview */}
      <AnimatePresence>
        {state === 'done' && audioUrl && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3"
          >
            <p className="mb-2 text-xs font-semibold text-emerald-800">Preview your pitch audio</p>
            <audio controls className="w-full h-10" src={audioUrl} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error State */}
      <AnimatePresence>
        {state === 'error' && errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-xs text-red-700">{errorMsg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Teleprompter */}
      {cueText && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left"
            onClick={() => setCueVisible((v) => !v)}
          >
            <span className="text-xs font-semibold text-slate-700">Pitch Cue Cards / Teleprompter</span>
            <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', cueVisible && 'rotate-180')} />
          </button>
          <AnimatePresence>
            {cueVisible && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{cueText}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Tip */}
      {state === 'idle' && (
        <p className="text-center text-xs text-slate-400">
          Tip: Keep your pitch under 3 minutes. Investors decide in 90 seconds.
        </p>
      )}
    </div>
  );
}

/** Pick a supported MIME type for the current browser */
function getSupportedMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}
