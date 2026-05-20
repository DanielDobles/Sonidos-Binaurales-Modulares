'use client';

import dynamic from 'next/dynamic';

const BinauralBeatsApp = dynamic(() => import('@/components/BinauralBeatsApp'), { 
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-zinc-950">
      <div className="text-white/20 font-mono text-xs uppercase tracking-[0.5em] animate-pulse">
        Initializing Neuro-Sync...
      </div>
    </div>
  )
});

export default function Home() {
  return (
    <main className="min-h-screen bg-transparent">
      <BinauralBeatsApp />
    </main>
  );
}
