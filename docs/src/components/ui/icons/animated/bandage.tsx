"use client"

import { motion, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { cn } from "@/lib/utils"

export interface BandageIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface BandageIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

const BandageIcon = forwardRef<BandageIconHandle, BandageIconProps>(
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
          animate={controls}
          variants={{
            normal: { rotate: 0 },
            animate: {
              rotate: [0, -5, 5, 0],
              transition: { duration: 0.5, ease: "easeInOut" },
            },
          }}
        >
          {/* Band-aid strip rotated 45deg, sharp corners (rx=0) */}
          <rect x="2.5" y="8.5" width="19" height="7" rx="0" transform="rotate(-45 12 12)" />
          {/* Stitch marks in the center */}
          <motion.path
            d="M8 11.5l1.5-1.5"
            variants={{
              normal: { pathLength: 1, opacity: 1 },
              animate: {
                pathLength: [0, 1],
                opacity: [0, 1],
                transition: { duration: 0.3, delay: 0.2 },
              },
            }}
          />
          <motion.path
            d="M11 14.5l1.5-1.5"
            variants={{
              normal: { pathLength: 1, opacity: 1 },
              animate: {
                pathLength: [0, 1],
                opacity: [0, 1],
                transition: { duration: 0.3, delay: 0.3 },
              },
            }}
          />
          <motion.path
            d="M9.5 14l1.5-1.5"
            variants={{
              normal: { pathLength: 1, opacity: 1 },
              animate: {
                pathLength: [0, 1],
                opacity: [0, 1],
                transition: { duration: 0.3, delay: 0.4 },
              },
            }}
          />
          <motion.path
            d="M12.5 11l1.5-1.5"
            variants={{
              normal: { pathLength: 1, opacity: 1 },
              animate: {
                pathLength: [0, 1],
                opacity: [0, 1],
                transition: { duration: 0.3, delay: 0.5 },
              },
            }}
          />
        </motion.svg>
      </div>
    )
  },
)

BandageIcon.displayName = "BandageIcon"

export { BandageIcon }
