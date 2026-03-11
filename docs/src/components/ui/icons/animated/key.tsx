"use client"

import type { Variants } from "motion/react"
import { motion, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { cn } from "@/lib/utils"

export interface KeyIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface KeyIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

const variants: Variants = {
  normal: {
    rotate: 0,
    transition: { duration: 0.3 },
  },
  animate: {
    rotate: [0, -20, 10, 0],
    transition: {
      duration: 0.5,
      ease: "easeInOut",
      times: [0, 0.3, 0.7, 1],
    },
  },
}

const KeyIcon = forwardRef<KeyIconHandle, KeyIconProps>(
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
          variants={variants}
          animate={controls}
          style={{ originX: "70%", originY: "30%" }}
        >
          {/* Key head - circle */}
          <circle cx="8" cy="8" r="5" />
          {/* Key shaft */}
          <path d="M11.5 11.5L22 22" />
          {/* Key teeth */}
          <path d="M16 16l2 2" />
          <path d="M19 13l2 2" />
        </motion.svg>
      </div>
    )
  },
)

KeyIcon.displayName = "KeyIcon"

export { KeyIcon }
