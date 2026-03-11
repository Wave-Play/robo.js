"use client"

import type { Variants } from "motion/react"
import { motion, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { cn } from "@/lib/utils"

export interface BrainIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface BrainIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

const variants: Variants = {
  normal: {
    opacity: 1,
    pathLength: 1,
    pathOffset: 0,
    transition: {
      duration: 0.4,
      opacity: { duration: 0.1 },
    },
  },
  animate: {
    opacity: [0, 1],
    pathLength: [0, 1],
    pathOffset: [1, 0],
    transition: {
      duration: 0.6,
      ease: "linear",
      opacity: { duration: 0.1 },
    },
  },
}

const BrainIcon = forwardRef<BrainIconHandle, BrainIconProps>(
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
          <motion.path
            d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"
            variants={variants}
            animate={controls}
            initial="normal"
          />
          <motion.path
            d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"
            variants={variants}
            animate={controls}
            initial="normal"
          />
          <motion.path
            d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"
            variants={variants}
            animate={controls}
            initial="normal"
          />
          <motion.path
            d="M17.599 6.5a3 3 0 0 0 .399-1.375"
            variants={variants}
            animate={controls}
            initial="normal"
          />
          <motion.path
            d="M6.003 5.125A3 3 0 0 0 6.401 6.5"
            variants={variants}
            animate={controls}
            initial="normal"
          />
          <motion.path
            d="M3.477 10.896a4 4 0 0 1 .585-.396"
            variants={variants}
            animate={controls}
            initial="normal"
          />
          <motion.path
            d="M19.938 10.5a4 4 0 0 1 .585.396"
            variants={variants}
            animate={controls}
            initial="normal"
          />
          <motion.path
            d="M6 18a4 4 0 0 1-1.967-.516"
            variants={variants}
            animate={controls}
            initial="normal"
          />
          <motion.path
            d="M19.967 17.484A4 4 0 0 1 18 18"
            variants={variants}
            animate={controls}
            initial="normal"
          />
        </svg>
      </div>
    )
  },
)

BrainIcon.displayName = "BrainIcon"

export { BrainIcon }
