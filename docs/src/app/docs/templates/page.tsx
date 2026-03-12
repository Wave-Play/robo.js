import Link from "next/link"
import { LayoutTemplate } from "lucide-react"
import { templates } from "@/data/templates"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { TemplateGallery } from "./template-gallery"

export default function TemplatesPage() {
  return (
    <main className={cn(
      "w-full [grid-row:3] [grid-column:2/-1] px-6 py-12 md:px-10 md:py-16 xl:px-14",
      "transition-[padding] duration-300 ease-in-out",
      "sidebar-aware-padding"
    )}>
      <div className="flex flex-col items-center text-center mb-12">
        <Badge variant="outline" className="mb-4 gap-1.5">
          <LayoutTemplate className="h-3 w-3" />
          Template Gallery
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl mb-4">
          Start Building Fast
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl">
          Ready-to-use templates for Discord Activities, Bots, Web Apps, and Plugins.
          Clone and customize to get started in minutes.
        </p>
      </div>

      <TemplateGallery templates={templates} />

      {/* Create Your Own */}
      <section className="mt-16 text-center">
        <h2 className="text-2xl font-semibold mb-4">Create Your Own Template</h2>
        <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
          Have a project setup you want to share? Turn it into a template
          that others can use to get started quickly.
        </p>
        <Link
          href="/docs/framework/templates"
          className={cn(
            "inline-flex items-center gap-2 px-6 py-3 rounded-lg",
            "bg-primary text-primary-foreground font-medium",
            "hover:bg-primary/90 transition-colors"
          )}
        >
          Learn How
        </Link>
      </section>
    </main>
  )
}
