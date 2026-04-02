"use client"

import type { Variants } from "motion/react"
import { motion, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { cn } from "@/lib/utils"

export interface ArrowUpCircleIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface ArrowUpCircleIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

const arrowVariants: Variants = {
  normal: {
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
  animate: {
    y: [0, -2, 0],
    transition: {
      duration: 0.5,
      ease: "easeInOut",
    },
  },
}

const ArrowUpCircleIcon = forwardRef<ArrowUpCircleIconHandle, ArrowUpCircleIconProps>(
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
          <rect x="2" y="2" width="20" height="20" />
          <motion.g variants={arrowVariants} animate={controls} initial="normal">
            <path d="m16 12-4-4-4 4" />
            <path d="M12 16V8" />
          </motion.g>
        </svg>
      </div>
    )
  },
)

ArrowUpCircleIcon.displayName = "ArrowUpCircleIcon"

export { ArrowUpCircleIcon }
