"use client"

import type { Variants } from "motion/react"
import { motion, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { cn } from "@/lib/utils"

export interface LanguagesIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface LanguagesIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

const leftVariants: Variants = {
  normal: {
    opacity: 1,
    pathLength: 1,
    pathOffset: 0,
    transition: { duration: 0.3 },
  },
  animate: {
    opacity: [0, 1],
    pathLength: [0, 1],
    pathOffset: [1, 0],
    transition: {
      duration: 0.5,
      ease: "linear",
      opacity: { duration: 0.1 },
    },
  },
}

const rightVariants: Variants = {
  normal: {
    opacity: 1,
    pathLength: 1,
    pathOffset: 0,
    transition: { duration: 0.3 },
  },
  animate: {
    opacity: [0, 1],
    pathLength: [0, 1],
    pathOffset: [1, 0],
    transition: {
      duration: 0.5,
      delay: 0.2,
      ease: "linear",
      opacity: { duration: 0.1, delay: 0.2 },
    },
  },
}

const LanguagesIcon = forwardRef<LanguagesIconHandle, LanguagesIconProps>(
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
          {/* Left side: "A" character with underline */}
          <motion.path d="M5 8l3 8" variants={leftVariants} animate={controls} initial="normal" />
          <motion.path d="M11 8l-3 8" variants={leftVariants} animate={controls} initial="normal" />
          <motion.path d="M6.5 12h3" variants={leftVariants} animate={controls} initial="normal" />
          {/* Arrow */}
          <motion.path d="M10 19l2-2 2 2" variants={leftVariants} animate={controls} initial="normal" />
          <motion.path d="M12 17v5" variants={leftVariants} animate={controls} initial="normal" />
          {/* Right side: foreign character strokes */}
          <motion.path d="M14 4h6" variants={rightVariants} animate={controls} initial="normal" />
          <motion.path d="M17 2v6" variants={rightVariants} animate={controls} initial="normal" />
          <motion.path d="M14 10l3-3 3 3" variants={rightVariants} animate={controls} initial="normal" />
        </svg>
      </div>
    )
  },
)

LanguagesIcon.displayName = "LanguagesIcon"

export { LanguagesIcon }
