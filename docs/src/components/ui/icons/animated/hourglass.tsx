"use client"

import type { Variants } from "motion/react"
import { motion, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { cn } from "@/lib/utils"

export interface HourglassIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface HourglassIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

const glassVariants: Variants = {
  normal: {
    rotate: 0,
    transition: {
      duration: 0.3,
      ease: "easeInOut",
    },
  },
  animate: {
    rotate: [0, 180],
    transition: {
      duration: 0.6,
      ease: "easeInOut",
    },
  },
}

const HourglassIcon = forwardRef<HourglassIconHandle, HourglassIconProps>(
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
        <motion.svg
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="square"
          strokeLinejoin="miter"
          variants={glassVariants}
          animate={controls}
          style={{ originX: "50%", originY: "50%" }}
        >
          {/* Top bar */}
          <path d="M5 2h14" />
          {/* Bottom bar */}
          <path d="M5 22h14" />
          {/* Glass body - sharp angular hourglass */}
          <path d="M7 2v4l5 6-5 6v4" />
          <path d="M17 2v4l-5 6 5 6v4" />
          {/* Sand line */}
          <path d="M10 14h4" />
        </motion.svg>
      </div>
    )
  },
)

HourglassIcon.displayName = "HourglassIcon"

export { HourglassIcon }
