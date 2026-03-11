"use client"

import type { Variants } from "motion/react"
import { motion, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { cn } from "@/lib/utils"

export interface DiamondNodesIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface DiamondNodesIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

const variants: Variants = {
  normal: {
    pathLength: 1,
    opacity: 1,
  },
  animate: (custom: number) => ({
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: {
      delay: 0.15 * custom,
      opacity: { delay: 0.1 * custom },
    },
  }),
}

const DiamondNodesIcon = forwardRef<DiamondNodesIconHandle, DiamondNodesIconProps>(
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
          {/* Top diamond */}
          <motion.path d="M12 2l2.5 2.5L12 7 9.5 4.5Z" variants={variants} animate={controls} custom={0} />
          {/* Top-left connector */}
          <motion.path d="m10.2 6.3-3.9 3.9" variants={variants} animate={controls} custom={1} />
          {/* Left diamond */}
          <motion.path d="M4.5 9.5L7 12 4.5 14.5 2 12Z" variants={variants} animate={controls} custom={0} />
          {/* Middle connector */}
          <motion.path d="M7 12h10" variants={variants} animate={controls} custom={2} />
          {/* Right diamond */}
          <motion.path d="M19.5 9.5L22 12l-2.5 2.5L17 12Z" variants={variants} animate={controls} custom={0} />
          {/* Bottom-right connector */}
          <motion.path d="m13.8 17.7 3.9-3.9" variants={variants} animate={controls} custom={3} />
          {/* Bottom diamond */}
          <motion.path d="M12 17l2.5 2.5L12 22l-2.5-2.5Z" variants={variants} animate={controls} custom={0} />
        </svg>
      </div>
    )
  },
)

DiamondNodesIcon.displayName = "DiamondNodesIcon"

export { DiamondNodesIcon }
