"use client"

import type { Variants } from "motion/react"
import { motion, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { cn } from "@/lib/utils"

export interface TranslateIconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

interface TranslateIconProps extends HTMLAttributes<HTMLDivElement> {
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
			duration: 0.4,
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
			duration: 0.4,
			delay: 0.25,
			ease: "linear",
			opacity: { duration: 0.1, delay: 0.25 },
		},
	},
}

const TranslateIcon = forwardRef<TranslateIconHandle, TranslateIconProps>(
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
					{/* 木 (tree) — vertical trunk, horizontal branch, two diagonal roots */}
					<motion.path d="M6 1v16" variants={leftVariants} animate={controls} initial="normal" />
					<motion.path d="M1 7h10" variants={leftVariants} animate={controls} initial="normal" />
					<motion.path d="M6 7L1 17" variants={leftVariants} animate={controls} initial="normal" />
					<motion.path d="M6 7L11 17" variants={leftVariants} animate={controls} initial="normal" />
					{/* A character */}
					<motion.path d="M14 20L18.5 7L23 20" variants={rightVariants} animate={controls} initial="normal" />
					<motion.path d="M15.5 16h6" variants={rightVariants} animate={controls} initial="normal" />
				</svg>
			</div>
		)
	},
)

TranslateIcon.displayName = "TranslateIcon"

export { TranslateIcon }
