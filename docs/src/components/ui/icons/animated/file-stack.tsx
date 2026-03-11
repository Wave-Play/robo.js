"use client"

import { motion, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { cn } from "@/lib/utils"

export interface FileStackIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface FileStackIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

const FileStackIcon = forwardRef<FileStackIconHandle, FileStackIconProps>(
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
            d="M21 7h-5V2"
            variants={{
              normal: { translateX: 0, translateY: 0 },
              animate: { translateX: -4, translateY: 4 },
            }}
            animate={controls}
          />
          <motion.path
            d="M21 6v8h-10V2H17Z"
            variants={{
              normal: { translateX: 0, translateY: 0 },
              animate: { translateX: -4, translateY: 4 },
            }}
            animate={controls}
          />
          <path d="M7 8v10h8" />
          <motion.path
            d="M3 12v10h8"
            variants={{
              normal: { translateX: 0, translateY: 0 },
              animate: { translateX: 4, translateY: -4 },
            }}
            animate={controls}
          />
        </svg>
      </div>
    )
  },
)

FileStackIcon.displayName = "FileStackIcon"

export { FileStackIcon }
