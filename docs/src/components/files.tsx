import {
	File as FumadocsFile,
	Files,
	Folder as FumadocsFolder,
	type FileProps as FumadocsFileProps,
	type FolderProps as FumadocsFolderProps
} from 'fumadocs-ui/components/files'
import { Braces, FileCode2, Globe, Image, Lock, Palette } from 'lucide-react'
import type { ReactNode } from 'react'

const FILE_ICONS: Record<string, typeof FileCode2> = {
	'.ts': FileCode2,
	'.tsx': FileCode2,
	'.js': FileCode2,
	'.mjs': FileCode2,
	'.json': Braces,
	'.html': Globe,
	'.css': Palette,
	'.png': Image,
	'.ico': Image,
	'.jpg': Image,
	'.svg': Image,
	'.env': Lock
}

function getFileIcon(name: string): ReactNode | undefined {
	// Handle dotfiles like ".env"
	if (FILE_ICONS[name]) {
		const Icon = FILE_ICONS[name]
		return <Icon />
	}

	const dotIndex = name.lastIndexOf('.')
	if (dotIndex === -1) {
		return undefined
	}

	const ext = name.slice(dotIndex)
	const Icon = FILE_ICONS[ext]
	return Icon ? <Icon /> : undefined
}

interface FileProps extends Omit<FumadocsFileProps, 'name'> {
	name: string
	note?: string
}

interface FolderProps extends Omit<FumadocsFolderProps, 'name'> {
	name: string
	note?: string
}

function File({ name, note, icon, className, ...rest }: FileProps) {
	const resolvedIcon = icon ?? getFileIcon(name)

	if (!note) {
		return <FumadocsFile name={name} icon={resolvedIcon} className={`cursor-default ${className ?? ''}`} {...rest} />
	}

	const nameWithNote = (
		<>
			{name}
			<span className="ml-auto text-xs text-fd-muted-foreground/60 font-normal">{note}</span>
		</>
	)

	return <FumadocsFile className={`cursor-default ${className ?? ''}`} icon={resolvedIcon} {...rest} name={nameWithNote as unknown as string} />
}

function Folder({ name, note, className, ...rest }: FolderProps) {
	if (!note) {
		return <FumadocsFolder name={name} className={`[&>button]:cursor-pointer ${className ?? ''}`} {...rest} />
	}

	const nameWithNote = (
		<>
			{name}
			<span className="ml-auto text-xs text-fd-muted-foreground/60 font-normal">{note}</span>
		</>
	)

	return <FumadocsFolder className={`[&>button]:cursor-pointer ${className ?? ''}`} {...rest} name={nameWithNote as unknown as string} />
}

export { File, Files, Folder }
