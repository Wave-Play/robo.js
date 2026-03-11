"use client"

import type { Variants } from "motion/react"
import { motion, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { cn } from "@/lib/utils"

export interface TrophyIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface TrophyIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

const bounceVariants: Variants = {
  normal: {
    y: 0,
    scale: 1,
    transition: {
      duration: 0.3,
    },
  },
  animate: {
    y: [0, -3, 0],
    scale: [1, 1.08, 1],
    transition: {
      duration: 0.5,
      ease: "easeInOut",
    },
  },
}

const TrophyIcon = forwardRef<TrophyIconHandle, TrophyIconProps>(
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
          variants={bounceVariants}
          animate={controls}
        >
          {/* Cup body */}
          <path d="M6 2h12v8l-6 4-6-4z" />
          {/* Left handle */}
          <path d="M6 4H4v4h2" />
          {/* Right handle */}
          <path d="M18 4h2v4h-2" />
          {/* Stem */}
          <path d="M12 14v4" />
          {/* Base */}
          <path d="M8 22h8" />
          <path d="M8 18h8" />
        </motion.svg>
      </div>
    )
  },
)

TrophyIcon.displayName = "TrophyIcon"

export { TrophyIcon }
