"use client"

import Link from "next/link"
import Image from "next/image"
import { useState, useMemo } from "react"
import { ExternalLink, LayoutTemplate, Search, X } from "lucide-react"
import { typeLabels, typeColors, type Template } from "@/data/templates"
import { ExaCard, ExaCardContent, ExaCardDescription, ExaCardHeader, ExaCardTitle } from "@/components/ui/exa-card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type FilterType = "activity" | "bot" | "web" | "plugin"
type FilterLanguage = "TypeScript" | "JavaScript"

const allTypes: FilterType[] = ["activity", "bot", "web", "plugin"]
const allLanguages: FilterLanguage[] = ["TypeScript", "JavaScript"]

const placeholderGradients: Record<string, string> = {
  activity: "from-cyan-500/15 via-cyan-400/5 to-transparent",
  bot: "from-[#5865F2]/15 via-[#5865F2]/5 to-transparent",
  web: "from-green-500/15 via-green-400/5 to-transparent",
  plugin: "from-orange-500/15 via-orange-400/5 to-transparent",
}

const placeholderIcons: Record<string, string> = {
  activity: "text-cyan-500/20",
  bot: "text-[#5865F2]/20",
  web: "text-green-500/20",
  plugin: "text-orange-500/20",
}

const neonTypeColors: Record<string, string> = {
  activity: "border-cyan-400/60 bg-cyan-500/10 text-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.3)]",
  bot: "border-[#5865F2]/60 bg-[#5865F2]/10 text-[#7984F5] shadow-[0_0_8px_rgba(88,101,242,0.3)]",
  web: "border-green-400/60 bg-green-500/10 text-green-400 shadow-[0_0_8px_rgba(74,222,128,0.3)]",
  plugin: "border-orange-400/60 bg-orange-500/10 text-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.3)]",
}

const neonLangColors: Record<string, string> = {
  TypeScript: "border-[#3178C6]/60 bg-[#3178C6]/10 text-[#3178C6] shadow-[0_0_6px_rgba(49,120,198,0.3)]",
  JavaScript: "border-[#F7DF1E]/60 bg-[#F7DF1E]/10 text-[#F7DF1E] shadow-[0_0_6px_rgba(247,223,30,0.3)]",
}

interface TemplateGalleryProps {
  templates: Template[]
}

