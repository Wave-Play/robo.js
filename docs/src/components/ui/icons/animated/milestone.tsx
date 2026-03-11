"use client"

import { motion, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { cn } from "@/lib/utils"

export interface MilestoneIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface MilestoneIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

const MilestoneIcon = forwardRef<MilestoneIconHandle, MilestoneIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation()
    const isControlledRef = useRef(false)

    useImperativeHandle(ref, () => {
      isControlledRef.current = true

      return {
        startAnimation: () => controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      }
    })

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isControlledRef.current) {
          controls.start("animate")
        } else {
          onMouseEnter?.(e)
        }
      },
      [controls, onMouseEnter],
    )

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isControlledRef.current) {
          controls.start("normal")
        } else {
          onMouseLeave?.(e)
        }
      },
      [controls, onMouseLeave],
    )

    return (
      <div
        className={cn(
          `cursor-pointer select-none rounded-md transition-colors duration-200 flex items-center justify-center`,
          className,
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="square"
          strokeLinejoin="miter"
        >
          {/* Vertical timeline */}
          <path d="M6 2v20" />
          {/* Flag 1 — top milestone */}
          <motion.path
            d="M6 5h8l-2 2.5L14 10H6"
            variants={{
              normal: { pathLength: 1, opacity: 1 },
              animate: {
                pathLength: [0, 1],
                opacity: [0, 1],
                transition: { duration: 0.4, delay: 0.1 },
              },
            }}
            animate={controls}
          />
          {/* Marker 2 — middle milestone */}
          <motion.path
            d="M6 15h4"
            variants={{
              normal: { pathLength: 1, opacity: 1 },
              animate: {
                pathLength: [0, 1],
                opacity: [0, 1],
                transition: { duration: 0.3, delay: 0.4 },
              },
            }}
            animate={controls}
          />
          {/* Marker 3 — bottom milestone */}
          <motion.path
            d="M6 19h2"
            variants={{
              normal: { pathLength: 1, opacity: 1 },
              animate: {
                pathLength: [0, 1],
                opacity: [0, 1],
                transition: { duration: 0.3, delay: 0.6 },
              },
            }}
            animate={controls}
          />
        </svg>
      </div>
    )
  },
)

MilestoneIcon.displayName = "MilestoneIcon"

export { MilestoneIcon }
