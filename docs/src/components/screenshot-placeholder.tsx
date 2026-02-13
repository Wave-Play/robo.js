"use client"

import * as React from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"

interface ScreenshotPlaceholderProps {
  /** Descriptive alt text for the screenshot */
  alt: string
  /** Path to the actual screenshot image (when available) */
  src?: string
  /** What the screenshot should focus on */
  focus?: string
  /** Recommended zoom level (e.g., "100%", "150%", "fit") */
  zoom?: string
  /** Aspect ratio (e.g., "16/9", "4/3", "21/9") */
  aspect?: string
  /** Additional notes for the screenshot creator */
  notes?: string
  /** Optional className */
  className?: string
}

export function ScreenshotPlaceholder({
  alt,
  src,
  focus,
  zoom,
  aspect = "16/9",
  notes,
  className,
}: ScreenshotPlaceholderProps) {
  if (src) {
    return (
      <figure className={cn("my-6", className)}>
        <Image
          src={src}
          alt={alt}
          width={1200}
          height={Math.round(1200 / parseAspect(aspect))}
          className="w-full border border-fd-border"
          style={{ aspectRatio: aspect.replace("/", " / ") }}
        />
        {alt && (
          <figcaption className="mt-2 text-center text-sm text-muted-foreground">
            {alt}
          </figcaption>
        )}
      </figure>
    )
  }

  const meta = [
    focus && { label: "Focus", value: focus },
    zoom && { label: "Zoom", value: zoom },
    notes && { label: "Notes", value: notes },
  ].filter(Boolean) as { label: string; value: string }[]

  return (
    <figure
      className={cn(
        "group/ph relative my-6 w-full overflow-hidden border border-fd-border bg-gradient-to-br from-fd-muted/60 via-fd-muted/30 to-fd-muted/60",
        className
      )}
      style={{ aspectRatio: aspect.replace("/", " / "), maxHeight: 360 }}
    >
      {/* Grid pattern background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Gradient accent line at top */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      {/* Content */}
      <div className="relative flex h-full flex-col items-center justify-center gap-4 p-6">
        {/* Icon cluster */}
        <div className="relative">
          <div className="absolute -inset-3 bg-primary/5 transition-colors group-hover/ph:bg-primary/10" />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="relative text-muted-foreground/40 transition-colors group-hover/ph:text-primary/50"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
        </div>

        {/* Title */}
        <p className="max-w-lg text-center text-sm font-medium leading-snug text-muted-foreground/70">
          {alt}
        </p>

        {/* Metadata pills */}
        {meta.length > 0 && (
          <div className="flex max-w-xl flex-wrap items-center justify-center gap-2">
            {meta.map(({ label, value }) => (
              <span
                key={label}
                className="inline-flex items-baseline gap-1.5 bg-fd-muted/60 px-2.5 py-1 text-xs leading-tight text-muted-foreground/60"
              >
                <span className="font-semibold text-muted-foreground/70">{label}</span>
                <span>{value}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </figure>
  )
}

function parseAspect(aspect: string): number {
  const parts = aspect.split("/")
  if (parts.length === 2) {
    const w = parseFloat(parts[0])
    const h = parseFloat(parts[1])
    if (w > 0 && h > 0) return w / h
  }
  return 16 / 9
}
