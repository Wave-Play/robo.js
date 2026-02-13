"use client"

import * as React from "react"

const VIEWBOX_W = 800
const VIEWBOX_H = 420

interface Node {
  id: string
  label: string
  description: string
  x: number
  y: number
  category: "neutral" | "active" | "warning" | "success" | "error" | "stopped"
}

const nodes: Node[] = [
  { id: "idle", label: "idle", description: "No scenario loaded", x: 80, y: 56, category: "neutral" },
  { id: "loaded", label: "loaded", description: "Validated & ready", x: 260, y: 56, category: "neutral" },
  { id: "running", label: "running", description: "Executing steps", x: 440, y: 56, category: "active" },
  { id: "completed", label: "completed", description: "All steps passed", x: 680, y: 56, category: "success" },
  { id: "paused", label: "paused", description: "Can resume", x: 370, y: 200, category: "warning" },
  { id: "failed", label: "failed", description: "Assertion failure", x: 580, y: 200, category: "error" },
  { id: "stopped", label: "stopped", description: "Manually stopped", x: 370, y: 344, category: "stopped" },
  { id: "error", label: "error", description: "Fatal, not resumable", x: 580, y: 344, category: "error" },
]

const NODE_W = 130
const NODE_H = 56

interface Edge {
  from: string
  to: string
  label?: string
  path: string
}

const edges: Edge[] = [
  // Row 0 horizontals
  { from: "idle", to: "loaded", path: `M ${80 + NODE_W / 2} 56 L ${260 - NODE_W / 2} 56` },
  { from: "loaded", to: "running", path: `M ${260 + NODE_W / 2} 56 L ${440 - NODE_W / 2} 56` },
  { from: "running", to: "completed", path: `M ${440 + NODE_W / 2} 56 L ${680 - NODE_W / 2} 56` },
  // running -> paused (vertical down, offset left)
  { from: "running", to: "paused", path: `M 425 ${56 + NODE_H / 2} L 425 ${200 - NODE_H / 2}` },
  // paused -> running (curved arc back up, offset further left)
  { from: "paused", to: "running", path: `M ${370 - NODE_W / 2} ${200 - 10} C ${310} ${200 - 10}, ${310} ${56 + 10}, ${440 - NODE_W / 2} ${56 + 10}` },
  // paused -> stopped (vertical down)
  { from: "paused", to: "stopped", path: `M 370 ${200 + NODE_H / 2} L 370 ${344 - NODE_H / 2}` },
  // running -> failed (diagonal down-right, offset right)
  { from: "running", to: "failed", label: "assertion failure", path: `M ${440 + 20} ${56 + NODE_H / 2} L ${580 - 20} ${200 - NODE_H / 2}` },
  // failed -> running (curved arc back up-left, offset)
  { from: "failed", to: "running", label: "resume", path: `M ${580 + NODE_W / 2} ${200 - 10} C ${660} ${200 - 10}, ${660} ${56 + 10}, ${440 + NODE_W / 2} ${56 + 10}` },
  // failed -> stopped (diagonal down-left)
  { from: "failed", to: "stopped", path: `M ${580 - 20} ${200 + NODE_H / 2} L ${370 + 20} ${344 - NODE_H / 2}` },
  // running -> error (routed right then down to avoid crossing failed)
  { from: "running", to: "error", label: "fatal", path: `M ${440 + NODE_W / 2} ${56 + 16} L ${700} ${56 + 16} L ${700} ${344} L ${580 + NODE_W / 2} ${344}` },
]

const categoryColor: Record<Node["category"], string> = {
  neutral: "var(--muted-foreground)",
  active: "var(--primary)",
  warning: "var(--chart-4)",
  success: "var(--chart-1)",
  error: "#f87171",
  stopped: "var(--muted-foreground)",
}

function getNodeById(id: string) {
  return nodes.find((n) => n.id === id)!
}

/** Extract first and last coordinate pairs from a path string */
function getPathEndpoints(d: string) {
  const nums: number[] = []
  for (const p of d.trim().split(/\s+/)) {
    const n = parseFloat(p)
    if (!isNaN(n)) nums.push(n)
  }
  return {
    x1: nums[0],
    y1: nums[1],
    x2: nums[nums.length - 2],
    y2: nums[nums.length - 1],
  }
}

const categoryStyles: Record<Node["category"], { bg: string; border: string; text: string }> = {
  neutral: {
    bg: "bg-fd-muted/60 hover:bg-fd-muted",
    border: "border-fd-border",
    text: "text-muted-foreground",
  },
  active: {
    bg: "bg-primary/10 hover:bg-primary/20",
    border: "border-primary/30 hover:border-primary",
    text: "text-primary",
  },
  warning: {
    bg: "bg-chart-4/10 hover:bg-chart-4/20",
    border: "border-chart-4/30 hover:border-chart-4",
    text: "text-chart-4",
  },
  success: {
    bg: "bg-chart-1/10 hover:bg-chart-1/20",
    border: "border-chart-1/30 hover:border-chart-1",
    text: "text-chart-1",
  },
  error: {
    bg: "bg-red-400/20 hover:bg-red-400/30",
    border: "border-red-400/50 hover:border-red-400",
    text: "text-red-400",
  },
  stopped: {
    bg: "bg-muted-foreground/10 hover:bg-muted-foreground/20",
    border: "border-muted-foreground/30 hover:border-muted-foreground",
    text: "text-muted-foreground",
  },
}

