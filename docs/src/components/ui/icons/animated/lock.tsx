"use client"

import type { Variants } from "motion/react"
import { motion, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { cn } from "@/lib/utils"

export interface LockIconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

interface LockIconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number
}

const bodyVariants: Variants = {
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
			duration: 0.4,
			ease: "linear",
			opacity: { duration: 0.1 },
		},
	},
}

const shackleVariants: Variants = {
	normal: {
		y: 0,
		transition: { duration: 0.3, ease: "easeInOut" },
	},
	animate: {
		y: [0, -3, -3, 0],
		transition: {
			duration: 0.6,
			times: [0, 0.3, 0.6, 1],
			ease: "easeInOut",
		},
	},
}

const LockIcon = forwardRef<LockIconHandle, LockIconProps>(
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
					{/* Shackle — bounces up then locks down */}
					<motion.path d="M7 11V7a5 5 0 0 1 10 0v4" variants={shackleVariants} animate={controls} initial="normal" />
					{/* Body */}
					<motion.rect x="3" y="11" width="18" height="11" rx="2" variants={bodyVariants} animate={controls} initial="normal" />
					{/* Keyhole */}
					<motion.circle cx="12" cy="16" r="1.5" variants={bodyVariants} animate={controls} initial="normal" />
				</svg>
			</div>
		)
	},
)

LockIcon.displayName = "LockIcon"

export { LockIcon }
