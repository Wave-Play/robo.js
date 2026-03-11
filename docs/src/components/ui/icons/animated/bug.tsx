"use client"

import type { Variants } from "motion/react"
import { motion, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { cn } from "@/lib/utils"

export interface BugIconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

interface BugIconProps extends HTMLAttributes<HTMLDivElement> {
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
			duration: 0.5,
			ease: "linear",
			opacity: { duration: 0.1 },
		},
	},
}

const legVariants: Variants = {
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
			duration: 0.3,
			delay: 0.3,
			ease: "linear",
			opacity: { duration: 0.1, delay: 0.3 },
		},
	},
}

const BugIcon = forwardRef<BugIconHandle, BugIconProps>(
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
					{/* Head */}
					<motion.circle cx="12" cy="5" r="2" variants={bodyVariants} animate={controls} initial="normal" />
					{/* Antennae */}
					<motion.path d="M10.5 3.5L8 1" variants={bodyVariants} animate={controls} initial="normal" />
					<motion.path d="M13.5 3.5L16 1" variants={bodyVariants} animate={controls} initial="normal" />
					{/* Body — rectangle with rounded bottom */}
					<motion.path d="M8 8h8v10a4 4 0 0 1-8 0z" variants={bodyVariants} animate={controls} initial="normal" />
					{/* Center divider */}
					<motion.path d="M12 8v12" variants={bodyVariants} animate={controls} initial="normal" />
					{/* Legs — 3 pairs at angles */}
					<motion.path d="M8 11L4 9" variants={legVariants} animate={controls} initial="normal" />
					<motion.path d="M8 14.5H4" variants={legVariants} animate={controls} initial="normal" />
					<motion.path d="M8 18L5 20" variants={legVariants} animate={controls} initial="normal" />
					<motion.path d="M16 11l4-2" variants={legVariants} animate={controls} initial="normal" />
					<motion.path d="M16 14.5h4" variants={legVariants} animate={controls} initial="normal" />
					<motion.path d="M16 18l3 2" variants={legVariants} animate={controls} initial="normal" />
				</svg>
			</div>
		)
	},
)

BugIcon.displayName = "BugIcon"

export { BugIcon }