export function StateFlowDiagram() {
  return (
    <figure className="group/ph relative my-6 w-full overflow-x-auto border border-fd-border bg-gradient-to-br from-fd-muted/60 via-fd-muted/30 to-fd-muted/60">
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

      {/* Inner content */}
      <div className="relative" style={{ minWidth: 660, minHeight: 420 }}>
        {/* SVG arrow layer */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Glow filter */}
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
              <feComposite in="blur" in2="SourceGraphic" operator="over" />
            </filter>

            {/* Per-edge gradients and arrowhead markers */}
            {edges.map((edge, i) => {
              const fromNode = getNodeById(edge.from)
              const toNode = getNodeById(edge.to)
              const fromColor = categoryColor[fromNode.category]
              const toColor = categoryColor[toNode.category]
              const endpoints = getPathEndpoints(edge.path)
              return (
                <React.Fragment key={`defs-${i}`}>
                  <linearGradient
                    id={`edge-grad-${i}`}
                    x1={endpoints.x1}
                    y1={endpoints.y1}
                    x2={endpoints.x2}
                    y2={endpoints.y2}
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor={fromColor} />
                    <stop offset="100%" stopColor={toColor} />
                  </linearGradient>
                  <marker
                    id={`arrow-${i}`}
                    markerWidth="10"
                    markerHeight="8"
                    refX="9"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M 0 0.5 L 9 4 L 0 7.5 Z" fill={toColor} />
                  </marker>
                </React.Fragment>
              )
            })}
          </defs>
          <style>{`
            @keyframes dashFlow {
              to { stroke-dashoffset: -20; }
            }
          `}</style>
          {edges.map((edge, i) => (
            <g key={i}>
              {/* Glow layer */}
              <path
                d={edge.path}
                fill="none"
                stroke={`url(#edge-grad-${i})`}
                strokeWidth="4"
                opacity="0.15"
                filter="url(#glow)"
              />
              {/* Main animated stroke */}
              <path
                d={edge.path}
                fill="none"
                stroke={`url(#edge-grad-${i})`}
                strokeWidth="1.5"
                strokeDasharray="6 4"
                markerEnd={`url(#arrow-${i})`}
                style={{ animation: "dashFlow 1s linear infinite" }}
              />
              {edge.label && (() => {
                const mid = getPathMidpoint(edge.path)
                const toNode = getNodeById(edge.to)
                const labelColor = categoryColor[toNode.category]
                return (
                  <>
                    <rect
                      x={mid.x - measureText(edge.label) / 2 - 5}
                      y={mid.y - 8}
                      width={measureText(edge.label) + 10}
                      height={16}
                      fill="var(--background)"
                      rx="0"
                      className="opacity-90"
                    />
                    <text
                      x={mid.x}
                      y={mid.y + 3.5}
                      textAnchor="middle"
                      fill={labelColor}
                      opacity="0.8"
                      style={{ fontSize: 9, fontFamily: "var(--font-mono)", fontWeight: 600 }}
                    >
                      {edge.label}
                    </text>
                  </>
                )
              })()}
            </g>
          ))}
        </svg>

        {/* HTML node layer */}
        <div className="absolute inset-0">
          {nodes.map((node) => {
            const style = categoryStyles[node.category]
            const left = `${((node.x - NODE_W / 2) / VIEWBOX_W) * 100}%`
            const top = `${((node.y - NODE_H / 2) / VIEWBOX_H) * 100}%`
            const width = `${(NODE_W / VIEWBOX_W) * 100}%`
            const height = `${(NODE_H / VIEWBOX_H) * 100}%`

            return (
              <div
                key={node.id}
                className={`absolute flex flex-col items-center justify-center border transition-colors ${style.bg} ${style.border}`}
                style={{ left, top, width, height }}
              >
                <span className={`text-xs font-semibold font-mono ${style.text}`}>{node.label}</span>
                <span className="text-[10px] text-muted-foreground/70 leading-tight">{node.description}</span>
              </div>
            )
          })}
        </div>
      </div>
    </figure>
  )
}

function getPathMidpoint(d: string): { x: number; y: number } {
  const parts = d.trim().split(/\s+/)
  const coords: number[] = []
  for (const p of parts) {
    const n = parseFloat(p)
    if (!isNaN(n)) coords.push(n)
  }
  if (coords.length >= 4) {
    const midIdx = Math.floor(coords.length / 2)
    const midIdxEven = midIdx % 2 === 0 ? midIdx : midIdx - 1
    return { x: (coords[0] + coords[midIdxEven]) / 2, y: (coords[1] + coords[midIdxEven + 1]) / 2 }
  }
  return { x: 400, y: 210 }
}

function measureText(text: string): number {
  return text.length * 5.4
}