export function TemplateGallery({ templates }: TemplateGalleryProps) {
  const [search, setSearch] = useState("")
  const [typeFilters, setTypeFilters] = useState<Set<FilterType>>(new Set(allTypes))
  const [langFilters, setLangFilters] = useState<Set<FilterLanguage>>(new Set(allLanguages))

  const allTypesSelected = typeFilters.size === allTypes.length
  const allLangsSelected = langFilters.size === allLanguages.length

  const toggleType = (type: FilterType) => {
    setTypeFilters((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        // Don't allow deselecting the last one — reselect all instead
        if (next.size === 1) return new Set(allTypes)
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const toggleLang = (lang: FilterLanguage) => {
    setLangFilters((prev) => {
      const next = new Set(prev)
      if (next.has(lang)) {
        if (next.size === 1) return new Set(allLanguages)
        next.delete(lang)
      } else {
        next.add(lang)
      }
      return next
    })
  }

  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase()
        const matchesTitle = template.title.toLowerCase().includes(searchLower)
        const matchesDescription = template.description.toLowerCase().includes(searchLower)
        const matchesAuthor = template.author.toLowerCase().includes(searchLower)
        const matchesTags = template.tags.some((tag) => tag.toLowerCase().includes(searchLower))
        if (!matchesTitle && !matchesDescription && !matchesAuthor && !matchesTags) {
          return false
        }
      }

      // Type filter
      if (!allTypesSelected && !typeFilters.has(template.type as FilterType)) {
        return false
      }

      // Language filter
      if (!allLangsSelected && !langFilters.has(template.language as FilterLanguage)) {
        return false
      }

      return true
    })
  }, [search, typeFilters, langFilters, allTypesSelected, allLangsSelected])

  const typeFilterOptions: { value: FilterType; label: string }[] = [
    { value: "activity", label: "Discord Activities" },
    { value: "bot", label: "Discord Bots" },
    { value: "web", label: "Web Apps" },
    { value: "plugin", label: "Plugins" },
  ]

  const langFilterOptions: { value: FilterLanguage; label: string }[] = [
    { value: "TypeScript", label: "TypeScript" },
    { value: "JavaScript", label: "JavaScript" },
  ]

  const clearFilters = () => {
    setSearch("")
    setTypeFilters(new Set(allTypes))
    setLangFilters(new Set(allLanguages))
  }

  const hasActiveFilters = search || !allTypesSelected || !allLangsSelected

  return (
    <>
      {/* Filters */}
      <div className="mb-8 space-y-4">
        {/* Search */}
        <div className="relative max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-10"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Type Filters */}
        <div className="flex flex-wrap justify-center gap-2">
          {typeFilterOptions.map((filter) => (
            <button
              key={filter.value}
              onClick={() => toggleType(filter.value)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all border",
                typeFilters.has(filter.value)
                  ? neonTypeColors[filter.value]
                  : "border-transparent bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Language Filters */}
        <div className="flex flex-wrap justify-center gap-2">
          {langFilterOptions.map((filter) => (
            <button
              key={filter.value}
              onClick={() => toggleLang(filter.value)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-all border",
                langFilters.has(filter.value)
                  ? neonLangColors[filter.value]
                  : "border-transparent bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <div className="text-center">
            <button
              onClick={clearFilters}
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Results Count */}
      <div className="text-center mb-6">
        <p className="text-sm text-muted-foreground">
          Showing {filteredTemplates.length} of {templates.length} templates
        </p>
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length > 0 ? (
        <div className="grid gap-6 justify-center grid-cols-[repeat(auto-fill,minmax(280px,360px))]">
          {filteredTemplates.map((template) => (
            <TemplateCard key={template.href} template={template} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-lg mb-4">No templates found</p>
          <button
            onClick={clearFilters}
            className="text-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </>
  )
}

function TemplateCard({ template }: { template: Template }) {
  return (
    <Link href={template.href} className="group block">
      <ExaCard
        className={cn(
          "h-full w-full",
          "transition-all duration-300 ease-out"
        )}
        growScale={1.02}
        slope={16}
        innerBorderWidth={2}
      >
        <div className="flex flex-col h-full">
          {/* Image / Placeholder */}
          <div className="relative aspect-video overflow-hidden">
            {template.image ? (
              <>
                <Image
                  src={template.image}
                  alt={template.title}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
              </>
            ) : (
              <div className={cn(
                "absolute inset-0 bg-gradient-to-br",
                placeholderGradients[template.type]
              )}>
                <div className="absolute inset-0 flex items-center justify-center">
                  <LayoutTemplate className={cn("h-10 w-10", placeholderIcons[template.type])} />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col flex-1 p-6 pt-4">
            <ExaCardHeader className="p-0 mb-2">
              <div className="flex items-start justify-between gap-2">
                <ExaCardTitle
                  className={cn(
                    "text-lg font-semibold",
                    "transition-colors duration-300",
                    "group-hover:text-primary"
                  )}
                >
                  {template.title}
                </ExaCardTitle>
                <ExternalLink
                  className={cn(
                    "h-4 w-4 text-muted-foreground flex-shrink-0",
                    "opacity-0 transition-all duration-300",
                    "group-hover:opacity-100 group-hover:text-primary"
                  )}
                />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant="outline"
                  className={cn("text-xs", typeColors[template.type])}
                >
                  {typeLabels[template.type]}
                </Badge>
                <span className={cn(
                  "text-xs",
                  template.language === "TypeScript"
                    ? "text-[#3178C6]"
                    : "text-[#F7DF1E]"
                )}>
                  {template.language}
                </span>
              </div>
            </ExaCardHeader>

            <ExaCardContent className="p-0 mt-auto">
              <ExaCardDescription className="line-clamp-2 mb-2">
                {template.description}
              </ExaCardDescription>
              <p className="text-xs text-muted-foreground">
                By{" "}
                <span className={cn(
                  "font-semibold",
                  template.author === "WavePlay" && "bg-gradient-to-r from-blue-500 to-pink-500 bg-clip-text text-transparent"
                )}>
                  {template.author}
                </span>
              </p>
            </ExaCardContent>
          </div>
        </div>
      </ExaCard>
    </Link>
  )
}
