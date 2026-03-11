"use client"

import type { Variants } from "motion/react"
import { motion, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { cn } from "@/lib/utils"

export interface RefreshSyncIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface RefreshSyncIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

const topVariants: Variants = {
  normal: {
    x: 0,
    transition: { duration: 0.3 },
  },
  animate: {
    x: [0, 3, 0],
    transition: { duration: 0.5, ease: "easeInOut" },
  },
}

const bottomVariants: Variants = {
  normal: {
    x: 0,
    transition: { duration: 0.3 },
  },
  animate: {
    x: [0, -3, 0],
    transition: { duration: 0.5, ease: "easeInOut" },
  },
}

const RefreshSyncIcon = forwardRef<RefreshSyncIconHandle, RefreshSyncIconProps>(
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
          {/* Top arrow pointing right */}
          <motion.path d="M4 8h14" variants={topVariants} animate={controls} />
          <motion.path d="M15 4l4 4-4 4" variants={topVariants} animate={controls} />
          {/* Bottom arrow pointing left */}
          <motion.path d="M20 16H6" variants={bottomVariants} animate={controls} />
          <motion.path d="M9 12l-4 4 4 4" variants={bottomVariants} animate={controls} />
        </svg>
      </div>
    )
  },
)

RefreshSyncIcon.displayName = "RefreshSyncIcon"

export { RefreshSyncIcon }
