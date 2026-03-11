"use client"

import type { Variants } from "motion/react"
import { motion, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { cn } from "@/lib/utils"

export interface TestTubeIconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

interface TestTubeIconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number
}

const tubeVariants: Variants = {
	normal: {
		rotate: 0,
		transition: {
			duration: 0.3,
			ease: "easeInOut",
		},
	},
	animate: {
		rotate: [0, -8, 8, -4, 4, 0],
		transition: {
			duration: 0.5,
			times: [0, 0.2, 0.4, 0.6, 0.8, 1],
			ease: "easeInOut",
		},
	},
}

const bubbleVariants: Variants = {
	normal: {
		opacity: 0,
		translateY: 0,
	},
	animate: {
		opacity: [0, 1, 1, 0],
		translateY: [0, -3, -6, -9],
		transition: {
			duration: 0.6,
			ease: "easeOut",
		},
	},
}

const TestTubeIcon = forwardRef<TestTubeIconHandle, TestTubeIconProps>(
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
					variants={tubeVariants}
					animate={controls}
					style={{ originX: "50%", originY: "80%" }}
				>
					{/* Tube body */}
					<path d="M14.5 2v20h-5V2" />
					{/* Top rim */}
					<path d="M8.5 2h7" />
					{/* Liquid level */}
					<path d="M14.5 16h-5" />
					{/* Bubble */}
					<motion.circle cx="12" cy="18" r="0.8" fill="currentColor" stroke="none" variants={bubbleVariants} animate={controls} />
				</motion.svg>
			</div>
		)
	},
)

TestTubeIcon.displayName = "TestTubeIcon"

export { TestTubeIcon }
