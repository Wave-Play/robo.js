import { atom, useAtom } from 'jotai'

const packageManagerAtom = atom('npm')

export function usePackageManager() {
	const [packageManager, setPackageManager] = useAtom(packageManagerAtom)

	return [packageManager, setPackageManager]
}
