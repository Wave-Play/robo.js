"use client"

import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { ExaShape } from "./ui/exa-shape"
import { ExaGrow } from "./ui/exa-grow"

interface CardsProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function Cards({ children, className, ...props }: CardsProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 @container",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

interface CardProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  href?: string
  title: React.ReactNode
  description?: string
  icon?: React.ReactNode
}

export function Card({ href, title, description, icon, className, ...props }: CardProps) {
  const content = (
    <ExaGrow scale={1.02}>
      <div className={cn("relative w-full", className)}>
        <ExaShape
          highlight
          innerBorderWidth={2}
          slope={24}
        >
          <div className="flex flex-col gap-2 p-6">
            {icon && (
              <div className="not-prose mb-1 w-fit shadow-md border bg-muted p-1.5 text-muted-foreground [&_svg]:size-4">
                {icon}
              </div>
            )}
            <h3 className="not-prose mb-1 text-sm font-medium flex items-center gap-2">
              {title}
            </h3>
            {description && (
              <p className="my-0 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </ExaShape>
      </div>
    </ExaGrow>
  )

  if (href) {
    const isExternal = href.startsWith("http") || href.startsWith("//")

    if (isExternal) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="block no-underline @max-lg:col-span-full"
          {...props}
        >
          {content}
        </a>
      )
    }

    return (
      <Link href={href} className="block no-underline @max-lg:col-span-full" {...props}>
        {content}
      </Link>
    )
  }

  return <div className="@max-lg:col-span-full" {...props}>{content}</div>
}
