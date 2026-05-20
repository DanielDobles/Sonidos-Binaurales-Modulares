import type {Metadata} from 'next';
import './globals.css';
import { JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-mono'});

export const metadata: Metadata = {
  title: 'My Google AI Studio App',
  description: 'My Google AI Studio App',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-mono", jetbrainsMono.variable)}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
