"use client"

import type { Variants } from "motion/react"
import { motion, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { cn } from "@/lib/utils"

export interface TerminalSquareIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface TerminalSquareIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

const lineVariants: Variants = {
  normal: { opacity: 1 },
  animate: {
    opacity: [1, 0, 1],
    transition: {
      duration: 0.8,
      repeat: Infinity,
      ease: "linear",
    },
  },
}

const TerminalSquareIcon = forwardRef<TerminalSquareIconHandle, TerminalSquareIconProps>(
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
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <polyline points="7 15 10 12 7 9" />
          <motion.line x1="13" x2="17" y1="15" y2="15" variants={lineVariants} animate={controls} initial="normal" />
        </svg>
      </div>
    )
  },
)

TerminalSquareIcon.displayName = "TerminalSquareIcon"

export { TerminalSquareIcon }
