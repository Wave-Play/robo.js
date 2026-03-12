import type { BaseLayoutProps, LinkItemType } from "fumadocs-ui/layouts/shared"
import Image from "next/image"
import FrameworkPreview from "@/../public/fp.png"
import logo from "@/../public/logo.png"
import { AnimatedIconWrapper } from "@/components/ui/icons/animated-icon-wrapper"
import { Blocks, BookText, Connect, Discord, DiscordLogo, FileStack, PartyPopper, Rocket, Terminal } from "@/components/ui/icons"

/**
 * Shared layout configurations
 *
 * you can customise layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */

export const navLinks = [
  {
    text: "Documentation",
    url: "/docs",
    type: "menu",
    items: [
      {
        text: "Framework",
        icon: <AnimatedIconWrapper><Blocks className="p-1" /></AnimatedIconWrapper>,
        url: "/docs/framework",
        description:
          "Explore the core architecture of Robos, covering Bots, Activities, Websites, Plugins, and their interactions.",
        menu: {
          banner: (
            <div className="-mx-3 -mt-3">
              <Image
                src={FrameworkPreview}
                alt="FrameworkPreview"
                className="mask-b-from-80% brightness-125 aspect-video object-cover"
              />
            </div>
          ),
          className: "md:row-span-2",
        },
      },
      {
        text: "Bots",
        url: "/docs/bots",
        icon: <AnimatedIconWrapper><Discord className="p-1" /></AnimatedIconWrapper>,
        description: "Build powerful and interactive Discord bots.",
      },
      {
        text: "Activities",
        url: "/docs/activities",
        icon: <AnimatedIconWrapper><PartyPopper className="p-1" /></AnimatedIconWrapper>,
        description: "Develop custom, engaging and fun activities.",
      },
      {
        text: "CLI",
        url: "/docs/cli",
        icon: <AnimatedIconWrapper><Terminal className="p-1" /></AnimatedIconWrapper>,
        description: "CLI tools for managing your Robo.js projects.",
      },
      {
        text: "Hosting",
        url: "/docs/hosting",
        icon: <AnimatedIconWrapper><Rocket className="p-1" /></AnimatedIconWrapper>,
        description: "Deploy and host your Robo.js projects.",
      },
      {
        text: "Plugins",
        url: "/docs/plugins",
        icon: <AnimatedIconWrapper><Connect className="p-1" /></AnimatedIconWrapper>,
        description: "Browse and discover plugins for your Robo.",
      },
      {
        text: "Reference",
        url: "/docs/reference",
        icon: <AnimatedIconWrapper><BookText className="p-1" /></AnimatedIconWrapper>,
        description: "Access detailed technical documentation.",
      },
      {
        text: "Changelog",
        url: "/docs/changelog",
        icon: <AnimatedIconWrapper><FileStack className="p-1" /></AnimatedIconWrapper>,
        description: "Track every release across the ecosystem.",
      },
    ],
  },
  {
    text: "Changelog",
    url: "/docs/changelog",
    type: "main",
  },
  {
    text: "Blog",
    url: "https://dev.to/waveplay",
    type: "main",
  },
  {
    text: "Plugins",
    url: "/docs/plugins",
    type: "main",
  },
  {
    text: "Templates",
    url: "/docs/templates",
    type: "main",
  },
  {
    text: "Discord",
    url: "https://robojs.dev/discord",
    type: "icon",
    icon: <DiscordLogo className="mx-2" />,
    secondary: true,
  },
] satisfies LinkItemType[]

export const baseOptions = {
  nav: {
    title: (
      <>
        <span className="flex items-center gap-1">
          <Image src={logo} alt="Logo" className="size-6" />
          <span className="text-xl tracking-tighter">Robo.js</span>
        </span>
      </>
    ),
    transparentMode: "none",
  },
  githubUrl: "https://github.com/Wave-Play/robo.js",
  links: navLinks,
  themeSwitch: {
    mode: "light-dark-system",
  },
} satisfies BaseLayoutProps
